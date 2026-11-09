import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synth, SYNTHS } from '../extension/src/content/synth.js';

test('boom: 1.6 s at 48 kHz, loud start, decays to near silence, never clips', () => {
  const pcm = synth('boom');
  assert.equal(pcm.length, Math.round(1.6 * 48000));
  let peak = 0; for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 1 && peak > 0.5, `peak ${peak}`);
  const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += pcm[i] * pcm[i]; return Math.sqrt(s / (b - a)); };
  assert.ok(rms(0, 4800) > rms(pcm.length - 4800, pcm.length) * 10, 'decays');
});

test('every listed synth renders', () => {
  for (const name of SYNTHS) assert.ok(synth(name).length > 1000, name);
  assert.equal(synth('nope'), null);
});

test('hum and drone loop without a click at the seam', () => {
  for (const name of ['hum', 'drone']) {
    const pcm = synth(name);
    const n = pcm.length;
    // The step across the loop point should be no bigger than an ordinary step inside it.
    let maxStep = 0; for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(pcm[i] - pcm[i - 1]));
    assert.ok(Math.abs(pcm[0] - pcm[n - 1]) <= maxStep * 1.01, `${name} seam ${Math.abs(pcm[0] - pcm[n - 1])} vs step ${maxStep}`);
  }
});
