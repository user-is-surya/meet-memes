// Fanum-style throw: projectiles fly out of your hand toward the camera and splat,
// with the meme image popping up alongside.
// meme.json render: { type: 'throw', projectile, projectileEmoji, count, asset, position, size, caption, durationMs }
import { Effect } from './base.js';
import { anchor, caption, easeOutBack, clamp01, emojiImage } from '../lib/draw.js';

const FLIGHT_MS = 650;
const SPLAT_MS = 500;

export class ThrowEffect extends Effect {
  static layer = 3;

  async load() {
    [this.image, this.projectile] = await Promise.all([
      this.deps.assets.load(this.def, this.r.asset),
      this.deps.assets.load(this.def, this.r.projectile),
    ]);
  }

  fire(info, now, opts) {
    super.fire(info, now, opts);
    const n = this.r.count ?? 3;
    const from = (info && info.hand) || { x: 0.5, y: 0.6 };
    const dir = (info && info.dir) || { x: 0, y: -1 };
    this.shots = Array.from({ length: n }, (_, i) => ({
      delay: i * 170,
      from,
      to: {
        x: clamp01(0.5 + dir.x * 0.15 + (Math.random() - 0.5) * 0.5),
        y: clamp01(0.45 + (Math.random() - 0.5) * 0.4),
      },
      spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6),
      size: 0.55 + Math.random() * 0.35,
    }));
  }

  render(ctx, env) {
    const { w, h, now } = env, t = now - this.startAt;
    const a = this.envelope(now);
    const img = this.projectile || emojiImage(this.r.projectileEmoji || '🥦');
    ctx.save();

    for (const s of this.shots || []) {
      const st = t - s.delay;
      if (st < 0 || st > FLIGHT_MS + SPLAT_MS) continue;
      const p = clamp01(st / FLIGHT_MS);
      const x = (s.from.x + (s.to.x - s.from.x) * p) * w;
      const y = (s.from.y + (s.to.y - s.from.y) * p) * h - Math.sin(p * Math.PI) * h * 0.12;
      const size = h * (0.08 + (s.size - 0.08) * p * p);
      ctx.globalAlpha = st > FLIGHT_MS ? 1 - (st - FLIGHT_MS) / SPLAT_MS : 1;
      ctx.translate(x, y);
      ctx.rotate(st > FLIGHT_MS ? s.spin : s.spin * p);
      const ph = size * img.height / img.width;
      ctx.drawImage(img.frameAt(st), -size / 2, -ph / 2, size, ph);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    ctx.globalAlpha = a;
    const pop = easeOutBack(clamp01(t / 300));
    if (this.image) {
      const ih = (this.r.size ?? 0.42) * h, iw = ih * this.image.width / this.image.height;
      const p = anchor(this.r.position || 'bottom-left', iw, ih, env, this.info);
      ctx.translate(p.x + iw / 2, p.y + ih / 2);
      ctx.scale(pop, pop);
      ctx.drawImage(this.image.frameAt(t), -iw / 2, -ih / 2, iw, ih);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (this.r.caption) caption(ctx, this.r.caption, w / 2, h * 0.12, (this.r.captionSize ?? 0.1) * h);
    ctx.restore();
  }
}
