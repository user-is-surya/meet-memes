// The meme takes over the whole frame for a moment.
// meme.json render: { type: 'fullscreen', asset | clip, fit: 'contain'|'cover', background, caption, durationMs,
//                     minMs, releaseMs }
// With a clip (bundled memes): the clip plays full-screen ("contain") over a darkened copy of
// your video (never blurred), with sound. Lower your hands and it ends releaseMs later
// (but never before minMs). Without a clip/asset it falls back to a "sad" look.
import { Effect } from './base.js';
import { ClipPlayer } from '../content/clip-player.js';
import { fitRect, caption, faceRect, clamp01 } from '../lib/draw.js';

export class FullscreenEffect extends Effect {
  static layer = 2;

  async load() {
    if (this.r.clip) {
      this.clip = new ClipPlayer((p) => this.deps.assets.engine.fetchBytes(p));
      await this.clip.load((this.def.base || '') + this.r.clip);
      return;
    }
    this.image = await this.deps.assets.load(this.def, this.r.asset);
  }

  get clipMode() { return !!(this.r.clip && this.clip && this.clip.ready); }

  fire(info, now, opts = {}) {
    super.fire(info, now, opts);
    this.hotkeyFired = !!opts.hotkey;
    this.released = null;
    this.everHeld = false;
    if (this.clip && this.clip.ready) this.clip.start(now);
  }

  setHeld(held, now) {
    if (!this.clipMode) return super.setHeld(held, now);
    if (this.startAt < 0) return;
    if (held) { this.everHeld = true; this.released = null; } else if (this.everHeld && this.released === null) this.released = now;
  }

  endTime() {
    if (!this.clipMode) return super.endTime();
    const full = this.startAt + this.clip.duration + 150;
    if (this.hotkeyFired || this.released === null) return full;
    const early = Math.max(this.startAt + (this.r.minMs ?? 1500), this.released + (this.r.releaseMs ?? 1000));
    return Math.min(full, early);
  }

  renderGL(g, env) {
    if (!this.clipMode) return super.renderGL(g, env);
    const now = env.now, a = this.envelope(now);
    g.drawFrame({ brightness: 1 - 0.65 * a, contrast: 1 - 0.4 * a, saturation: 1 - 0.5 * a });
    const frame = this.clip.frameAt(now);
    if (!frame) return;
    const ar = (this.clip.width / this.clip.height) / (env.w / env.h);
    const w = ar > 1 ? 1 : ar, h = ar > 1 ? 1 / ar : 1;
    const s = 0.94 + 0.06 * clamp01((now - this.startAt) / 200);
    g.drawImage(frame, 0.5 - (w * s) / 2, 0.5 - (h * s) / 2, w * s, h * s, { alpha: a, key: 'clip:' + this.def.id });
  }

  render(ctx, env) {
    const t = env.now - this.startAt;
    const { w, h } = env;
    ctx.save();
    ctx.globalAlpha = this.envelope(env.now);

    if (this.image) {
      ctx.fillStyle = this.r.background || '#000';
      ctx.fillRect(0, 0, w, h);
      const r = fitRect(this.image.width, this.image.height, w, h, this.r.fit || 'contain');
      ctx.drawImage(this.image.frameAt(t), r.x, r.y, r.w, r.h);
    } else {
      const f = faceRect(env);
      const zoom = 1 + Math.min(1, t / this.duration) * 0.6;
      const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
      ctx.filter = 'grayscale(0.85) contrast(1.1) brightness(0.85)';
      ctx.translate(w / 2, h / 2);
      ctx.scale(zoom, zoom);
      ctx.drawImage(env.src, -cx, -cy, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(20, 40, 90, 0.35)';
      ctx.fillRect(0, 0, w, h);
    }

    const text = this.r.caption || (!this.image && this.r.fallbackText);
    if (text) caption(ctx, text, w / 2, h * (this.r.captionY ?? 0.88), (this.r.captionSize ?? 0.1) * h);
    ctx.restore();
  }
}
