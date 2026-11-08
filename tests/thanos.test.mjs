import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ThanosTimeline, PAUSE_MS, DISSOLVE_MS, RETURN_MS } from '../extension/src/fx/thanos-timeline.js';
import { BackgroundModel } from '../extension/src/fx/bg-model.js';

test('snap → silent pause → dissolving → gone', () => {
  const t = new ThanosTimeline();
  t.snap(1000);
  assert.equal(t.update(1000).state, 'pause');
  assert.equal(t.update(1000 + PAUSE_MS - 1).state, 'pause');
  const d = t.update(1000 + PAUSE_MS + DISSOLVE_MS / 2);
  assert.equal(d.state, 'dissolving');
  assert.ok(Math.abs(d.progress - 0.5) < 0.01);
  assert.equal(t.update(1000 + PAUSE_MS + DISSOLVE_MS + 1).state, 'gone');
});

test('second snap while gone (or dissolving) brings you back', () => {
  const t = new ThanosTimeline();
  t.snap(0);
  t.update(PAUSE_MS + DISSOLVE_MS + 10);
  t.snap(5000);
  assert.equal(t.update(5000).state, 'returning');
  assert.equal(t.update(5000 + RETURN_MS + 1).state, 'idle');
  const u = new ThanosTimeline();
  u.snap(0); u.update(PAUSE_MS + 100); u.snap(PAUSE_MS + 200);
  assert.equal(u.update(PAUSE_MS + 200).state, 'returning');
});

test('a snap during the pause is ignored', () => {
  const t = new ThanosTimeline();
  t.snap(0); t.snap(300);
  assert.equal(t.update(300).state, 'pause');
});

test('auto return after 20 s gone', () => {
  const t = new ThanosTimeline({ autoReturnMs: 20000 });
  t.snap(0);
  const goneAt = PAUSE_MS + DISSOLVE_MS;
  t.update(goneAt + 1);
  assert.equal(t.update(goneAt + 19999).state, 'gone');
  assert.equal(t.update(goneAt + 20001).state, 'returning');
});

test('background model learns only pixels away from the person', () => {
  const w = 8, h = 1, bg = new BackgroundModel(w, h, { dilate: 1 });
  const frame = new Uint8ClampedArray(w * 4).fill(100);
  const mask = new Uint8ClampedArray(w * 4); // alpha = person confidence
  mask[4 * 4 + 3] = 255; // person at x=4
  bg.learn(frame, mask);
  const { known } = bg.snapshot();
  assert.deepEqual(Array.from(known), [1, 1, 1, 0, 0, 0, 1, 1], 'person plus 1px margin stays unknown');
});

test('background model blends repeated sightings and remembers once seen', () => {
  const bg = new BackgroundModel(2, 1, { dilate: 0, alpha: 0.5, jump: 1000 });
  bg.learn(new Uint8ClampedArray([100, 100, 100, 255, 0, 0, 0, 255]), new Uint8ClampedArray(8));
  bg.learn(new Uint8ClampedArray([200, 200, 200, 255, 0, 0, 0, 255]), new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]));
  const { rgba, known } = bg.snapshot();
  assert.equal(rgba[0], 150);
  assert.equal(known[1], 1, 'pixel 1 was seen before the person covered it');
  assert.equal(rgba[4], 0);
});

test('background model only trusts pixels seen as background several times', () => {
  const bg = new BackgroundModel(1, 1, { dilate: 0, minSeen: 3 });
  const px = new Uint8ClampedArray([90, 90, 90, 255]), none = new Uint8ClampedArray(4);
  bg.learn(px, none); bg.learn(px, none);
  assert.equal(bg.snapshot().known[0], 0, 'two sightings are not enough');
  bg.learn(px, none);
  assert.equal(bg.snapshot().known[0], 1);
});

test('a sudden change (a person drifting into a misdetected spot) resets trust', () => {
  const bg = new BackgroundModel(1, 1, { dilate: 0, minSeen: 2 });
  const wall = new Uint8ClampedArray([90, 90, 90, 255]), shirt = new Uint8ClampedArray([200, 210, 240, 255]), none = new Uint8ClampedArray(4);
  bg.learn(wall, none); bg.learn(wall, none);
  bg.learn(shirt, none);
  assert.equal(bg.snapshot().known[0], 0, 'big jump: no longer trusted');
  assert.equal(bg.snapshot().rgba[0], 90, 'and the old value is not overwritten by the outlier');
});
