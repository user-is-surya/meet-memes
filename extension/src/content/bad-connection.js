// Bad connection utility (content script side). Toggled by Alt+Shift+B, the pill or the
// popup; never remembered across page loads. Video degradation runs on the output canvas
// (see ../fx/bad-connection.js); audio degradation runs in the MAIN-world mic mixer and is
// switched by window.postMessage({ __mm: 'badconn', on }).
import { BadConnSchedule, renderBadConnection } from '../fx/bad-connection.js';

const COUNTDOWN_MS = 5000;

// Meet's red "Leave call" button: by aria-label (English and common wordings), else the
// button showing the call_end icon (Meet's icon font renders that ligature in every language).
export function findLeaveButton(doc = document) {
  const list = [...doc.querySelectorAll('button, [role="button"]')];
  return list.find((b) => /leave call|leave meeting|hang up/i.test(b.getAttribute('aria-label') || ''))
    || list.find((b) => /\bcall_end\b/.test(b.textContent || ''))
    || null;
}

export function clickLeave(doc = document) {
  const b = findLeaveButton(doc);
  if (!b) return false;
  b.click();
  return true;
}

export class BadConnection {
  // getSettings() -> settings; post(msg) -> window.postMessage; toast(text); leave() -> bool
  constructor({ getSettings, post, toast, leave = clickLeave }) {
    Object.assign(this, { getSettings, post, toast, leave });
    this.schedule = null;
    this.state = {};
    this.startedAt = -1;
  }

  get active() { return !!this.schedule && this.schedule.active; }
  get kind() { return this.getSettings().badConnKind || 'both'; }
  get videoOn() { return this.active && this.kind !== 'audio'; }
  get audioOn() { return this.active && this.kind !== 'video'; }

  toggle(now = performance.now()) {
    if (this.active) this.stop();
    else this.start(now);
  }

  start(now = performance.now()) {
    if (this.getSettings().activeMode === 'off') {
      this.toast('Turn Meet Memes on first (Alt+Shift+0), then try again.');
      return;
    }
    this.schedule = new BadConnSchedule();
    this.schedule.start(now);
    this.state = {};
    this.startedAt = now;
    this.lastCount = null;
    this.post({ __mm: 'badconn', on: this.audioOn });
    const sec = this.getSettings().badConnAutoLeaveSec || 0;
    const what = { video: 'video', audio: 'audio', both: 'video and audio' }[this.kind];
    this.toast(`📶 Bad connection on (${what})${sec ? `, auto-leave in ${sec} s` : ''}. Alt+Shift+B stops it.`);
  }

  stop({ quiet = false } = {}) {
    if (!this.schedule) return;
    this.schedule.stop();
    this.schedule = null;
    this.state = {};
    this.post({ __mm: 'badconn', on: false });
    if (!quiet) this.toast('📶 Connection back to normal');
  }

  // Settings changed while running (kind switched, or turned Off).
  sync() {
    if (!this.active) return;
    if (this.getSettings().activeMode === 'off') { this.stop({ quiet: true }); return; }
    this.post({ __mm: 'badconn', on: this.audioOn });
  }

  // Auto-leave countdown. Call a few times a second while active.
  tick(now = performance.now()) {
    if (!this.active) return;
    const sec = this.getSettings().badConnAutoLeaveSec || 0;
    if (!sec) return;
    const leaveAt = this.startedAt + sec * 1000;
    if (now >= leaveAt) {
      this.stop({ quiet: true });
      if (!this.leave()) this.toast("Couldn't find Meet's Leave button. Leave the call yourself.");
      return;
    }
    if (now >= leaveAt - COUNTDOWN_MS) {
      const left = Math.ceil((leaveAt - now) / 1000);
      if (left !== this.lastCount) {
        this.lastCount = left;
        this.toast(`📶 Leaving in ${left}… (Alt+Shift+B cancels)`);
      }
    }
  }

  // This frame's decision; posts an audio burst when a long freeze starts.
  decide(now, w, h) {
    if (!this.videoOn) return null;
    const f = this.schedule.step(now, { w, h });
    if (f.burstMs && this.audioOn) this.post({ __mm: 'badconn-burst', ms: f.burstMs });
    return f;
  }

  // Degrade the finished output frame in `ctx` (2D context of the output canvas).
  apply(ctx, w, h, now) {
    const f = this.decide(now, w, h);
    if (f) renderBadConnection(ctx, w, h, f, this.state);
  }
}
