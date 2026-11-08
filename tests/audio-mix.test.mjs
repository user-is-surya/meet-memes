import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSandbox, FakeTrack } from './helpers/main-world.mjs';

const voice = (pcm, extra = {}) => ({ id: 1, pcm: Float32Array.from(pcm), rate: 48000, pos: 0, volume: 1, loop: false, ...extra });

test('sfx gated when the source is disabled, muted or ended', () => {
  const { MM } = makeSandbox();
  assert.equal(MM.sfxAllowed({ enabled: true, muted: false, readyState: 'live' }), true);
  assert.equal(MM.sfxAllowed({ enabled: false, muted: false, readyState: 'live' }), false);
  assert.equal(MM.sfxAllowed({ enabled: true, muted: true, readyState: 'live' }), false);
  assert.equal(MM.sfxAllowed({ enabled: true, muted: false, readyState: 'ended' }), false);
});

test('mixInto adds voice samples to every channel, scaled by volume', () => {
  const { MM } = makeSandbox();
  const planes = [new Float32Array([0.1, 0.1, 0.1]), new Float32Array([0, 0, 0])];
  const voices = [voice([0.5, 0.5, 0.5, 0.5])];
  const mixed = MM.mixInto(planes, 48000, voices, 0.5);
  assert.equal(mixed, true);
  assert.ok(Math.abs(planes[0][0] - 0.35) < 1e-6);
  assert.ok(Math.abs(planes[1][2] - 0.25) < 1e-6);
  assert.equal(voices[0].pos, 3, 'voice advanced by the chunk length');
});

test('mixInto clips to [-1, 1]', () => {
  const { MM } = makeSandbox();
  const planes = [new Float32Array([0.9])];
  MM.mixInto(planes, 48000, [voice([0.9])], 1);
  assert.equal(planes[0][0], 1);
});

test('finished voices are removed; looping voices wrap', () => {
  const { MM } = makeSandbox();
  const voices = [voice([1, 1]), voice([0.2, 0.4], { id: 2, loop: true })];
  MM.mixInto([new Float32Array(3)], 48000, voices, 1);
  assert.deepEqual(voices.map((v) => v.id), [2]);
  assert.equal(voices[0].pos, 1, 'loop wrapped 3 % 2');
});

test('resamples when the call runs at a different rate', () => {
  const { MM } = makeSandbox();
  const planes = [new Float32Array(2)];
  const v = voice([0, 0.5, 1, 1]);
  MM.mixInto(planes, 24000, [v], 1); // each output sample advances 2 source samples
  assert.equal(v.pos, 4);
  assert.ok(Math.abs(planes[0][1] - 1) < 1e-6);
});

test('mixer.wrap fails open without audio insertable streams', () => {
  const { MM } = makeSandbox({ insertable: false });
  assert.equal(MM.mixer.wrap(new FakeTrack('audio')), null);
});

test('audio sender gets the mixer output when insertable streams exist', () => {
  const { sandbox, MM } = makeSandbox();
  const mic = new FakeTrack('audio');
  const sender = new sandbox.RTCPeerConnection().addTrack(mic);
  assert.notEqual(sender._track, mic);
  assert.equal(sender.track, mic);
  assert.equal(MM.stats.audioWrapped, 1);
});
