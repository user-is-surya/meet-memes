import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, meanLuma } from './run.mjs';

function diff(a, b, box) {
  const x0 = Math.round(box.x * a.w), y0 = Math.round(box.y * a.h), x1 = Math.round((box.x + box.w) * a.w), y1 = Math.round((box.y + box.h) * a.h);
  let s = 0, n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * a.w + x) * 4;
    s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n++;
  }
  return s / n / 3;
}

test('Noice clip plays (moving picture in the corner) with sound', async () => {
  const h = await open({ effect: 'none', audio: 'silent', cam: 'gray' });
  try {
    await h.waitForEngine(60000);
    await h.wait(2500); // let the call settle
    const base = await h.remoteRms();
    const before = await h.remoteFrame();
    await h.press('Alt+Shift+Digit3');
    // The camera is flat dark grey; the Rosen clip (white background, face) is much brighter.
    // Poll: the clip reaches the receiver within a few hundred ms (network/encoder latency varies).
    const clipBox = { x: 0.78, y: 0.56, w: 0.16, h: 0.12 };
    let f1 = null, loud = -120;
    for (let i = 0; i < 14; i++) {
      await h.wait(150);
      loud = Math.max(loud, await h.remoteRms());
      const f = await h.remoteFrame();
      if (meanLuma(f, clipBox) > meanLuma(before, clipBox) + 45) { f1 = f; break; }
    }
    const ds = await h.eval(() => JSON.stringify({ ...document.getElementById('meet-memes-root').dataset }));
    assert.ok(f1, `clip visible in the corner within 2 s ${ds}`);
    for (let i = 0; i < 8; i++) { loud = Math.max(loud, await h.remoteRms()); await h.wait(50); }
    const f2 = await h.remoteFrame();
    const face = { x: 0.78, y: 0.62, w: 0.16, h: 0.3 };
    assert.ok(diff(f1, f2, face) > 2, `clip is moving: ${diff(f1, f2, face).toFixed(1)}`);
    assert.ok(loud > base + 12, `sound: base ${base.toFixed(1)} loud ${loud.toFixed(1)}`);
  } finally { await h.close(); }
});
