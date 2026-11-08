import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, sharpness, meanLuma } from './run.mjs';

test('sender path is active and frames flow', async () => {
  const h = await open();
  try {
    await h.wait(3000);
    const s = await h.stats();
    assert.equal(s.path, 'sender');
    assert.ok(s.videoWrapped >= 1);
  } finally { await h.close(); }
});

test('effects are drawn after the page blur (crisp at the receiver)', async () => {
  const h = await open();
  try {
    await h.waitForEngine(60000);
    await h.wait(2500);
    const before = await h.remoteFrame();
    await h.press('Alt+Shift+Digit2');
    await h.wait(1500);
    const after = await h.remoteFrame();
    const sb = sharpness(before), sa = sharpness(after);
    assert.ok(sa > sb * 3, `sharpness before ${sb.toFixed(1)} after ${sa.toFixed(1)}`);
  } finally { await h.close(); }
});

test('camera off: nothing is drawn on the black frames', async () => {
  const h = await open();
  try {
    await h.waitForEngine(60000);
    await h.wait(2500);
    await h.eval(() => window.harness.camOff());
    await h.wait(500);
    await h.press('Alt+Shift+Digit2');
    await h.wait(900);
    const f = await h.remoteFrame();
    assert.ok(meanLuma(f) < 10, `mean luma ${meanLuma(f).toFixed(1)}`);
  } finally { await h.close(); }
});

test('camera stopped and restarted via replaceTrack: effects resume', async () => {
  const h = await open();
  try {
    await h.waitForEngine(60000);
    await h.wait(2500);
    await h.eval(() => window.harness.stopCamera());
    await h.wait(300);
    let s = await h.stats();
    assert.equal(s.videoWrapped, 1);
    await h.eval(() => window.harness.restartCamera());
    await h.wait(1500);
    s = await h.stats();
    assert.equal(s.videoWrapped, 2, 'a fresh wrapper for the restarted track');
    const before = await h.remoteFrame();
    await h.press('Alt+Shift+Digit2');
    await h.wait(900);
    const after = await h.remoteFrame();
    assert.ok(sharpness(after) > sharpness(before) * 3);
  } finally { await h.close(); }
});
