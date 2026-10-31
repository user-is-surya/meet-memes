// Thanos snap: you crumble into dust and blow away, leaving the room behind.
// Snap again (or press the hotkey) to come back; you reassemble from the dust.
// meme.json render: { type: 'thanos', spreadMs, autoReturnMs, wind }
//
// The empty room comes from a "background plate": every detection, pixels the
// segmentation mask says are not you get copied into the plate, so it fills in
// as you move. Never-seen pixels start as a heavy blur of the first frame.
import { Effect } from './base.js';
import { scratch } from '../lib/draw.js';

export class ThanosEffect extends Effect {
  static layer = 0;
  static needsMask = true;

  constructor(def, deps) {
    super(def, deps);
    this.state = 'idle'; // idle | dusting | gone | returning
    this.pending = null;
  }

  get spread() { return this.r.spreadMs ?? 1800; }

  isActive() { return this.state !== 'idle' || this.pending !== null; }
  stop() { this.state = 'idle'; this.pending = null; }

  fire(info, now) {
    if (this.state === 'idle') this.pending = 'dust';
    else if (this.state === 'gone' || this.state === 'dusting') this.pending = 'return';
  }

  // Keep the background plate fresh while the mask is available.
  onDetect(det, src) {
    if (!det.mask || !src.width) return;
    const w = Math.round(src.width / 2), h = Math.round(src.height / 2);
    const plate = scratch('thanos-plate', w, h);
    const pctx = plate.getContext('2d');
    if (!this.plateReady || this.plateW !== w) {
      pctx.filter = 'blur(24px)';
      pctx.drawImage(src, 0, 0, w, h);
      pctx.filter = 'none';
      this.plateReady = true;
      this.plateW = w;
    }
    const tmp = scratch('thanos-tmp', w, h);
    const t = tmp.getContext('2d');
    t.globalCompositeOperation = 'copy';
    t.drawImage(src, 0, 0, w, h);
    // Erase a dilated copy of the person so their edges never leak into the plate.
    t.globalCompositeOperation = 'destination-out';
    const d = Math.max(3, Math.round(w / 90));
    for (const [ox, oy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
      t.drawImage(det.mask, ox, oy, w, h);
    }
    t.globalCompositeOperation = 'source-over';
    pctx.drawImage(tmp, 0, 0);
  }

  // Cut the person into cells and give each one a delay and a drift path.
  build(env) {
    const { w, h } = env;
    const cell = Math.max(6, Math.round(w / 120));
    const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    const mask = env.det && env.det.mask;

    const snap = scratch(this.pending === 'dust' ? 'thanos-snap' : 'thanos-return', w, h);
    const s = snap.getContext('2d');
    s.globalCompositeOperation = 'copy';
    s.drawImage(env.src, 0, 0, w, h);
    let alpha = null;
    if (mask) {
      s.globalCompositeOperation = 'destination-in';
      s.drawImage(mask, 0, 0, w, h);
      const small = scratch('thanos-mask-small', gw, gh);
      const m = small.getContext('2d', { willReadFrequently: true });
      m.clearRect(0, 0, gw, gh);
      m.drawImage(mask, 0, 0, gw, gh);
      alpha = m.getImageData(0, 0, gw, gh).data;
    }
    s.globalCompositeOperation = 'source-over';

    const scale = w / 1280, wind = this.r.wind ?? 1;
    const xs = [], ys = [], delay = [], vx = [], vy = [], ax = [], life = [], wob = [];
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        if (alpha && alpha[(gy * gw + gx) * 4 + 3] < 110) continue;
        const nx = gx / gw, ny = gy / gh;
        xs.push(gx * cell); ys.push(gy * cell);
        // Crumbles from the right side across the body, with noise, like the film.
        delay.push((0.7 * (1 - nx) + 0.3 * ny) * this.spread + Math.random() * 450);
        vx.push(-(70 + Math.random() * 170) * scale * wind);
        vy.push(-(30 + Math.random() * 90) * scale);
        ax.push(-(40 + Math.random() * 80) * scale * wind);
        life.push(900 + Math.random() * 1100);
        wob.push(Math.random() * Math.PI * 2);
      }
    }
    let total = 0;
    for (let i = 0; i < delay.length; i++) total = Math.max(total, delay[i] + life[i]);
    this.p = { snap, cell, xs, ys, delay, vx, vy, ax, life, wob, total, scale };
  }

  drawPlate(ctx, env) {
    if (this.plateReady) ctx.drawImage(scratch('thanos-plate', Math.round(env.w / 2), Math.round(env.h / 2)), 0, 0, env.w, env.h);
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, env.w, env.h); }
  }

  drawDust(ctx, t) {
    const { snap, cell, xs, ys, delay, vx, vy, ax, life, wob, scale } = this.p;
    for (let i = 0; i < xs.length; i++) {
      const tau = t - delay[i];
      if (tau <= 0) {
        ctx.globalAlpha = 1;
        ctx.drawImage(snap, xs[i], ys[i], cell, cell, xs[i], ys[i], cell, cell);
      } else if (tau < life[i]) {
        const k = tau / life[i], s = tau / 1000;
        const x = xs[i] + vx[i] * s + 0.5 * ax[i] * s * s;
        const y = ys[i] + vy[i] * s + Math.sin(wob[i] + s * 4) * 8 * scale;
        const size = cell * (1 - 0.65 * k);
        ctx.globalAlpha = (1 - k) * (1 - k);
        ctx.drawImage(snap, xs[i], ys[i], cell, cell, x, y, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  render(ctx, env) {
    const now = env.now;
    if (this.pending) {
      this.state = this.pending === 'dust' ? 'dusting' : 'returning';
      this.build(env);
      this.pending = null;
      this.t0 = now;
    }
    const t = now - this.t0;
    this.drawPlate(ctx, env);

    if (this.state === 'dusting') {
      this.drawDust(ctx, t);
      if (t >= this.p.total) { this.state = 'gone'; this.goneAt = now; }
    } else if (this.state === 'gone') {
      const auto = this.r.autoReturnMs ?? 20000;
      if (auto > 0 && now - this.goneAt > auto) this.pending = 'return';
    } else if (this.state === 'returning') {
      // Same animation played backwards, built from your live silhouette.
      this.drawDust(ctx, Math.max(0, this.p.total - t * 1.6));
      if (t * 1.6 >= this.p.total) this.state = 'idle';
    }
  }
}
