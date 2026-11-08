import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameBudget } from '../extension/src/gfx/budget.js';

test('drops quality after sustained overrun', () => {
  const b = new FrameBudget(8);
  for (let i = 0; i < 9; i++) b.record(12);
  assert.equal(b.quality, 1, 'nine slow frames are tolerated');
  b.record(12);
  assert.ok(Math.abs(b.quality - 0.9) < 1e-9);
});

test('recovers slowly when comfortably under budget', () => {
  const b = new FrameBudget(8);
  for (let i = 0; i < 30; i++) b.record(20);
  const low = b.quality;
  for (let i = 0; i < 59; i++) b.record(2);
  assert.equal(b.quality, low);
  b.record(2);
  assert.ok(Math.abs(b.quality - (low + 0.05)) < 1e-9);
});

test('clamps between 0.25 and 1', () => {
  const b = new FrameBudget(8);
  for (let i = 0; i < 500; i++) b.record(50);
  assert.equal(b.quality, 0.25);
  for (let i = 0; i < 5000; i++) b.record(1);
  assert.equal(b.quality, 1);
});

test('a single spike resets nothing but does not count as sustained', () => {
  const b = new FrameBudget(8);
  for (let i = 0; i < 5; i++) b.record(12);
  b.record(3);
  for (let i = 0; i < 5; i++) b.record(12);
  assert.equal(b.quality, 1);
});
