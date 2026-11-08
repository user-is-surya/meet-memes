// Shared timing for effects. Two modes, from meme.json `render`:
// - one-shot (default): plays for durationMs after it fires
// - hold (render.hold = true): stays while the pose is held, plus lingerMs after release
import { clamp01 } from '../lib/draw.js';

export class Effect {
  // Draw order: 0 replaces the person, 1 decorates the person, 2 replaces the frame, 3 sits on top.
  static layer = 3;
  static needsMask = false;

  constructor(def, deps) {
    this.def = def;
    this.r = def.render || {};
    this.deps = deps;
    this.startAt = -1;
    this.held = false;
    this.releasedAt = -1;
    this.forcedUntil = 0;
    this.info = null;
  }

  get layer() { return this.constructor.layer; }
  get needsMask() { return this.constructor.needsMask; }
  get duration() { return this.r.durationMs ?? 3000; }
  get fadeMs() { return this.r.fadeMs ?? 250; }

  async load() {}

  get soundKey() { return this.def.id + ':' + (this.def.sound || ''); }

  playSound() {
    const sfx = this.deps && this.deps.sfx;
    if (!sfx || !this.def.sound) return;
    this.stopSound();
    this.voice = sfx.play(this.soundKey, { volume: this.r.soundVolume ?? 1, loop: !!this.r.soundLoop });
  }

  stopSound() {
    if (this.voice) { this.voice.stop(); this.voice = null; }
  }

  // Called once when the effect stops showing (looping sounds end here).
  onEnd() {
    if (this.r.soundLoop) this.stopSound();
  }

  fire(info, now, { hotkey = false } = {}) {
    if (!this.r.soundAt) this.playSound();
    this.startAt = now;
    this.info = info || {};
    this.held = !hotkey && !!this.r.hold;
    this.forcedUntil = hotkey && this.r.hold ? now + this.duration : 0;
  }

  setHeld(held, now) {
    // Only an effect that is currently showing can be held; a finished one needs a fresh fire().
    if (!this.r.hold || this.startAt < 0 || (!this.held && !this.isActive(now))) return;
    if (this.held && !held) this.releasedAt = now;
    this.held = held;
  }

  endTime() {
    if (!this.r.hold) return this.startAt + this.duration;
    if (this.held) return Infinity;
    return Math.max(this.releasedAt + (this.r.lingerMs ?? 1200), this.startAt + (this.r.minMs ?? 1500), this.forcedUntil);
  }

  isActive(now) {
    return this.startAt >= 0 && now < this.endTime();
  }

  stop() { this.startAt = -1; this.held = false; this.stopSound(); }

  // 0..1 fade in at the start and out at the end.
  envelope(now) {
    const fin = clamp01((now - this.startAt) / this.fadeMs);
    const end = this.endTime();
    const fout = end === Infinity ? 1 : clamp01((end - now) / this.fadeMs);
    return Math.min(fin, fout);
  }

  onDetect() {}

  // New effects override renderGL(g, env) and draw with the graphics API (src/gfx/graphics.js).
  // Older Canvas2D effects implement render(ctx, env); they run on a transparent overlay.
  renderGL(g, env) {
    g.draw2D((ctx) => this.render(ctx, env));
  }

  render() {}
}
