// A meme image/GIF that pops up somewhere on the frame, with an optional caption.
// meme.json render: { type: 'overlay', asset, position, size, caption, captionSize, durationMs }
import { Effect } from './base.js';
import { anchor, caption, easeOutBack, clamp01 } from '../lib/draw.js';

export class OverlayEffect extends Effect {
  static layer = 3;

  async load() {
    this.image = await this.deps.assets.load(this.def, this.r.asset);
  }

  render(ctx, env) {
    const t = env.now - this.startAt;
    const a = this.envelope(env.now);
    const pop = this.r.animation === 'fade' ? 1 : easeOutBack(clamp01(t / 300));
    const size = (this.r.size ?? 0.45) * env.h;
    ctx.save();
    ctx.globalAlpha = a;

    if (this.image) {
      const ih = size, iw = ih * this.image.width / this.image.height;
      const p = anchor(this.r.position || 'center', iw, ih, env, this.info);
      const cx = p.x + iw / 2, cy = p.y + ih / 2;
      ctx.translate(cx, cy);
      ctx.scale(pop, pop);
      ctx.drawImage(this.image.frameAt(t), -iw / 2, -ih / 2, iw, ih);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.r.caption) caption(ctx, this.r.caption, cx, Math.min(env.h - size * 0.12, p.y + ih + size * 0.1), (this.r.captionSize ?? 0.09) * env.h);
    } else {
      const text = this.r.fallbackText || this.r.caption || this.def.name;
      const fs = (this.r.captionSize ?? 0.16) * env.h;
      const p = anchor(this.r.position || 'center', fs * 4, fs * 1.2, env, this.info);
      ctx.translate(p.x + fs * 2, p.y + fs * 0.6);
      ctx.scale(pop, pop);
      ctx.rotate(-0.06);
      caption(ctx, text, 0, 0, fs, { glow: this.r.glow });
    }
    ctx.restore();
  }
}
