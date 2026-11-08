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
