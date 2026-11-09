// Content-aware fill (PatchMatch-style), used to rebuild the part of your room that the
// camera never saw because you were sitting in front of it. Pure functions on RGBA arrays
// so they run anywhere (engine iframe, tests).
//
// Every filled pixel is copied from a real background pixel (no averaging), so the
// result is never blurry.

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// Instant fallback: copy the nearest known pixel (multi-source BFS). Sharp, but streaky.
export function nearestFill(rgba, known, w, h) {
  const out = new Uint8ClampedArray(rgba);
  const src = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let qh = 0, qt = 0;
  for (let i = 0; i < w * h; i++) if (known[i]) { src[i] = i; queue[qt++] = i; }
  if (!qt) return out;
  while (qh < qt) {
    const i = queue[qh++], x = i % w, y = (i / w) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) {
      if (j < 0 || src[j] >= 0) continue;
      src[j] = src[i];
      queue[qt++] = j;
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (known[i]) continue;
    const s = src[i] * 4, d = i * 4;
    out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = 255;
  }
  return out;
}

export function downsample(rgba, known, w, h) {
  const W = Math.max(1, w >> 1), H = Math.max(1, h >> 1);
  const o = new Uint8ClampedArray(W * H * 4), k = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy), i = sy * w + sx;
      if (!known[i]) continue;
      r += rgba[i * 4]; g += rgba[i * 4 + 1]; b += rgba[i * 4 + 2]; n++;
    }
    const j = y * W + x;
    if (n === 4) { o[j * 4] = r / 4; o[j * 4 + 1] = g / 4; o[j * 4 + 2] = b / 4; o[j * 4 + 3] = 255; k[j] = 1; }
  }
  return { rgba: o, known: k, w: W, h: H };
}

// Patch centres whose whole patch lies on known pixels: valid sources.
function validSources(known, w, h, r) {
  const ok = new Uint8Array(w * h);
  const list = [];
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    let good = true;
    for (let dy = -r; dy <= r && good; dy++) for (let dx = -r; dx <= r; dx++) if (!known[(y + dy) * w + x + dx]) { good = false; break; }
    if (good) { ok[y * w + x] = 1; list.push(y * w + x); }
  }
  return { ok, list };
}

