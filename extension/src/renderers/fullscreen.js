// The meme takes over the whole frame for a moment.
// meme.json render: { type: 'fullscreen', asset, fit: 'contain'|'cover', background, caption, durationMs }
// Without an asset it falls back to a "sad" look: slow zoom on your face, desaturated and blue.
import { Effect } from './base.js';
import { fitRect, caption, faceRect } from '../lib/draw.js';

export class FullscreenEffect extends Effect {
  static layer = 2;

  async load() {
    this.image = await this.deps.assets.load(this.def, this.r.asset);
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
