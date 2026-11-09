// Draw mode hand poses and fingertip smoothing.
import { L, reach } from '../lib/hands.js';

const EXT = 1.55, FOLD = 1.45;

// 'draw' (index finger only), 'hover' (index + middle), 'erase' (open palm) or null.
export function handPose(lm, aspect) {
  const r = (t) => reach(lm, t, aspect);
  const idx = r(L.INDEX_TIP), mid = r(L.MIDDLE_TIP), ring = r(L.RING_TIP), pinky = r(L.PINKY_TIP);
  if (idx > EXT && mid > EXT && ring > 1.5 && pinky > 1.4) return 'erase';
  if (idx > EXT && mid > EXT && ring < FOLD && pinky < FOLD) return 'hover';
  if (idx > EXT && mid < FOLD && ring < FOLD && pinky < FOLD) return 'draw';
  return null;
}

// One Euro filter (Casiez et al.): smooths jitter when still, stays responsive when moving.
// Values in any unit; the defaults suit normalized frame coordinates.
export class OneEuro {
  constructor({ minCutoff = 1.2, beta = 25, dCutoff = 1 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.x = null; this.dx = 0; this.t = 0;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, tMs) {
    if (this.x === null) { this.x = x; this.t = tMs; return x; }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const dx = (x - this.x) / dt;
    this.dx += (dx - this.dx) * OneEuro.alpha(this.dCutoff, dt);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += (x - this.x) * OneEuro.alpha(cutoff, dt);
    return this.x;
  }

  reset() { this.x = null; this.dx = 0; }
}
