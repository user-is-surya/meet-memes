import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, meanLuma, sharpness } from './run.mjs';

// The grey fake camera has a bright bar on the LEFT edge.
const left = { x: 0, y: 0.2, w: 0.12, h: 0.6 };
const right = { x: 0.88, y: 0.2, w: 0.12, h: 0.6 };
const gfxMode = (h) => h.eval(() => document.getElementById('meet-memes-root')?.dataset.gfx);
const debug = (h, cmd) => h.eval((c) => document.getElementById('meet-memes-root')
  .dispatchEvent(new CustomEvent('meet-memes-debug', { detail: { cmd: c } })), cmd);

test('compositor runs on WebGL2', async () => {
  const h = await open({ effect: 'none' });
  try {
    await h.wait(1500);
    await h.press('Alt+Shift+KeyR');
    await h.wait(800);
    assert.equal(await gfxMode(h), 'gl');
  } finally { await h.close(); }
});

test('mirror flips what others see', async () => {
  const h = await open({ effect: 'none', cam: 'gray' });
  try {
    await h.waitForEngine(60000);
    await h.wait(2500);
    const before = await h.remoteFrame();
    assert.ok(meanLuma(before, left) > meanLuma(before, right) + 20, 'fixture: left brighter');
    await h.press('Alt+Shift+KeyR');
    await h.wait(1000);
    const after = await h.remoteFrame();
    assert.ok(meanLuma(after, right) > meanLuma(after, left) + 20,
      `after mirror: left ${meanLuma(after, left).toFixed(0)} right ${meanLuma(after, right).toFixed(0)}`);
  } finally { await h.close(); }
});

test('resolution change mid-call: no blank frames', async () => {
  const h = await open({ effect: 'none' });
  try {
    await h.wait(2000);
    await h.press('Alt+Shift+KeyR'); // force the compositor path on every frame
    await h.wait(800);
    await h.eval(() => window.harness.setRes(320, 180));
    let dark = 0;
    for (let i = 0; i < 12; i++) {
      const f = await h.remoteFrame();
      if (f && meanLuma(f) < 10) dark++;
      await h.wait(100);
    }
    await h.eval(() => window.harness.setRes(640, 360));
    for (let i = 0; i < 12; i++) {
      const f = await h.remoteFrame();
      if (f && meanLuma(f) < 10) dark++;
      await h.wait(100);
    }
    assert.equal(dark, 0);
  } finally { await h.close(); }
});

test('GPU context loss falls back to 2D and keeps effects going', async () => {
  const h = await open();
  try {
    await h.wait(2500);
    await debug(h, 'loseGL');
    await h.wait(500);
    const before = await h.remoteFrame();
    await h.press('Alt+Shift+Digit2');
    await h.wait(900);
    const after = await h.remoteFrame();
    assert.equal(await gfxMode(h), '2d');
    assert.ok(sharpness(after) > sharpness(before) * 3);
  } finally { await h.close(); }
});
