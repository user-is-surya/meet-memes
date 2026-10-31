// Your live face composited into a poster (Absolute Cinema).
// meme.json render: {
//   type: 'face-in-frame', asset: 'poster.png',
//   faceSlot: { x, y, w, h },   // slot centre + size, as fractions of the poster
//   faceShape: 'ellipse'|'rect', faceFilter: 'grayscale(1)', facePadding: 1.5,
//   caption, hold, lingerMs
// }
// Without a poster it renders a built-in black-and-white "cinema" look.
import { Effect } from './base.js';
import { fitRect, caption, faceRect } from '../lib/draw.js';

export class FaceInFrameEffect extends Effect {
  static layer = 2;

  async load() {
    this.image = await this.deps.assets.load(this.def, this.r.asset);
  }

  // Crop around the face matching the slot's aspect ratio.
  faceCrop(env, aspect) {
    const f = faceRect(env);
    const pad = this.r.facePadding ?? 1.5;
    let ch = f.h * pad, cw = ch * aspect;
    if (cw < f.w * pad) { cw = f.w * pad; ch = cw / aspect; }
    return { x: f.x + f.w / 2 - cw / 2, y: f.y + f.h / 2 - ch / 2 - f.h * 0.05, w: cw, h: ch };
  }

  render(ctx, env) {
    ctx.save();
    ctx.globalAlpha = this.envelope(env.now);
    if (this.image) this.renderPoster(ctx, env);
    else this.renderCinema(ctx, env);
    ctx.restore();
  }

  renderPoster(ctx, env) {
    const { w, h } = env, t = env.now - this.startAt;
    const slot = this.r.faceSlot || { x: 0.5, y: 0.45, w: 0.3, h: 0.4 };
    ctx.fillStyle = this.r.background || '#000';
    ctx.fillRect(0, 0, w, h);
    const p = fitRect(this.image.width, this.image.height, w, h, this.r.fit || 'contain');
    ctx.drawImage(this.image.frameAt(t), p.x, p.y, p.w, p.h);

    const sw = slot.w * p.w, sh = slot.h * p.h;
    const sx = p.x + slot.x * p.w - sw / 2, sy = p.y + slot.y * p.h - sh / 2;
    const crop = this.faceCrop(env, sw / sh);
    ctx.save();
    ctx.beginPath();
    if (this.r.faceShape === 'rect') ctx.rect(sx, sy, sw, sh);
    else ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.filter = this.r.faceFilter || 'none';
    ctx.drawImage(env.src, crop.x, crop.y, crop.w, crop.h, sx, sy, sw, sh);
    ctx.restore();
    if (this.r.caption) caption(ctx, this.r.caption, w / 2, h * (this.r.captionY ?? 0.9), (this.r.captionSize ?? 0.09) * h);
  }

  renderCinema(ctx, env) {
    const { w, h } = env, t = env.now - this.startAt;
    const f = faceRect(env);
    const zoom = 1.12 + Math.min(1, t / 4000) * 0.08;
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.filter = this.r.faceFilter || 'grayscale(1) contrast(1.25) brightness(1.05)';
    ctx.translate(w / 2, h * 0.45);
    ctx.scale(zoom, zoom);
    ctx.drawImage(env.src, -cx, -cy, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';

    const g = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.25, w / 2, h * 0.45, h * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const bar = h * 0.12;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar * 1.6, w, bar * 1.6);
    caption(ctx, this.r.caption || 'ABSOLUTE CINEMA', w / 2, h - bar * 0.8, h * 0.085, {
      font: "'Times New Roman', Georgia, serif", weight: 700, stroke: false, letterSpacing: 0.18,
    });
  }
}