function solveLevel(img, known, w, h, { patch, iters, random, init }) {
  const r = patch >> 1;
  const { ok, list } = validSources(known, w, h, r);
  if (!list.length) return { img: nearestFill(img, known, w, h), nnf: null };
  const holes = [];
  for (let i = 0; i < w * h; i++) if (!known[i]) holes.push(i);
  const cur = new Uint8ClampedArray(img);
  if (init) for (const i of holes) { const s = init[i]; if (s >= 0) { cur[i * 4] = img[s * 4]; } }
  const nnf = new Int32Array(w * h).fill(-1);
  const cost = new Float64Array(w * h);

  const dist = (t, s, best) => {
    const tx = t % w, ty = (t / w) | 0, sx = s % w, sy = (s / w) | 0;
    let d = 0;
    for (let dy = -r; dy <= r; dy++) {
      const ty2 = ty + dy, sy2 = sy + dy;
      if (ty2 < 0 || ty2 >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        const tx2 = tx + dx;
        if (tx2 < 0 || tx2 >= w) continue;
        const a = (ty2 * w + tx2) * 4, b = (sy2 * w + sx + dx) * 4;
        const e0 = cur[a] - img[b], e1 = cur[a + 1] - img[b + 1], e2 = cur[a + 2] - img[b + 2];
        d += e0 * e0 + e1 * e1 + e2 * e2;
        if (d >= best) return d;
      }
    }
    return d;
  };
  const tryCand = (t, s) => {
    if (s < 0 || s >= w * h || !ok[s]) return;
    const d = dist(t, s, cost[t]);
    if (d < cost[t]) { cost[t] = d; nnf[t] = s; }
  };

  for (const t of holes) {
    let s = init && init[t] >= 0 && ok[init[t]] ? init[t] : list[(random() * list.length) | 0];
    nnf[t] = s;
    cost[t] = Infinity;
    cost[t] = dist(t, s, Infinity);
  }
  const apply = () => {
    for (const t of holes) {
      const s = nnf[t] * 4, d = t * 4;
      cur[d] = img[s]; cur[d + 1] = img[s + 1]; cur[d + 2] = img[s + 2]; cur[d + 3] = 255;
    }
  };
  apply();
  for (const t of holes) cost[t] = dist(t, nnf[t], Infinity);

  // EM-style refinement: vote (average of all overlapping matched patches) to converge
  // on a coherent solution; the final apply() copies single pixels so the result stays sharp.
  const acc = new Float32Array(w * h * 3), cnt = new Float32Array(w * h);
  const vote = () => {
    acc.fill(0); cnt.fill(0);
    for (const t of holes) {
      const tx = t % w, ty = (t / w) | 0, s0 = nnf[t], sx = s0 % w, sy = (s0 / w) | 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const px = tx + dx, py = ty + dy;
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        const pi = py * w + px;
        if (known[pi]) continue;
        const si = ((sy + dy) * w + sx + dx) * 4;
        acc[pi * 3] += img[si]; acc[pi * 3 + 1] += img[si + 1]; acc[pi * 3 + 2] += img[si + 2]; cnt[pi]++;
      }
    }
    for (const t of holes) if (cnt[t]) { const d = t * 4; cur[d] = acc[t * 3] / cnt[t]; cur[d + 1] = acc[t * 3 + 1] / cnt[t]; cur[d + 2] = acc[t * 3 + 2] / cnt[t]; }
  };

  for (let it = 0; it < iters; it++) {
    const fwd = it % 2 === 0;
    const order = fwd ? holes : [...holes].reverse();
    const step = fwd ? -1 : 1;
    for (const t of order) {
      const x = t % w, y = (t / w) | 0;
      // Propagation: a neighbouring hole pixel's match, shifted back by one, keeps texture coherent.
      if (x + step >= 0 && x + step < w) { const n = t + step; if (!known[n] && nnf[n] >= 0) tryCand(t, nnf[n] - step); }
      if (y + step >= 0 && y + step < h) { const n = t + step * w; if (!known[n] && nnf[n] >= 0) tryCand(t, nnf[n] - step * w); }
      // Random search around the current best.
      let rad = Math.max(w, h);
      const bx = nnf[t] % w, by = (nnf[t] / w) | 0;
      while (rad >= 1) {
        const cx = Math.round(bx + (random() * 2 - 1) * rad), cy = Math.round(by + (random() * 2 - 1) * rad);
        if (cx >= 0 && cx < w && cy >= 0 && cy < h) tryCand(t, cy * w + cx);
        rad >>= 1;
      }
    }
    if (it < iters - 1) vote();
    for (const t of holes) cost[t] = dist(t, nnf[t], Infinity);
  }
  apply();
  return { img: cur, nnf };
}

