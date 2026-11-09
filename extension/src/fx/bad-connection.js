// Fake bad connection, video side. BadConnSchedule decides, frame by frame, what a
// struggling video call would show; renderBadConnection() applies it to the output canvas.
//
// The schedule cycles through three phases, all scaled by an intensity that ramps up over
// rampMs (the network "gets worse"):
//   flow    every frame arrives, but blocky (low bitrate)
//   choppy  frames are held 66-470 ms, some 16 px blocks keep stale content (decoder smear)
//   freeze  1.5-4 s on the last frame; reported once as burstMs so audio can drop out too
//
// step(now, {w, h}) -> { hold, block, stale: [{x,y,w,h} normalized], burstMs }
//   hold   true: show the last sent frame again instead of the new one
//   block  pixelation block size in px (0 = sharp)

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, k) => a + (b - a) * k;
const IDLE = Object.freeze({ hold: false, block: 0, stale: Object.freeze([]), burstMs: 0 });

export class BadConnSchedule {
  constructor({ seed = (Math.random() * 2 ** 31) | 0, rampMs = 4000 } = {}) {
    this.seed = seed;
    this.rampMs = rampMs;
    this.active = false;
  }

  start(now) {
    this.r = rng(this.seed);
    this.active = true;
    this.t0 = now;
    this.phase = 'flow';
    this.phaseUntil = now + 600 + this.r() * 600;
    this.freezeUntil = -Infinity;
    this.nextFreezeAt = now + 2500 + this.r() * 2000;
    this.nextFreshAt = now;
    this.block = 0;
    this.blockUntil = now;
  }

  stop() { this.active = false; }

  intensity(now) {
    if (!this.active) return 0;
    return Math.min(1, 0.3 + 0.7 * Math.max(0, now - this.t0) / this.rampMs);
  }

  step(now, { w = 1280, h = 720 } = {}) {
    if (!this.active) return IDLE;
    const r = this.r, k = this.intensity(now);

    if (now >= this.blockUntil) {
      this.block = r() < 0.3 * (1 - k) ? 0 : Math.round(lerp(8, 40, Math.min(1, k * (0.45 + 0.55 * r()))));
      this.blockUntil = now + 300 + r() * 500;
    }

    let burstMs = 0;
    if (now >= this.nextFreezeAt && now >= this.freezeUntil) {
      burstMs = Math.round(1500 + r() * 2500);
      this.freezeUntil = now + burstMs;
      this.nextFreezeAt = this.freezeUntil + lerp(9000, 4000, k) * (0.6 + 0.8 * r());
      this.phase = 'flow';
      this.phaseUntil = this.freezeUntil + 400 + r() * 800;
    }
    if (now < this.freezeUntil) return { hold: true, block: this.block, stale: [], burstMs };

    if (now >= this.phaseUntil) {
      this.phase = this.phase === 'flow' ? 'choppy' : 'flow';
      this.phaseUntil = now + (this.phase === 'flow' ? lerp(1500, 500, k) : lerp(1500, 4000, k)) * (0.7 + 0.6 * r());
    }

    let hold = false;
    if (this.phase === 'choppy') {
      if (now >= this.nextFreshAt) this.nextFreshAt = now + 66 + r() * 400 * k;
      else hold = true;
    }

    const stale = [];
    if (!hold && this.phase === 'choppy' && r() < 0.6 * k) {
      const n = 1 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const bw = 16 * (2 + Math.floor(r() * 10)), bh = 16 * (1 + Math.floor(r() * 6));
        if (bw > w || bh > h) continue;
        const x = 16 * Math.floor(r() * Math.floor((w - bw) / 16 + 1));
        const y = 16 * Math.floor(r() * Math.floor((h - bh) / 16 + 1));
        stale.push({ x: x / w, y: y / h, w: bw / w, h: bh / h });
      }
    }
    return { hold, block: this.block, stale, burstMs };
  }
}

// Applies one step to `ctx` (the output canvas, already holding this frame's picture).
// `held` is an OffscreenCanvas with the last frame that was "sent"; it is updated here.
export function renderBadConnection(ctx, w, h, f, state) {
  const held = state.held = state.held && state.held.width === w && state.held.height === h ? state.held : new OffscreenCanvas(w, h);
  const hc = held.getContext('2d', { alpha: false });
  if (!state.primed) { hc.drawImage(ctx.canvas, 0, 0); state.primed = true; }

  if (f.hold) {
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(held, 0, 0);
    ctx.restore();
    return;
  }
  if (f.block > 0) {
    const sw = Math.max(2, Math.round(w / f.block)), sh = Math.max(2, Math.round(h / f.block));
    const small = state.small = state.small && state.small.width === sw && state.small.height === sh ? state.small : new OffscreenCanvas(sw, sh);
    const sc = small.getContext('2d', { alpha: false });
    sc.imageSmoothingEnabled = true;
    sc.drawImage(ctx.canvas, 0, 0, sw, sh);
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, w, h);
    ctx.restore();
  }
  for (const s of f.stale) {
    const x = Math.round(s.x * w), y = Math.round(s.y * h), rw = Math.round(s.w * w), rh = Math.round(s.h * h);
    ctx.drawImage(held, x, y, rw, rh, x, y, rw, rh);
  }
  hc.drawImage(ctx.canvas, 0, 0);
}
