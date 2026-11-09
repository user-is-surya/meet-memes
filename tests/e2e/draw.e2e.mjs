import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, meanLuma } from './run.mjs';

// The grey fake camera has a bright bar on the LEFT edge.
const left = { x: 0, y: 0.2, w: 0.12, h: 0.6 };
const right = { x: 0.88, y: 0.2, w: 0.12, h: 0.6 };

function avg(f, box) {
  const x0 = Math.round(box.x * f.w), y0 = Math.round(box.y * f.h), x1 = Math.round((box.x + box.w) * f.w), y1 = Math.round((box.y + box.h) * f.h);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * f.w + x) * 4; r += f.data[i]; g += f.data[i + 1]; b += f.data[i + 2]; n++; }
  return { r: r / n, g: g / n, b: b / n };
}

test('draw mode: mirrors what others see and shows the colour palette; Meme mode restores', async () => {
  const h = await open({ effect: 'none', cam: 'gray' });
  try {
    await h.waitForEngine(60000);
    await h.wait(2000);
    await h.press('Alt+Shift+KeyD');
    await h.wait(3000); // slow machines send only a frame or two per second
    const f = await h.remoteFrame();
    assert.ok(meanLuma(f, right) > meanLuma(f, left) + 20, 'mirrored while drawing');
    // First swatch (cyan) at x 0.29, y 0.075; pink next to it at x 0.36.
    const cyan = avg(f, { x: 0.285, y: 0.065, w: 0.01, h: 0.02 });
    const pink = avg(f, { x: 0.355, y: 0.065, w: 0.01, h: 0.02 });
    assert.ok(cyan.b > cyan.r + 60, `cyan swatch ${JSON.stringify(cyan)}`);
    assert.ok(pink.r > pink.g + 60, `pink swatch ${JSON.stringify(pink)}`);

    await h.press('Alt+Shift+KeyM');
    await h.wait(3000);
    const g = await h.remoteFrame();
    assert.ok(meanLuma(g, left) > meanLuma(g, right) + 20, 'back to unmirrored');
  } finally { await h.close(); }
});
