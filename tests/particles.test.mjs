import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParticleSystem } from '../extension/src/gfx/particles.js';

test('spawn respects capacity and init callback', () => {
  const ps = new ParticleSystem(4);
  const n = ps.spawn(10, (i, p) => { p.x = i * 0.1; p.y = 0.5; p.life = 1; p.size = 2; p.r = 1; p.a = 1; });
  assert.equal(n, 4);
  assert.equal(ps.count, 4);
  assert.ok(Math.abs(ps.x[3] - 0.3) < 1e-6);
});

test('step integrates velocity, applies drag/gravity/wind and ages particles', () => {
  const ps = new ParticleSystem(2);
  ps.spawn(1, (i, p) => { p.x = 0; p.y = 0; p.vx = 1; p.vy = 0; p.life = 1; });
  ps.step(0.1, { drag: 0, gravity: 1, wind: { x: 0.5, y: 0 } });
  assert.ok(Math.abs(ps.x[0] - 0.15) < 1e-6, 'x moves with velocity + wind');
  assert.ok(ps.vy[0] > 0, 'gravity pulls down (y grows)');
  assert.ok(Math.abs(ps.age[0] - 0.1) < 1e-6);
});

test('dead particles are removed and the array stays packed', () => {
  const ps = new ParticleSystem(3);
  ps.spawn(3, (i, p) => { p.x = i; p.life = i === 1 ? 0.05 : 1; });
  ps.step(0.1, {});
  assert.equal(ps.count, 2);
  assert.deepEqual([ps.x[0], ps.x[1]].sort(), [0, 2]);
});

test('custom force callback runs per particle', () => {
  const ps = new ParticleSystem(1);
  ps.spawn(1, (i, p) => { p.life = 1; });
  ps.step(0.1, { force: (i, sys, out) => { out.x = 2; out.y = 0; } });
  assert.ok(ps.vx[0] > 0.19 && ps.vx[0] < 0.21);
});
