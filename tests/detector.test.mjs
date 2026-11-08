import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceInfo } from '../extension/engine/detector-core.js';

function result({ yaw = 0 } = {}) {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[1] = { x: 0.5, y: 0.45, z: 0 };
  const ring = (cx, cy, r, base) => {
    lm[base] = { x: cx, y: cy, z: 0 };
    [[r, 0], [0, r], [-r, 0], [0, -r]].forEach(([dx, dy], i) => { lm[base + 1 + i] = { x: cx + dx, y: cy + dy, z: 0 }; });
  };
  ring(0.42, 0.4, 0.01, 468);
  ring(0.58, 0.4, 0.01, 473);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Column-major rotation about Y.
  const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -40, 1];
  return { faceLandmarks: [lm], faceBlendshapes: [{ categories: [{ categoryName: 'eyeWideLeft', score: 0.3 }] }], facialTransformationMatrixes: [{ data: m }] };
}

test('faceInfo reports iris centres and radii', () => {
  const f = faceInfo(result());
  assert.ok(Math.abs(f.eyes.left.x - 0.42) < 1e-6 && Math.abs(f.eyes.right.x - 0.58) < 1e-6);
  assert.ok(Math.abs(f.eyes.left.r - 0.01) < 1e-6);
  assert.equal(f.blendshapes.eyeWideLeft, 0.3);
});

test('faceInfo reports head yaw from the transformation matrix', () => {
  assert.ok(Math.abs(faceInfo(result()).pose.yaw) < 1e-6);
  assert.ok(faceInfo(result({ yaw: 0.4 })).pose.yaw > 0.3);
  assert.ok(faceInfo(result({ yaw: -0.4 })).pose.yaw < -0.3);
});
