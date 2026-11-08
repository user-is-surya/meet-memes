// The Thanos snap's states and timing (pure, testable).
//   idle -> snap -> pause (the movie's beat of silence) -> dissolving -> gone
//   gone/dissolving -> snap (or auto after autoReturnMs gone) -> returning -> idle
export const PAUSE_MS = 800;
export const DISSOLVE_MS = 3000;
export const RETURN_MS = 1500;

export class ThanosTimeline {
  constructor({ autoReturnMs = 20000 } = {}) {
    this.autoReturnMs = autoReturnMs;
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.at = 0;
    this.pendingSnap = null;
  }

  snap(now) { this.pendingSnap = now; }

  // -> { state, progress (0..1 within the state), justEntered }
  update(now) {
    const prev = this.state;
    if (this.pendingSnap !== null) {
      const t = this.pendingSnap;
      this.pendingSnap = null;
      if (this.state === 'idle') this.enter('pause', t);
      else if (this.state === 'dissolving' || this.state === 'gone') this.enter('returning', t);
    }
    let el = now - this.at;
    if (this.state === 'pause' && el >= PAUSE_MS) { this.enter('dissolving', this.at + PAUSE_MS); el = now - this.at; }
    if (this.state === 'dissolving' && el >= DISSOLVE_MS) { this.enter('gone', this.at + DISSOLVE_MS); el = now - this.at; }
    if (this.state === 'gone' && el >= this.autoReturnMs) { this.enter('returning', this.at + this.autoReturnMs); el = now - this.at; }
    if (this.state === 'returning' && el >= RETURN_MS) { this.enter('idle', this.at + RETURN_MS); el = 0; }
    const dur = { pause: PAUSE_MS, dissolving: DISSOLVE_MS, returning: RETURN_MS }[this.state];
    return { state: this.state, progress: dur ? Math.min(1, Math.max(0, el / dur)) : 0, justEntered: prev !== this.state };
  }

  enter(state, at) { this.state = state; this.at = at; }
}
