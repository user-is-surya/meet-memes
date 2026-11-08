import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FullscreenEffect } from '../extension/src/renderers/fullscreen.js';

const def = { id: 'michael-scott', name: 'M', render: { type: 'fullscreen', clip: 'clip.webp', minMs: 1500, releaseMs: 1000 } };
function make() {
  const e = new FullscreenEffect(def, {});
  e.clip = { duration: 4800, ready: true, start() {}, frameAt() { return null; } };
  return e;
}

test('fullscreen clip plays to the end while the pose is held', () => {
  const e = make();
  e.fire({}, 0);
  for (let t = 0; t <= 4700; t += 100) { e.setHeld(true, t); assert.equal(e.isActive(t), true, `t=${t}`); }
  assert.equal(e.isActive(5100), false);
});

test('lowering your hands ends it early (after the first 1.5 s), 1 s later', () => {
  const e = make();
  e.fire({}, 0);
  e.setHeld(true, 100);
  e.setHeld(false, 600); // released early: still plays at least 1.5 s
  assert.equal(e.isActive(1400), true);
  assert.equal(e.isActive(1700), false);
  const f = make();
  f.fire({}, 0);
  f.setHeld(true, 100);
  f.setHeld(false, 2000);
  assert.equal(f.isActive(2900), true);
  assert.equal(f.isActive(3100), false);
});

test('hotkey plays the whole clip', () => {
  const e = make();
  e.fire({}, 0, { hotkey: true });
  assert.equal(e.isActive(4700), true);
});
