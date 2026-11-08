import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './run.mjs';

function avg(f, box) {
  const x0 = Math.round(box.x * f.w), y0 = Math.round(box.y * f.h), x1 = Math.round((box.x + box.w) * f.w), y1 = Math.round((box.y + box.h) * f.h);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * f.w + x) * 4; r += f.data[i]; g += f.data[i + 1]; b += f.data[i + 2]; n++; }
  return { r: r / n, g: g / n, b: b / n };
}
const warmth = (c) => c.r - c.b;

test('Fanum broccoli: the explosion goes off behind you, you stay in front', async () => {
  const h = await open({ effect: 'none', video: 'webcam' });
  try {
    await h.waitForEngine(60000);
    await h.waitForMasks();
    await h.wait(2000);
    const wallL = { x: 0.03, y: 0.08, w: 0.15, h: 0.35 }, wallR = { x: 0.8, y: 0.08, w: 0.15, h: 0.35 };
    const shirt = { x: 0.38, y: 0.78, w: 0.24, h: 0.17 };
    const before = await h.remoteFrame();
    await h.press('Alt+Shift+Digit5');
    await h.wait(1700);
    const f = await h.remoteFrame();
    const bgWarm = Math.max(warmth(avg(f, wallL)), warmth(avg(f, wallR)));
    assert.ok(bgWarm > Math.max(warmth(avg(before, wallL)), warmth(avg(before, wallR))) + 40, `fire behind you: warmth ${bgWarm.toFixed(0)}`);
    const s = avg(f, shirt);
    assert.ok(s.b > s.r, `your blue shirt is still in front of the fire (r ${s.r.toFixed(0)} b ${s.b.toFixed(0)})`);
  } finally { await h.close(); }
});
