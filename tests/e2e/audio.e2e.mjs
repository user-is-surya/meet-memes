import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './run.mjs';

async function peakRms(h, ms) {
  let peak = -120;
  for (let t = 0; t < ms; t += 50) { peak = Math.max(peak, await h.remoteRms()); await h.wait(50); }
  return peak;
}

test('meme sound reaches the other side', async () => {
  const h = await open({ audio: 'silent' });
  try {
    await h.wait(3000);
    const base = await peakRms(h, 600);
    await h.press('Alt+Shift+Digit2');
    const during = await peakRms(h, 1200);
    assert.ok(during > base + 12, `baseline ${base.toFixed(1)} dB, during ${during.toFixed(1)} dB`);
    const s = await h.stats();
    assert.equal(s.audioWrapped, 1);
  } finally { await h.close(); }
});

test('muted: no meme sound is sent', async () => {
  const h = await open({ audio: 'silent' });
  try {
    await h.wait(3000);
    await h.eval(() => window.harness.mute());
    const base = await peakRms(h, 600);
    await h.press('Alt+Shift+Digit2');
    const during = await peakRms(h, 1200);
    assert.ok(during < base + 1, `baseline ${base.toFixed(1)} dB, during ${during.toFixed(1)} dB`);
  } finally { await h.close(); }
});
