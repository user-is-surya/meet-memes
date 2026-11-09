import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, meanLuma } from './run.mjs';

function avg(f, box) {
  const x0 = Math.round(box.x * f.w), y0 = Math.round(box.y * f.h), x1 = Math.round((box.x + box.w) * f.w), y1 = Math.round((box.y + box.h) * f.h);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * f.w + x) * 4; r += f.data[i]; g += f.data[i + 1]; b += f.data[i + 2]; n++; }
  return { r: r / n, g: g / n, b: b / n };
}

// Polls remote frames until `ok(frame)` or the time runs out (slow machines send few frames).
async function until(h, ok, ms = 4000) {
  let last = null;
  for (const end = Date.now() + ms; Date.now() < end;) {
    last = await h.remoteFrame();
    if (last && ok(last)) return last;
    await h.wait(100);
  }
  return null;
}

// With no face in view the hotkey portal opens at x 0.25, y 0.45, radius 0.17 (frame height):
// its top edge is at y 0.28.
const ringTop = { x: 0.245, y: 0.275, w: 0.01, h: 0.01 };

test('spell mode: hotkey portal is drawn in the chosen style; a blast flashes the screen', async () => {
  const h = await open({ effect: 'none', cam: 'gray' });
  try {
    await h.waitForEngine(60000);
    await h.wait(2000);
    await h.press('Alt+Shift+KeyS');
    await h.wait(500);

    const base = meanLuma(await h.remoteFrame(), { x: 0.4, y: 0.6, w: 0.2, h: 0.3 });
    await h.press('Alt+Shift+Digit4');
    const flash = await until(h, (f) => meanLuma(f, { x: 0.4, y: 0.6, w: 0.2, h: 0.3 }) > base + 40, 4000);
    assert.ok(flash, 'blast flash');
    await h.wait(1000);

    await h.press('Alt+Shift+Digit5');
    const orange = await until(h, (f) => { const c = avg(f, ringTop); return c.r > c.b + 50 && c.g > c.b + 15; }); // orange: green well above blue
    assert.ok(orange, 'orange (Strange) portal ring');

    await h.wait(6500); // the portal closes
    await h.press('Alt+Shift+Digit2'); // Wanda
    await h.press('Alt+Shift+Digit5');
    const red = await until(h, (f) => { const c = avg(f, ringTop); return c.r > c.g + 50 && c.g < c.b + 30; }); // red: green no higher than blue
    assert.ok(red, 'red (Wanda) portal ring');
  } finally { await h.close(); }
});
