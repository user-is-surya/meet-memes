import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './run.mjs';

// Webcam fixture: a woman in a light-blue shirt in front of a pale grey-green wall.
const shirt = { x: 0.38, y: 0.78, w: 0.24, h: 0.17 };
const wall = { x: 0.72, y: 0.3, w: 0.12, h: 0.25 };
function blueness(f, box) {
  const x0 = Math.round(box.x * f.w), y0 = Math.round(box.y * f.h), x1 = Math.round((box.x + box.w) * f.w), y1 = Math.round((box.y + box.h) * f.h);
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * f.w + x) * 4; s += f.data[i + 2] - f.data[i]; n++; }
  return s / n;
}

test('Thanos: you crumble to dust and the room behind you takes your place', async () => {
  const h = await open({ effect: 'none', video: 'webcam' });
  try {
    await h.waitForEngine(60000);
    await h.waitForMasks();
    await h.wait(1500);
    const before = await h.remoteFrame();
    assert.ok(blueness(before, shirt) > blueness(before, wall) + 15, 'fixture: the shirt is bluer than the wall');
    await h.press('Alt+Shift+Digit1');
    await h.wait(6500); // pause (+ plate) + 3 s dissolve + margin
    const after = await h.remoteFrame();
    const gap = blueness(after, shirt) - blueness(after, wall);
    assert.ok(gap < 8, `shirt replaced by the room: blue gap ${gap.toFixed(1)}`);
  } finally { await h.close(); }
});

test('Thanos: snapping again brings you back', async () => {
  const h = await open({ effect: 'none', video: 'webcam' });
  try {
    await h.waitForEngine(60000);
    await h.waitForMasks();
    await h.wait(1500);
    await h.press('Alt+Shift+Digit1');
    await h.wait(6500);
    await h.press('Alt+Shift+Digit1');
    await h.wait(2500);
    const f = await h.remoteFrame();
    assert.ok(blueness(f, shirt) > blueness(f, wall) + 15, 'shirt visible again');
  } finally { await h.close(); }
});
