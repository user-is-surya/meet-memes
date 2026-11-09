import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './run.mjs';

// Mean absolute difference between two frames (sampled), 0..255.
function diff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 16) s += Math.abs(a[i] - b[i]);
  return s / (a.length / 16);
}

// Share of consecutive samples where the received picture did not change (re-encoding
// a held frame still wobbles it slightly, so "unchanged" is a tiny mean difference).
async function heldShare(h, n = 30, gap = 100) {
  let prev = null, same = 0, pairs = 0;
  for (let i = 0; i < n; i++) {
    const f = await h.remoteFrame();
    if (prev && f) { pairs++; if (diff(prev, f.data) < 0.6) same++; }
    prev = f && f.data;
    await h.wait(gap);
  }
  return pairs ? same / pairs : 0;
}

// Mean length of runs of identical neighbouring pixels along rows (1 = every pixel differs).
function runLength(f) {
  let runs = 0, px = 0;
  for (let y = 0; y < f.h; y += 7) {
    let run = 1;
    for (let x = 1; x < f.w; x++) {
      const i = (y * f.w + x) * 4, j = i - 4;
      if (Math.abs(f.data[i] - f.data[j]) < 3 && Math.abs(f.data[i + 1] - f.data[j + 1]) < 3 && Math.abs(f.data[i + 2] - f.data[j + 2]) < 3) run++;
      else { runs++; px += run; run = 1; }
    }
    runs++; px += run;
  }
  return px / runs;
}

test('bad connection: Alt+Shift+B makes the sent video freeze and go blocky, and again restores it', async () => {
  const h = await open({ effect: 'none', video: 'webcam' });
  try {
    await h.waitForEngine(60000);
    await h.wait(2000);
    const before = await heldShare(h, 15);
    const sharp = runLength(await h.remoteFrame());

    await h.press('Alt+Shift+B');
    await h.wait(4500); // ramps up
    const during = await heldShare(h, 40);
    let blocky = 0;
    for (let i = 0; i < 6; i++) { blocky = Math.max(blocky, runLength(await h.remoteFrame())); await h.wait(300); }
    assert.ok(during > before + 0.25, `held frames: before ${before.toFixed(2)}, during ${during.toFixed(2)}`);
    assert.ok(blocky > sharp * 2, `blockiness: sharp ${sharp.toFixed(1)}, bad ${blocky.toFixed(1)}`);

    await h.press('Alt+Shift+B');
    await h.wait(1500);
    const after = await heldShare(h, 15);
    assert.ok(after < during - 0.25, `held frames after stopping: ${after.toFixed(2)}`);
  } finally { await h.close(); }
});
