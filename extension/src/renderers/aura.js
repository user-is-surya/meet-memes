// "Feel the aura": darkens the room, glows around your silhouette, sparkles rise.
// meme.json render: { type: 'aura', color, asset, position, size, caption, hold, lingerMs }
import { Effect } from './base.js';
import { scratch, personLayer, caption, faceRect, anchor, easeOutBack, clamp01 } from '../lib/draw.js';

export class AuraEffect extends Effect {
  static layer = 1;
  static needsMask = true;

  async load() {
    this.image = await this.deps.assets.load(this.def, this.r.asset);
    this.sparks = [];
  }

  render(ctx, env) {
    const { w, h, now } = env, t = now - this.startAt;
    const a = this.envelope(now);
    const color = this.r.color || '#b26bff';
    const pulse = 0.75 + 0.25 * Math.sin(t / 160);
    const mask = env.det && env.det.mask;
    const f = faceRect(env);
    const cx = f.x + f.w / 2;

    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.45 * a})`;
    ctx.fillRect(0, 0, w, h);

    if (mask) {
      const gw = Math.round(w / 4), gh = Math.round(h / 4);
      const glow = scratch('aura-glow', gw, gh);
      const g = glow.getContext('2d');
      g.globalCompositeOperation = 'copy';
      g.filter = 'blur(5px)';
      g.drawImage(mask, 0, 0, gw, gh);
      g.filter = 'none';
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, gw, gh);
      g.globalCompositeOperation = 'source-over';

      // Scale the glow up around the person (anchored at the bottom) so it spills outward.
      ctx.globalCompositeOperation = 'lighter';
      for (const s of [1.05, 1.12, 1.2]) {
        ctx.globalAlpha = a * pulse * (1.25 - s);
        ctx.drawImage(glow, cx * (1 - s), h * (1 - s), w * s, h * s);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(personLayer(env.src, mask, w, h), 0, 0);
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createRadialGradient(cx, f.y + f.h / 2, f.h * 0.3, cx, f.y + f.h / 2, f.h * 1.6);
      rg.addColorStop(0, color + '00');
      rg.addColorStop(0.5, color + 'aa');
      rg.addColorStop(1, color + '00');
      ctx.globalAlpha = a * pulse;
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawSparks(ctx, env, f, a, color);

    const pop = easeOutBack(clamp01(t / 350));
    ctx.globalAlpha = a;
    if (this.image) {
      const ih = (this.r.size ?? 0.35) * h, iw = ih * this.image.width / this.image.height;
      const p = anchor(this.r.position || 'bottom-right', iw, ih, env, this.info);
      ctx.drawImage(this.image.frameAt(t), p.x, p.y, iw, ih);
    }
    if (this.r.caption) {
      ctx.translate(w / 2, h * 0.12);
      ctx.scale(pop, pop);
      caption(ctx, this.r.caption, 0, 0, (this.r.captionSize ?? 0.11) * h, { glow: color });
    }
    ctx.restore();
  }

  drawSparks(ctx, env, f, a, color) {
    const { w, h, now } = env;
    const dt = Math.min(50, now - (this.lastT || now)) / 1000;
    this.lastT = now;
    if (this.sparks.length < 70) {
      for (let i = 0; i < 3; i++) {
        this.sparks.push({
          x: f.x + f.w / 2 + (Math.random() - 0.5) * f.w * 3,
          y: h * (0.6 + Math.random() * 0.4),
          vy: -(h * (0.15 + Math.random() * 0.25)),
          r: h * (0.003 + Math.random() * 0.006),
          life: 1,
        });
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    for (const s of this.sparks) {
      s.y += s.vy * dt;
      s.life -= dt * 0.7;
      ctx.globalAlpha = a * Math.max(0, s.life);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.sparks = this.sparks.filter((s) => s.life > 0 && s.y > -10);
    ctx.globalCompositeOperation = 'source-over';
  }
}
