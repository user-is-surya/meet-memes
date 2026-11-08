import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inpaint, nearestFill } from '../extension/src/fx/inpaint.js';

function checker(w, h, sq) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = ((Math.floor(x / sq) + Math.floor(y / sq)) % 2) * 255, i = (y * w + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255;
  }
  return rgba;
}
function hole(w, h, x0, y0, s) {
  const known = new Uint8Array(w * h).fill(1);
  for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) known[y * w + x] = 0;
  return known;
}

test('fills a hole with source texture, never blurred greys', () => {
  const w = 64, h = 64, rgba = checker(w, h, 8), known = hole(w, h, 22, 22, 20);
  const src = rgba.slice();
  for (let i = 0; i < w * h; i++) if (!known[i]) src[i * 4] = src[i * 4 + 1] = src[i * 4 + 2] = 128;
  const out = inpaint(src, known, w, h, { patch: 7, iters: 4, seed: 1 });
  let grey = 0, uniformBlocks = 0, blocks = 0;
  for (let i = 0; i < w * h; i++) {
    if (known[i]) continue;
    const v = out[i * 4];
    if (v > 10 && v < 245) grey++;
  }
  assert.equal(grey, 0, 'every filled pixel is a real source value (no blur)');
  for (let by = 24; by < 40; by += 8) for (let bx = 24; bx < 40; bx += 8) {
    blocks++;
    const v0 = out[(by * w + bx) * 4];
    let same = true;
    for (let y = by; y < by + 8 && same; y++) for (let x = bx; x < bx + 8; x++) if (out[(y * w + x) * 4] !== v0) { same = false; break; }
    if (same) uniformBlocks++;
  }
  assert.ok(uniformBlocks / blocks >= 0.5, `coherent texture: ${uniformBlocks}/${blocks} uniform 8x8 blocks`);
});

test('no unknown pixels remain and known pixels are untouched', () => {
  const w = 48, h = 32, rgba = checker(w, h, 4), known = hole(w, h, 10, 8, 14);
  const out = inpaint(rgba, known, w, h, { seed: 2 });
  for (let i = 0; i < w * h; i++) {
    assert.equal(out[i * 4 + 3], 255);
    if (known[i]) assert.equal(out[i * 4], rgba[i * 4]);
  }
});

test('nearestFill copies the nearest known pixel (sharp, instant fallback)', () => {
  const w = 10, h = 1, rgba = new Uint8ClampedArray(w * 4), known = new Uint8Array(w);
  rgba[0] = 10; known[0] = 1; rgba[9 * 4] = 200; known[9] = 1;
  const out = nearestFill(rgba, known, w, h);
  assert.equal(out[2 * 4], 10);
  assert.equal(out[7 * 4], 200);
});

test('nothing known: returns input unchanged without throwing', () => {
  const out = inpaint(new Uint8ClampedArray(16 * 4), new Uint8Array(16), 4, 4);
  assert.equal(out.length, 64);
});

test('matchBorder shifts the fill to the colour of the room around the hole', async () => {
  const { matchBorder } = await import('../extension/src/fx/inpaint.js');
  const w = 20, h = 1, rgba = new Uint8ClampedArray(w * 4), known = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    const inHole = x >= 6 && x < 14;
    known[x] = inHole ? 0 : 1;
    const v = inHole ? 180 : 120; // the fill came out 60 too bright
    rgba[x * 4] = rgba[x * 4 + 1] = rgba[x * 4 + 2] = v; rgba[x * 4 + 3] = 255;
  }
  matchBorder(rgba, known, w, h);
  assert.equal(rgba[10 * 4], 120);
  assert.equal(rgba[0], 120, 'known pixels untouched');
});
