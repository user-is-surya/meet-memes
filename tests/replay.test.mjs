import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraceRecorder, TRACE_VERSION } from '../extension/src/shared/trace.js';
import { replay, loadBundledDefs } from './replay.mjs';
import { hand, FACE } from './helpers/hands.mjs';

const handsUp = () => [hand({ x: 0.2, y: 0.35, spread: 1.5 }), hand({ x: 0.8, y: 0.35, handedness: 'Left', spread: 1.5 })];
const handsDown = () => [];

function synthetic(reps) {
  const rec = new TraceRecorder();
  rec.start('gesture-absolute-cinema', 16 / 9, { mic: false });
  let t = 0;
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < 30; i++, t += 33) rec.push({ hands: handsUp(), face: FACE }, t);
    for (let i = 0; i < 70; i++, t += 33) rec.push({ hands: handsDown(), face: FACE }, t);
  }
  return rec.stop();
}

test('recorder produces a versioned, JSON-safe trace with rounded landmarks', () => {
  const tr = synthetic(1);
  assert.equal(tr.version, TRACE_VERSION);
  assert.equal(tr.frames.length, 100);
  const x = tr.frames[0].hands[0].landmarks[0].x;
  assert.equal(x, Math.round(x * 1e4) / 1e4);
  assert.deepEqual(JSON.parse(JSON.stringify(tr)), tr);
});

test('replay fires the gesture once per repetition and nothing else', async () => {
  const defs = await loadBundledDefs();
  const { fires } = replay(synthetic(3), defs);
  assert.deepEqual(fires.map((f) => f.id), ['absolute-cinema', 'absolute-cinema', 'absolute-cinema']);
});

test('replay feeds recorded mic transients to the snap trigger', async () => {
  const defs = await loadBundledDefs();
  const rec = new TraceRecorder();
  rec.start('gesture-thanos-snap', 16 / 9, { mic: true });
  const open = hand({ x: 0.5, y: 0.6 });
  const tip = open.landmarks[12];
  const pinch = hand({ x: 0.5, y: 0.6, thumbTip: { x: tip.x, y: tip.y } });
  rec.push({ hands: [pinch], face: FACE }, 0);
  rec.push({ hands: [open], face: FACE }, 80, [100]);
  rec.push({ hands: [open], face: FACE }, 150);
  const { fires } = replay(rec.stop(), defs);
  assert.deepEqual(fires.map((f) => f.id), ['thanos-snap']);
});

test('mirrored traces (recorded in Practice) replay in camera space', async () => {
  const defs = await loadBundledDefs();
  const tr = synthetic(2);
  // Mirror every x and swap handedness, as the Practice tab records them.
  for (const f of tr.frames) {
    for (const h of f.hands) {
      h.handedness = h.handedness === 'Left' ? 'Right' : 'Left';
      for (const p of h.landmarks) p.x = Math.round((1 - p.x) * 1e4) / 1e4;
    }
    if (f.face) f.face = { ...f.face, box: { ...f.face.box, x: 1 - f.face.box.x - f.face.box.w }, nose: { ...f.face.nose, x: 1 - f.face.nose.x } };
  }
  tr.mirrored = true;
  const { fires } = replay(tr, defs);
  assert.equal(fires.length, 2);
});

test('unmirror restores camera-space coordinates', async () => {
  const { unmirrorFrame } = await import('./replay.mjs');
  const f = { hands: [{ handedness: 'Left', landmarks: [{ x: 0.2, y: 0.5 }], gesture: { name: 'None', score: 0 } }],
    face: { box: { x: 0.1, y: 0.2, w: 0.3, h: 0.3 }, nose: { x: 0.25, y: 0.3 }, blendshapes: { eyeBlinkLeft: 0.9 } } };
  const u = unmirrorFrame(f);
  assert.equal(u.hands[0].handedness, 'Right');
  assert.ok(Math.abs(u.hands[0].landmarks[0].x - 0.8) < 1e-9);
  assert.ok(Math.abs(u.face.box.x - 0.6) < 1e-9);
  assert.ok(Math.abs(u.face.nose.x - 0.75) < 1e-9);
  assert.equal(u.face.blendshapes.eyeBlinkRight, 0.9, 'left/right blendshapes swap too');
});
