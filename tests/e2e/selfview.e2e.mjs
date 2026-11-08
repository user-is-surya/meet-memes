import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, sharpness } from './run.mjs';

const selfFrame = (h) => h.eval(() => {
  const v = document.getElementById('self');
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(v, 0, 0);
  return { w: c.width, h: c.height, data: Array.from(g.getImageData(0, 0, c.width, c.height).data) };
});

test('self-view shows exactly what others see', async () => {
  const h = await open();
  try {
    await h.wait(2500);
    const swapped = await h.eval(() => {
      const v = document.getElementById('self');
      return window.__meetMemes.selfView.current(v).getVideoTracks()[0] !== window.harness.sendTrack && v.dataset.meetMemesSelf === '1';
    });
    assert.ok(swapped, 'self-view stream replaced with our output');
    const before = await selfFrame(h);
    await h.press('Alt+Shift+Digit2');
    await h.wait(900);
    const after = await selfFrame(h);
    assert.ok(sharpness(after) > sharpness(before) * 3, 'meme visible in self-view');
  } finally { await h.close(); }
});

test('self-view goes back to Meet\'s own stream when our wrapper stops', async () => {
  const h = await open();
  try {
    await h.wait(2500);
    await h.eval(() => window.harness.stopCamera());
    await h.wait(300);
    const back = await h.eval(() => window.__meetMemes.selfView.current(document.getElementById('self')).getVideoTracks()[0] === window.harness.sendTrack);
    assert.ok(back);
  } finally { await h.close(); }
});

test('charge ring overlays the self-view', async () => {
  const h = await open();
  try {
    await h.wait(2500);
    await h.eval(() => document.getElementById('meet-memes-root').dispatchEvent(
      new CustomEvent('meet-memes-debug', { detail: { cmd: 'ring', id: 'noice', progress: 0.5, x: 0.3, y: 0.4 } })));
    await h.wait(200);
    const r = await h.eval(() => {
      const ring = document.querySelector('[data-meet-memes-ring="noice"]');
      const v = document.getElementById('self').getBoundingClientRect();
      if (!ring) return null;
      const b = ring.getBoundingClientRect();
      return { inside: b.left >= v.left - 40 && b.right <= v.right + 40 && b.top >= v.top - 40 && b.bottom <= v.bottom + 40, visible: getComputedStyle(ring).opacity !== '0' };
    });
    assert.ok(r && r.inside && r.visible, JSON.stringify(r));
  } finally { await h.close(); }
});
