import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './run.mjs';

// Brightest red-dominant row band: the laser streak runs across the frame at eye level.
function maxRedRow(f) {
  let best = 0;
  for (let y = 0; y < f.h; y++) {
    let s = 0;
    for (let x = 0; x < f.w; x += 2) { const i = (y * f.w + x) * 4; s += Math.max(0, f.data[i] - (f.data[i + 1] + f.data[i + 2]) / 2); }
    best = Math.max(best, s / (f.w / 2));
  }
  return best;
}

test('Laser eyes: red flares with the streak across the frame at eye level', async () => {
  const h = await open({ effect: 'none', video: 'webcam' });
  try {
    await h.waitForEngine(60000);
    await h.waitForFaces();
    await h.wait(1500);
    const before = maxRedRow(await h.remoteFrame());
    await h.press('Alt+Shift+Digit8');
    await h.wait(900);
    const during = maxRedRow(await h.remoteFrame());
    assert.ok(during > before + 20, `red streak row: ${before.toFixed(0)} -> ${during.toFixed(0)}`);
  } finally { await h.close(); }
});
