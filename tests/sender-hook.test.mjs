import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSandbox, FakeTrack, tick } from './helpers/main-world.mjs';

test('wraps video on addTrack; sender.track still reports the source', () => {
  const { sandbox, MM } = makeSandbox();
  const pc = new sandbox.RTCPeerConnection();
  const cam = new FakeTrack('video');
  const sender = pc.addTrack(cam);
  assert.notEqual(sender._track, cam, 'sender gets our output track');
  assert.equal(sender._track.label, 'generator');
  assert.equal(sender.track, cam, 'Meet still sees its own track');
  assert.equal(MM.stats.path, 'sender');
  assert.equal(MM.stats.videoWrapped, 1);
});

test('wraps on replaceTrack', async () => {
  const { sandbox, MM } = makeSandbox();
  const pc = new sandbox.RTCPeerConnection();
  const { sender } = pc.addTransceiver('video');
  const cam = new FakeTrack('video');
  await sender.replaceTrack(cam);
  assert.equal(sender._track.label, 'generator');
  assert.equal(sender.track, cam);
  assert.equal(MM.wrappers.size, 1);
});

test('wraps a track passed to addTransceiver', () => {
  const { sandbox } = makeSandbox();
  const pc = new sandbox.RTCPeerConnection();
  const cam = new FakeTrack('video');
  const { sender } = pc.addTransceiver(cam, { direction: 'sendonly' });
  assert.equal(sender._track.label, 'generator');
  assert.equal(sender.track, cam);
});

test('reuses wrapper for the same source on two peer connections', () => {
  const { sandbox, created } = makeSandbox();
  const cam = new FakeTrack('video');
  const a = new sandbox.RTCPeerConnection().addTrack(cam);
  const b = new sandbox.RTCPeerConnection().addTrack(cam);
  assert.equal(a._track, b._track);
  assert.equal(created.generators.length, 1);
});

test('does not wrap our own output', async () => {
  const { sandbox, created } = makeSandbox();
  const cam = new FakeTrack('video');
  const s1 = new sandbox.RTCPeerConnection().addTrack(cam);
  const out = s1._track;
  const { sender } = new sandbox.RTCPeerConnection().addTransceiver('video');
  await sender.replaceTrack(out);
  assert.equal(sender._track, out);
  assert.equal(created.generators.length, 1);
});

test('stops wrapper when no sender uses the track any more', async () => {
  const { sandbox, MM } = makeSandbox();
  const cam = new FakeTrack('video');
  const sender = new sandbox.RTCPeerConnection().addTrack(cam);
  const out = sender._track;
  await sender.replaceTrack(null);
  await tick();
  assert.equal(sender._track, null);
  assert.equal(sender.track, null);
  assert.equal(MM.wrappers.size, 0);
  assert.equal(out.readyState, 'ended');
  assert.equal(cam.stopped, false, 'Meet owns the camera; we never stop it');
});

test('keeps wrapper alive while another sender still uses it', async () => {
  const { sandbox, MM } = makeSandbox();
  const cam = new FakeTrack('video');
  const a = new sandbox.RTCPeerConnection().addTrack(cam);
  new sandbox.RTCPeerConnection().addTrack(cam);
  await a.replaceTrack(null);
  assert.equal(MM.wrappers.size, 1);
});

test('passes through when insertable streams are missing', () => {
  const { sandbox, MM } = makeSandbox({ insertable: false });
  const cam = new FakeTrack('video');
  const sender = new sandbox.RTCPeerConnection().addTrack(cam);
  assert.equal(sender._track, cam);
  assert.equal(MM.stats.path, 'none');
});

test('fails open when the processor constructor throws', () => {
  const { sandbox } = makeSandbox({ processorThrows: true });
  const cam = new FakeTrack('video');
  const sender = new sandbox.RTCPeerConnection().addTrack(cam);
  assert.equal(sender._track, cam);
});

test('audio passes through untouched when no mixer is installed', () => {
  const { sandbox, MM } = makeSandbox();
  const mic = new FakeTrack('audio');
  if (MM.mixer) return; // Task 10 installs a mixer; covered by audio-mix tests
  const sender = new sandbox.RTCPeerConnection().addTrack(mic);
  assert.equal(sender._track, mic);
});

test('output ends when the source ends', () => {
  const { sandbox, MM } = makeSandbox();
  const cam = new FakeTrack('video');
  const sender = new sandbox.RTCPeerConnection().addTrack(cam);
  const out = sender._track;
  let ended = false;
  out.addEventListener('ended', () => { ended = true; });
  cam.readyState = 'ended';
  cam.dispatchEvent(new sandbox.Event('ended'));
  assert.equal(ended, true);
  assert.equal(MM.wrappers.size, 0);
});

test('getUserMedia fallback processes only while no sender wrapper exists', async () => {
  const cam = new FakeTrack('video');
  const { sandbox, MM, created } = makeSandbox({
    navigator: { mediaDevices: { getUserMedia: async () => ({ getVideoTracks: () => [cam], getAudioTracks: () => [] }) } },
  });
  const calls = [];
  MM.processFrame = (f) => { calls.push(f); return f; };
  const stream = await sandbox.navigator.mediaDevices.getUserMedia({ video: true });
  const gumOut = stream.getVideoTracks()[0];
  assert.equal(gumOut.label, 'video-cam', 'looks like the camera to Meet');
  const gumProc = created.processors[0];
  const push = async (p) => { p.controller.enqueue({ close() {} }); await tick(); await tick(); };

  await push(gumProc);
  assert.equal(calls.length, 1, 'fallback processes when nothing is wrapped at the sender');
  assert.equal(MM.stats.path, 'gum');

  // Meet applies an effect and sends a different (post-effect) track.
  const sender = new sandbox.RTCPeerConnection().addTrack(new FakeTrack('video', 'meet-effects'));
  assert.equal(MM.stats.path, 'sender');
  await push(gumProc);
  assert.equal(calls.length, 1, 'fallback passes through once the sender path is live');

  // Meet sends our gUM output directly: not wrapped twice, fallback keeps working.
  await sender.replaceTrack(gumOut);
  assert.equal(sender._track, gumOut);
  await push(gumProc);
  assert.equal(calls.length, 2);
});

test('screen share tracks are never wrapped (video or audio)', async () => {
  const screen = new FakeTrack('video', 'screen:0');
  const tabAudio = new FakeTrack('audio', 'Tab audio');
  const { sandbox, MM } = makeSandbox({
    navigator: { mediaDevices: {
      getUserMedia: async () => ({ getVideoTracks: () => [], getAudioTracks: () => [] }),
      getDisplayMedia: async () => ({ getTracks: () => [screen, tabAudio], getVideoTracks: () => [screen], getAudioTracks: () => [tabAudio] }),
    } },
  });
  await sandbox.navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  const pc = new sandbox.RTCPeerConnection();
  assert.equal(pc.addTrack(screen)._track, screen);
  assert.equal(pc.addTrack(tabAudio)._track, tabAudio);
  assert.equal(MM.wrappers.size, 0);
});

test('a video track with a displaySurface setting is treated as a screen share', () => {
  const { sandbox } = makeSandbox();
  const t = new FakeTrack('video', 'window');
  t.getSettings = () => ({ displaySurface: 'window' });
  assert.equal(new sandbox.RTCPeerConnection().addTrack(t)._track, t);
});
