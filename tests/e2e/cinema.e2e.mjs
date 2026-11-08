import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './run.mjs';

// Column ink profile of bright text in a band of the frame.
function profile(f, y0, y1, x0, x1) {
  const out = [];
  for (let x = Math.round(x0 * f.w); x < Math.round(x1 * f.w); x++) {
    let ink = 0;
    for (let y = Math.round(y0 * f.h); y < Math.round(y1 * f.h); y++) {
      const i = (y * f.w + x) * 4;
      if (f.data[i] > 215 && f.data[i + 1] > 215 && f.data[i + 2] > 215) ink++;
    }
    out.push(ink);
  }
  return out;
}
function corr(a, b) {
  const n = Math.min(a.length, b.length), ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}
const chroma = (f) => {
  let d = 0, n = 0;
  for (let i = 0; i < f.data.length; i += 4 * 97) { d += Math.abs(f.data[i] - f.data[i + 2]) + Math.abs(f.data[i] - f.data[i + 1]); n++; }
  return d / n;
};

test('Absolute Cinema: black-and-white poster with the title', async () => {
  const h = await open({ effect: 'none', video: 'webcam' });
  try {
    await h.waitForEngine(60000);
    await h.wait(2500); // let the call settle
    const before = await h.remoteFrame();
    assert.ok(chroma(before) > 10, `fixture is in colour (chroma ${chroma(before).toFixed(1)})`);
    await h.press('Alt+Shift+Digit2');
    await h.wait(1500);
    const f = await h.remoteFrame();
    assert.ok(chroma(f) < 6, `video is black and white (chroma ${chroma(f).toFixed(1)})`);
    const ink = profile(f, 0.82, 0.98, 0.15, 0.85).reduce((s, v) => s + v, 0);
    assert.ok(ink > 400, `big white title in the lower third (ink ${ink})`);
  } finally { await h.close(); }
});

test('mirror mode: meme text still reads the right way round', async () => {
  const h = await open({ effect: 'none', cam: 'gray' });
  try {
    await h.waitForEngine(60000);
    await h.wait(2500); // let the call settle
    await h.press('Alt+Shift+KeyR');
    await h.wait(500);
    await h.press('Alt+Shift+Digit2');
    await h.wait(1500);
    const f = await h.remoteFrame();
    const got = profile(f, 0.82, 0.98, 0.1, 0.9);
    // Reference: the same word rendered normally in the page.
    const ref = await h.eval(({ w, hh }) => {
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, w, hh);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 ${Math.round(hh * 0.15)}px 'Montserrat', 'Arial Black', 'Helvetica Neue', Arial, sans-serif`;
      g.fillText('CINEMA', w / 2, hh * 0.9);
      const d = g.getImageData(0, 0, w, hh).data;
      return { w, h: hh, data: Array.from(d) };
    }, { w: f.w, hh: f.h });
    const want = profile(ref, 0.82, 0.98, 0.1, 0.9);
    const normal = corr(got, want), flipped = corr(got, [...want].reverse());
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    assert.ok(normal > flipped + 0.1, `reads correctly: corr normal ${normal.toFixed(2)} vs mirrored ${flipped.toFixed(2)} (ink ${sum(got)} / ref ${sum(want)})`);
  } finally { await h.close(); }
});
