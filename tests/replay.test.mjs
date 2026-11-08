import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraceRecorder, TRACE_VERSION } from '../extension/src/shared/trace.js';
import { replay, loadBundledDefs } from './replay.mjs';
import { hand, FACE } from './helpers/hands.mjs';

const handsUp = () => [hand({ x: 0.2, y: 0.35 }), hand({ x: 0.8, y: 0.35, handedness: 'Left' })];
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