// rgba: Uint8ClampedArray (w*h*4); known: Uint8Array (1 = background pixel we have).
export function inpaint(rgba, known, w, h, { patch = 7, iters = 6, levels = 3, seed = 7 } = {}) {
  let any = false, holes = false;
  for (let i = 0; i < w * h; i++) { if (known[i]) any = true; else holes = true; }
  if (!any || !holes) return new Uint8ClampedArray(rgba);
  const random = rng(seed);

  // Pyramid (coarse levels only while the image stays big enough for patches).
  const pyr = [{ rgba, known, w, h }];
  while (pyr.length < levels) {
    const p = pyr[pyr.length - 1];
    if (p.w < patch * 4 || p.h < patch * 4) break;
    pyr.push(downsample(p.rgba, p.known, p.w, p.h));
  }

  let prevNnf = null, prevW = 0;
  let result = null;
  for (let l = pyr.length - 1; l >= 0; l--) {
    const p = pyr[l];
    const start = nearestFill(p.rgba, p.known, p.w, p.h);
    let init = null;
    if (prevNnf) {
      init = new Int32Array(p.w * p.h).fill(-1);
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const q = prevNnf[Math.min(prevW * ((y >> 1)) + (x >> 1), prevNnf.length - 1)];
        if (q < 0) continue;
        const sx = Math.min(p.w - 1, (q % prevW) * 2 + (x & 1)), sy = Math.min(p.h - 1, ((q / prevW) | 0) * 2 + (y & 1));
        init[y * p.w + x] = sy * p.w + sx;
      }
    }
    const { img, nnf } = solveLevel(start, p.known, p.w, p.h, { patch: l === 0 ? patch : Math.max(5, patch - 2), iters, random, init });
    prevNnf = nnf; prevW = p.w;
    result = img;
  }
  // Keep known pixels exactly as given.
  for (let i = 0; i < w * h; i++) if (known[i]) { const d = i * 4; result[d] = rgba[d]; result[d + 1] = rgba[d + 1]; result[d + 2] = rgba[d + 2]; result[d + 3] = rgba[d + 3]; }
  return result;
}

// Writes a half-resolution fill back into the full-resolution image, only where the
// full image is unknown (nearest pixel: keeps it sharp). Returns `full` (modified).
export function upsampleInto(full, known, w, h, half, hw, hh) {
  for (let y = 0; y < h; y++) {
    const sy = Math.min(hh - 1, (y * hh / h) | 0);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (known[i]) continue;
      const sx = Math.min(hw - 1, (x * hw / w) | 0), s = (sy * hw + sx) * 4, d = i * 4;
      full[d] = half[s]; full[d + 1] = half[s + 1]; full[d + 2] = half[s + 2]; full[d + 3] = 255;
    }
  }
  return full;
}

// Shifts the filled (unknown) pixels so their colour along the hole's border matches the
// known pixels right next to them: no visible lighter/darker silhouette. In place.
export function matchBorder(rgba, known, w, h) {
  const sk = [0, 0, 0], sf = [0, 0, 0];
  let nk = 0, nf = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (known[ny * w + nx] !== known[i]) { edge = true; break; }
    }
    if (!edge) continue;
    const p = i * 4, acc = known[i] ? sk : sf;
    acc[0] += rgba[p]; acc[1] += rgba[p + 1]; acc[2] += rgba[p + 2];
    if (known[i]) nk++; else nf++;
  }
  if (!nk || !nf) return rgba;
  const off = [0, 1, 2].map((c) => sk[c] / nk - sf[c] / nf);
  for (let i = 0; i < w * h; i++) {
    if (known[i]) continue;
    const p = i * 4;
    rgba[p] += off[0]; rgba[p + 1] += off[1]; rgba[p + 2] += off[2];
  }
  return rgba;
}

// Full empty-room plate from a background snapshot: content-aware fill at half
// resolution for never-seen pixels, nearest-pixel fill if that fails.
export function buildPlate(rgba, known, w, h) {
  let k = 0;
  for (let i = 0; i < w * h; i++) k += known[i];
  // Too little of the room has been seen to rebuild it: never return a black plate.
  if (k < w * h * 0.03) return null;
  try {
    const half = downsample(rgba, known, w, h);
    let hk = 0;
    for (let i = 0; i < half.known.length; i++) hk += half.known[i];
    if (hk < half.known.length * 0.02) return matchBorder(nearestFill(rgba, known, w, h), known, w, h);
    const filled = inpaint(half.rgba, half.known, half.w, half.h);
    const full = new Uint8ClampedArray(rgba);
    upsampleInto(full, known, w, h, filled, half.w, half.h);
    return matchBorder(full, known, w, h);
  } catch {
    return nearestFill(rgba, known, w, h);
  }
}
