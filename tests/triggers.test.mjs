// Unit tests for gesture triggers using synthetic MediaPipe-style hand landmarks.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrigger, TriggerArbiter } from '../extension/src/triggers/index.js';
import { hand } from './helpers/hands.mjs';

const FACE = { box: { x: 0.4, y: 0.3, w: 0.2, h: 0.3 }, nose: { x: 0.5, y: 0.45 }, blendshapes: {} };
const det = (hands, face = FACE) => ({ hands, face, aspect: 1 });
const ctx = { audio: () => null };
const fist = { index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' };

test('gesture trigger respects holdMs', () => {
  const t = createTrigger({ type: 'gesture', gesture: 'Thumb_Up', holdMs: 300 }, ctx);
  const d = det([hand({ x: 0.5, y: 0.5, gesture: 'Thumb_Up' })]);
  assert.equal(t.update(d, 0).active, false);
  assert.equal(t.update(d, 350).active, true);
  assert.equal(t.update(det([hand({ x: 0.5, y: 0.5 })]), 400).active, false);
});

test('both hands up beside the head (Absolute Cinema)', () => {
  const t = createTrigger({ type: 'both-hands-up', holdMs: 0 }, ctx);
  const up = det([hand({ x: 0.2, y: 0.35, spread: 1.5 }), hand({ x: 0.8, y: 0.35, handedness: 'Left', spread: 1.5 })]);
  assert.equal(t.update(up, 0).active, true);
  const oneHand = det([hand({ x: 0.2, y: 0.35, spread: 1.5 })]);
  assert.equal(t.update(oneHand, 10).active, false);
  const handsLow = det([hand({ x: 0.2, y: 0.9, spread: 1.5 }), hand({ x: 0.8, y: 0.9, spread: 1.5 })]);
  assert.equal(t.update(handsLow, 20).active, false);
});

test('hands over face (Michael Scott)', () => {
  const t = createTrigger({ type: 'hands-over-face', hands: 2, holdMs: 0 }, ctx);
  const covering = det([hand({ x: 0.45, y: 0.45, s: 0.04 }), hand({ x: 0.55, y: 0.45, s: 0.04 })]);
  assert.equal(t.update(covering, 0).active, true);
  const aside = det([hand({ x: 0.1, y: 0.45, s: 0.04 }), hand({ x: 0.9, y: 0.45, s: 0.04 })]);
  assert.equal(t.update(aside, 10).active, false);
});

test('index fingers pointing at the head (Feel the aura)', () => {
  const t = createTrigger({ type: 'hands-on-head', hands: 2, holdMs: 0 }, ctx);
  const point = { middle: 'curl', ring: 'curl', pinky: 'curl' };
  const right = hand({ x: 0.8, y: 0.42, dir: { x: -1, y: 0 }, fingers: point });
  const left = hand({ x: 0.2, y: 0.42, dir: { x: 1, y: 0 }, fingers: point, handedness: 'Left' });
  assert.equal(t.update(det([right, left]), 0).active, true);
  // Pointing away from the head does not count.
  const away = hand({ x: 0.8, y: 0.42, dir: { x: 1, y: 0 }, fingers: point });
  assert.equal(t.update(det([away, left]), 10).active, false);
  // Open hands (not pointing) do not count.
  const open = hand({ x: 0.8, y: 0.42, dir: { x: -1, y: 0 } });
  assert.equal(t.update(det([open, left]), 20).active, false);
});

test('throw: fist then a fast sweep fires once', () => {
  const t = createTrigger({ type: 'throw' }, ctx);
  let fired = 0;
  for (const [time, x] of [[0, 0.3], [100, 0.3], [200, 0.3], [300, 0.32]]) {
    if (t.update(det([hand({ x, y: 0.5, fingers: fist })]), time).active) fired++;
  }
  if (t.update(det([hand({ x: 0.8, y: 0.45 })]), 400).active) fired++;
  if (t.update(det([hand({ x: 0.85, y: 0.45 })]), 450).active) fired++;
  assert.equal(fired, 1);
});

test('throw: slow movement does not fire', () => {
  const t = createTrigger({ type: 'throw' }, ctx);
  let fired = false;
  for (let i = 0; i <= 20; i++) {
    fired ||= t.update(det([hand({ x: 0.2 + i * 0.03, y: 0.5, fingers: i < 3 ? fist : {} })]), i * 100).active;
  }
  assert.equal(fired, false);
});

test('snap without mic: pinch then middle finger into the palm', () => {
  const t = createTrigger({ type: 'snap' }, ctx);
  const open = hand({ x: 0.5, y: 0.6 });
  const middleTip = open.landmarks[12];
  const pinch = hand({ x: 0.5, y: 0.6, fingers: { index: 'curl' }, thumbTip: { x: middleTip.x + 0.005, y: middleTip.y } });
  const snapped = hand({ x: 0.5, y: 0.6, fingers: { index: 'curl', middle: 'curl' } });
  assert.equal(t.update(det([pinch]), 0).active, false);
  assert.equal(t.update(det([pinch]), 60).active, false);
  assert.equal(t.update(det([snapped]), 130).active, true);
  // Releasing a pinch slowly (well after it) does not fire.
  t.update(det([pinch]), 1000);
  assert.equal(t.update(det([snapped]), 1600).active, false);
});

test('snap with mic: needs the sound after a pinch', () => {
  const audio = { running: true, lastSpikeAt: -Infinity, spikeSince(t) { return this.lastSpikeAt >= t; } };
  const t = createTrigger({ type: 'snap' }, { audio: () => audio });
  const open = hand({ x: 0.5, y: 0.6 });
  const tip = open.landmarks[12];
  const pinch = hand({ x: 0.5, y: 0.6, thumbTip: { x: tip.x, y: tip.y } });
  assert.equal(t.update(det([pinch]), 0).active, false);
  assert.equal(t.update(det([open]), 80).active, false); // released but silent
  audio.lastSpikeAt = 100;
  assert.equal(t.update(det([open]), 150).active, true);
});

test('any-of trigger arrays and hotkey-only memes', () => {
  assert.equal(createTrigger(null, ctx), null);
  const t = createTrigger([
    { type: 'gesture', gesture: 'Victory' },
    { type: 'expression', blendshapes: { jawOpen: 0.6 } },
  ], ctx);
  const face = { ...FACE, blendshapes: { jawOpen: 0.8 } };
  assert.equal(t.update(det([], face), 0).active, true);
  assert.equal(t.update(det([]), 10).active, false);
});

// ---- stability layer + arbiter ----
const thumb = (on) => det([hand({ x: 0.5, y: 0.5, gesture: on ? 'Thumb_Up' : 'None' })]);

test('stable: fires at 70% with dropouts in the hold window', () => {
  const t = createTrigger({ type: 'gesture', gesture: 'Thumb_Up', holdMs: 450 }, ctx);
  const pattern = [1, 1, 0, 1, 1, 0, 1, 0, 1, 1]; // 7 of 10, newest is a hit
  let r;
  pattern.forEach((on, i) => { r = t.update(thumb(on), i * 55); });
  assert.equal(r.active, true);
});

test('stable: alternating hit/miss (flicker) never fires', () => {
  const t = createTrigger({ type: 'gesture', gesture: 'Thumb_Up', holdMs: 300 }, ctx);
  let fired = false;
  for (let i = 0; i < 40; i++) fired ||= t.update(thumb(i % 2 === 0), i * 50).active;
  assert.equal(fired, false);
});

test('stable: reports partial progress while holding', () => {
  const t = createTrigger({ type: 'gesture', gesture: 'Thumb_Up', holdMs: 400 }, ctx);
  t.update(thumb(true), 0);
  const r = t.update(thumb(true), 200);
  assert.equal(r.active, false);
  assert.ok(r.progress > 0.4 && r.progress < 0.6, String(r.progress));
});

const cand = (id, priority, active, extra = {}) => ({ id, priority, active, progress: active ? 1 : 0, cooldownUntil: 0, ...extra });

test('arbiter: higher priority (lower number) wins a tie', () => {
  const a = new TriggerArbiter();
  const r = a.decide([cand('noice', 4, true), cand('cinema', 2, true)], 1000);
  assert.equal(r.fire, 'cinema');
});

test('arbiter: quiet period blocks a second fire within 1500 ms', () => {
  const a = new TriggerArbiter();
  assert.equal(a.decide([cand('cinema', 2, true)], 1000).fire, 'cinema');
  assert.equal(a.decide([cand('cinema', 2, false), cand('noice', 4, false)], 1100).fire, null);
  assert.equal(a.decide([cand('cinema', 2, false), cand('noice', 4, true)], 2000).fire, null, 'blocked: inside quiet period');
  assert.equal(a.decide([cand('cinema', 2, false), cand('noice', 4, true)], 2600).fire, null, 'no late fire for a pose held through the quiet period');
  assert.equal(a.decide([cand('cinema', 2, false), cand('noice', 4, false)], 2700).fire, null);
  assert.equal(a.decide([cand('cinema', 2, false), cand('noice', 4, true)], 2800).fire, 'noice');
});

test('arbiter: fires only on the rising edge and respects cooldown', () => {
  const a = new TriggerArbiter({ quietMs: 0 });
  assert.equal(a.decide([cand('x', 1, true)], 0).fire, 'x');
  assert.equal(a.decide([cand('x', 1, true)], 100).fire, null);
  assert.equal(a.decide([cand('x', 1, false)], 200).fire, null);
  assert.equal(a.decide([cand('x', 1, true, { cooldownUntil: 5000 })], 300).fire, null);
});

test('arbiter: progress reports partial holds, hidden during quiet period', () => {
  const a = new TriggerArbiter();
  let r = a.decide([cand('noice', 4, false, { progress: 0.5 })], 0);
  assert.equal(r.progress.get('noice'), 0.5);
  a.decide([cand('cinema', 2, true)], 100);
  r = a.decide([cand('cinema', 2, true), cand('noice', 4, false, { progress: 0.5 })], 200);
  assert.equal(r.progress.has('noice'), false);
});

test('Absolute Cinema rejects open hands with fingers held together', () => {
  const t = createTrigger({ type: 'both-hands-up', holdMs: 0 }, ctx);
  const together = det([hand({ x: 0.2, y: 0.35 }), hand({ x: 0.8, y: 0.35, handedness: 'Left' })]);
  assert.equal(t.update(together, 0).active, false);
});

test('Absolute Cinema rejects fists raised beside the head', () => {
  const t = createTrigger({ type: 'both-hands-up', holdMs: 0 }, ctx);
  const fists = det([hand({ x: 0.2, y: 0.35, fingers: fist }), hand({ x: 0.8, y: 0.35, fingers: fist, handedness: 'Left' })]);
  assert.equal(t.update(fists, 0).active, false);
});

// ---- Noice: thumbs up beside the face + tongue click ----
const thumbAt = (x, y) => det([hand({ x, y, gesture: 'Thumb_Up', fingers: { index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' } })]);
const mic = () => ({ running: true, lastSpikeAt: -Infinity, lastClickAt: -Infinity, spikeSince(t) { return this.lastSpikeAt >= t; } });

test('Noice: thumb beside the face fires on a tongue click (with mic)', () => {
  const audio = mic();
  const t = createTrigger({ type: 'thumb-by-face' }, { audio: () => audio });
  let fired = 0;
  for (let ms = 0; ms <= 1500; ms += 50) if (t.update(thumbAt(0.68, 0.45), ms).active) fired++;
  assert.equal(fired, 0, 'no click, no fire, even when held');
  audio.lastClickAt = 1520;
  assert.equal(t.update(thumbAt(0.68, 0.45), 1550).active, true);
});

test('Noice: a click before the thumb has been up 200 ms does not count', () => {
  const audio = mic();
  const t = createTrigger({ type: 'thumb-by-face' }, { audio: () => audio });
  t.update(thumbAt(0.68, 0.45), 0);
  audio.lastClickAt = 50;
  assert.equal(t.update(thumbAt(0.68, 0.45), 100).active, false);
});

test('Noice: thumbs up at chest height never fires', () => {
  const audio = mic();
  const t = createTrigger({ type: 'thumb-by-face' }, { audio: () => audio });
  let fired = false;
  for (let ms = 0; ms <= 2000; ms += 50) { audio.lastClickAt = ms; fired ||= t.update(thumbAt(0.5, 0.88), ms).active; }
  assert.equal(fired, false);
});

test('Noice without mic: hold the thumb beside the face for 1.2 s', () => {
  const t = createTrigger({ type: 'thumb-by-face' }, { audio: () => null });
  assert.equal(t.update(thumbAt(0.32, 0.45), 0).active, false);
  assert.equal(t.update(thumbAt(0.32, 0.45), 1000).active, false);
  assert.equal(t.update(thumbAt(0.32, 0.45), 1250).active, true);
});

test('classifyTransient tells clicks from snaps and ignores speech', async () => {
  const { classifyTransient } = await import('../extension/src/content/audio.js');
  const rate = 48000, n = 1024;
  const burst = (peak, ms) => { const b = new Float32Array(n); const len = Math.round(rate * ms / 1000); for (let i = 0; i < Math.min(n, len); i++) b[i] = Math.sin(i * 0.9) * peak * Math.exp(-i / (len / 4)); return b; };
  const speech = new Float32Array(n).map((_, i) => Math.sin(i * 0.05) * 0.2 + Math.sin(i * 0.13) * 0.1);
  assert.equal(classifyTransient(burst(0.12, 6), 0.01), 'click');
  assert.equal(classifyTransient(burst(0.5, 8), 0.01), 'snap');
  assert.equal(classifyTransient(speech, 0.01), null);
  assert.equal(classifyTransient(new Float32Array(n), 0.01), null);
});
