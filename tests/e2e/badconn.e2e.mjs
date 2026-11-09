import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, sharpness } from './run.mjs';

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

test('bad connection: Alt+Shift+B makes the sent video freeze and lose detail, and again restores it', async () => {
  const h = await open({ effect: 'none', video: 'webcam' });
  try {
    await h.waitForEngine(60000);
    await h.wait(2000);
    const before = await heldShare(h, 15);
    const sharp = sharpness(await h.remoteFrame());

    await h.press('Alt+Shift+B');
    await h.wait(4500); // ramps up
    const during = await heldShare(h, 40);
    // Blurry or blocky (low bitrate): far less fine detail than the clean picture.
    let detail = Infinity;
    for (let i = 0; i < 6; i++) { detail = Math.min(detail, sharpness(await h.remoteFrame())); await h.wait(300); }
    assert.ok(during > before + 0.25, `held frames: before ${before.toFixed(2)}, during ${during.toFixed(2)}`);
    assert.ok(detail < sharp * 0.5, `detail: clean ${sharp.toFixed(1)}, bad ${detail.toFixed(1)}`);

    await h.press('Alt+Shift+B');
    await h.wait(1500);
    const after = await heldShare(h, 15);
    assert.ok(after < during - 0.25, `held frames after stopping: ${after.toFixed(2)}`);
  } finally { await h.close(); }
});
