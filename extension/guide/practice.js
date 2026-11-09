// Practice tab: your camera + the same detector and trigger code the extension uses on
// Meet. Shows a live recognition meter, can play the real effect locally, and records
// detection traces (landmarks only) for tuning.
import { createDetector } from '../engine/detector.js';
import { createTrigger, TriggerArbiter } from '../src/triggers/index.js';
import { createEffect } from '../src/renderers/index.js';
import { AssetStore } from '../src/content/assets.js';
import { SnapListener } from '../src/content/audio.js';
import { Compositor } from '../src/gfx/compositor.js';
import { TraceRecorder } from '../src/shared/trace.js';

const $ = (id) => document.getElementById(id);
const DETECT_WIDTH = 640;
const RECENT_FACE_MS = 1500;

// Fetches bundled files directly (we're on an extension page, no engine iframe needed).
const localEngine = {
  async fetchBytes(path) {
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) return null;
    return { bytes: await res.arrayBuffer(), mime: res.headers.get('content-type') || '' };
  },
};

function download(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export class Practice {
  constructor(defs) {
    this.defs = defs.filter((d) => d.trigger);
    this.selected = this.defs[0] && this.defs[0].id;
    this.running = false;
    this.det = { hands: [], face: null, mask: null, aspect: 16 / 9, t: 0 };
    this.lastFace = null;
    this.lastFaceAt = -Infinity;
    this.recorder = new TraceRecorder();
    this.recording = null;
    const q = new URLSearchParams(location.search);
    this.recordSeconds = Number(q.get('recordSeconds')) || 0;
  }

  mount() {
    const sel = $('practice-meme');
    for (const d of this.defs) sel.add(new Option(d.name, d.id));
    sel.value = this.selected;
    sel.addEventListener('change', () => this.select(sel.value));
    $('practice-start').addEventListener('click', () => (this.running ? this.stop() : this.start()));
    $('practice-try').addEventListener('click', () => this.tryIt());
    $('record-gesture').addEventListener('click', () => this.startRecording('gesture'));
    $('record-normal').addEventListener('click', () => this.startRecording('normal'));
    $('record-stop').addEventListener('click', () => this.stopRecording());
    // Same hotkeys as in Meet: Alt+Shift+1..8 play that meme here.
    window.addEventListener('keydown', (e) => {
      const m = e.altKey && e.shiftKey && !e.ctrlKey && /^Digit([1-9])$/.exec(e.code);
      if (!m) return;
      const def = this.defs.find((d) => d.hotkey === 'Alt+Shift+' + m[1]);
      if (!def) return;
      e.preventDefault();
      if (this.selected !== def.id) this.select(def.id);
      this.tryIt();
    });
    this.select(this.selected);
  }

  select(id) {
    this.selected = id;
    $('practice-meme').value = id;
    const def = this.defs.find((d) => d.id === id);
    if (!def) return;
    $('practice-hint').textContent = def.how || '';
    $('record-gesture').textContent = `⏺ Record: do “${def.name}” 5 times`;
    this.audio = this.audio || new SnapListener();
    this.trigger = createTrigger(def.trigger, { audio: () => (this.audio.running ? this.audio : null) });
    this.arbiter = new TriggerArbiter({ quietMs: 1200 });
    // Create the effect right away, so it can prepare while you practise (Thanos learns your
    // room, laser eyes track your irises) before it ever fires.
    this.assets = this.assets || new AssetStore(localEngine);
    this.effect = createEffect(def, { assets: this.assets, toast: (t) => { $('practice-hint').textContent = t; } });
    if (this.effect) this.effect.load().catch(() => {});
  }

  setStatus(state, text) {
    const s = $('practice-status');
    s.dataset.state = state;
    s.textContent = text;
  }

  async start() {
    this.setStatus('loading', 'Starting camera…');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      const v = $('practice-video');
      v.srcObject = this.stream;
      await v.play();
      this.setStatus('loading', 'Loading gesture detection…');
      this.detector = this.detector || createDetector();
      await this.detector.ready;
      this.compositor = this.compositor || new Compositor($('practice-stage'));
      this.raw = this.raw || new OffscreenCanvas(2, 2);
      if ($('practice-mic').checked) this.audio.start();
      this.assets = this.assets || new AssetStore(localEngine);
      $('practice-empty').hidden = true;
      this.running = true;
      $('practice-start').textContent = '⏹ Stop camera';
      this.loop();
    } catch (err) {
      console.error(err);
      this.setStatus('error', 'Could not start: ' + (err.message || err));
    }
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.audio.stop();
    $('practice-empty').hidden = false;
    $('practice-start').textContent = '📷 Start camera';
    this.setStatus('idle', 'Stopped');
  }

  async loop() {
    const v = $('practice-video');
    let lastSpike = -Infinity;
    while (this.running) {
      const now = performance.now();
      if (v.videoWidth) {
        const raw = this.raw;
        if (raw.width !== v.videoWidth || raw.height !== v.videoHeight) { raw.width = v.videoWidth; raw.height = v.videoHeight; }
        raw.getContext('2d', { alpha: false }).drawImage(v, 0, 0);
        // Practise in selfie view, like a mirror.
        const frame = this.compositor.frameFor(raw, true);
        const bmp = await createImageBitmap(frame, { resizeWidth: DETECT_WIDTH, resizeHeight: Math.round(DETECT_WIDTH * frame.height / frame.width), resizeQuality: 'low' });
        let res;
        try { res = await this.detector.detect(bmp, { mask: !!(this.effect && this.effect.needsMask) }); } finally { bmp.close(); }
        this.onResult(res, frame, now);
        const spikes = [];
        if (this.audio.lastSpikeAt > lastSpike) { lastSpike = this.audio.lastSpikeAt; spikes.push(lastSpike); }
        if (this.recording) this.recorder.push(this.det, now, spikes);
        this.render(frame, now);
        if (this.det.hands.length || this.det.face) this.setStatus('running', this.recording ? '⏺ Recording…' : 'Camera on: detecting');
        else this.setStatus('running', 'Camera on: step into view');
      }
      await new Promise((r) => setTimeout(r, 15));
    }
  }

  onResult(res, frame, now) {
    if (res.face) { this.lastFace = res.face; this.lastFaceAt = now; }
    if (this.det.mask && this.det.mask !== res.mask) this.det.mask.close();
    this.det = {
      hands: res.hands || [],
      face: res.face || (now - this.lastFaceAt < RECENT_FACE_MS ? this.lastFace : null),
      mask: res.mask || null,
      aspect: frame.width / frame.height,
      t: now,
    };
    if (this.effect) this.effect.onDetect(this.det, frame);
    if (!this.trigger) return;
    const r = this.trigger.update(this.det, now);
    const { fire } = this.arbiter.decide([{ id: this.selected, priority: 1, active: r.active, progress: r.progress, cooldownUntil: 0 }], now);
    const fill = $('practice-meter');
    fill.style.width = Math.round((r.active ? 1 : r.progress) * 100) + '%';
    fill.classList.toggle('done', r.active);
    if (fire) {
      this.firedAt = now;
      $('practice-hint').textContent = '✅ Recognised! That’s the gesture.';
      if (this.effect) this.effect.fire(r.info, now);
    } else if (now - (this.firedAt || -Infinity) > 1500) {
      const def = this.defs.find((d) => d.id === this.selected);
      $('practice-hint').textContent = def ? def.how : '';
    }
    if (this.effect) this.effect.setHeld(r.active, now);
  }

  render(frame, now) {
    const c = this.compositor;
    const g = c.begin(frame, { now, mask: this.det.mask });
    g.drawFrame();
    if (this.effect && this.effect.isActive(now)) {
      try {
        this.effect.renderGL(g, { w: frame.width, h: frame.height, now, src: frame, det: this.det, g, quality: c.quality, mirror: true });
      } catch (err) { console.warn('[practice] effect failed', err); this.effect.stop(); }
    }
    c.end();
    this.drawOverlay();
  }

  drawOverlay() {
    const o = $('practice-overlay');
    const r = o.getBoundingClientRect();
    if (o.width !== Math.round(r.width) || o.height !== Math.round(r.height)) { o.width = Math.round(r.width); o.height = Math.round(r.height); }
    const g = o.getContext('2d');
    g.clearRect(0, 0, o.width, o.height);
    g.fillStyle = 'rgba(167,139,250,.9)';
    for (const h of this.det.hands) {
      for (const p of h.landmarks) { g.beginPath(); g.arc(p.x * o.width, p.y * o.height, 3, 0, Math.PI * 2); g.fill(); }
    }
    const f = this.det.face;
    if (f) {
      g.strokeStyle = 'rgba(74,222,128,.7)';
      g.lineWidth = 2;
      g.strokeRect(f.box.x * o.width, f.box.y * o.height, f.box.w * o.width, f.box.h * o.height);
    }
  }

  async tryIt() {
    const def = this.defs.find((d) => d.id === this.selected);
    if (!def) return;
    if (!this.running) await this.start();
    if (!this.effect || this.effect.def.id !== def.id) this.select(def.id);
    if (this.effect) this.effect.fire({ hand: { x: 0.5, y: 0.6 } }, performance.now(), { hotkey: true });
  }

  async startRecording(kind) {
    if (!this.running) await this.start();
    if (!this.running) return;
    const def = this.defs.find((d) => d.id === this.selected);
    const label = kind === 'gesture' ? `gesture-${def.id}` : `normal-${Date.now()}`;
    this.recorder.start(label, this.det.aspect || 16 / 9, { mic: this.audio.running });
    this.recorder.trace.mirrored = true;
    this.recording = { kind, label, startedAt: performance.now() };
    const secs = this.recordSeconds || (kind === 'gesture' ? 60 : 120);
    $('record-stop').disabled = false;
    $('record-gesture').disabled = $('record-normal').disabled = true;
    const tick = () => {
      if (!this.recording) return;
      const left = Math.max(0, secs - (performance.now() - this.recording.startedAt) / 1000);
      $('record-status').textContent = kind === 'gesture'
        ? `⏺ Do “${def.name}” 5 times, relaxing in between. ${Math.ceil(left)} s left (or press Stop when done).`
        : `⏺ Act normal: talk, nod, laugh, drink, wave… ${Math.ceil(left)} s left.`;
      if (left <= 0) this.stopRecording(); else setTimeout(tick, 250);
    };
    tick();
  }

  stopRecording() {
    if (!this.recording) return;
    const { label } = this.recording;
    this.recording = null;
    const trace = this.recorder.stop();
    $('record-stop').disabled = true;
    $('record-gesture').disabled = $('record-normal').disabled = false;
    $('record-status').textContent = `Saved ${label}.json (${trace.frames.length} frames). Thanks!`;
    download(label + '.json', trace);
  }
}
