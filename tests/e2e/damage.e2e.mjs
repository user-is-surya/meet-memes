import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './run.mjs';

function avg(f, box) {
  const x0 = Math.round(box.x * f.w), y0 = Math.round(box.y * f.h), x1 = Math.round((box.x + box.w) * f.w), y1 = Math.round((box.y + box.h) * f.h);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * f.w + x) * 4; r += f.data[i]; g += f.data[i + 1]; b += f.data[i + 2]; n++; }
  return { r: r / n, g: g / n, b: b / n };
}

test('Emotional Damage: red hit-flash, crash zoom and the title', async () => {
  const h = await open({ effect: 'none', video: 'webcam' });
  try {
    await h.waitForEngine(60000);
    await h.wait(2500);
    const corner = { x: 0.01, y: 0.02, w: 0.12, h: 0.2 };
    const before = await h.remoteFrame();
    await h.press('Alt+Shift+Digit7');
    await h.wait(350);
    const hit = await h.remoteFrame();
    const c0 = avg(before, corner), c1 = avg(hit, corner);
    assert.ok(c1.r - c1.g > c0.r - c0.g + 60, `red flash at the edges (${(c0.r - c0.g).toFixed(0)} -> ${(c1.r - c1.g).toFixed(0)})`);
    await h.wait(800);
    const later = await h.remoteFrame();
    let ink = 0;
    for (let y = Math.round(0.72 * later.h); y < Math.round(0.88 * later.h); y++) for (let x = Math.round(0.2 * later.w); x < Math.round(0.8 * later.w); x++) {
      const i = (y * later.w + x) * 4;
      if (later.data[i] > 230 && later.data[i + 1] > 230 && later.data[i + 2] > 230) ink++;
    }
    assert.ok(ink > 800, `EMOTIONAL DAMAGE title on screen (ink ${ink})`);
  } finally { await h.close(); }
});
