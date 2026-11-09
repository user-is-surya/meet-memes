import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hand } from './helpers/hands.mjs';
import { handPose, OneEuro } from '../extension/src/draw/pose.js';
import { Board } from '../extension/src/draw/board.js';
import { DrawMode, PALETTE, swatchAt } from '../extension/src/draw/draw-mode.js';

const A = 16 / 9;
const point = (x, y, extra = {}) => hand({ x, y, fingers: { middle: 'curl', ring: 'curl', pinky: 'curl' }, ...extra });
const two = (x, y) => hand({ x, y, fingers: { ring: 'curl', pinky: 'curl' } });
const palm = (x, y, extra = {}) => hand({ x, y, ...extra });
const fist = (x, y) => hand({ x, y, fingers: { index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' } });
const det = (hands) => ({ hands, face: null, aspect: A });

function mode(settings = {}) {
  const s = { drawColor: 0, ...settings };
  const log = { saves: [], toasts: [] };
  const m = new DrawMode({ getSettings: () => s, save: (p) => { Object.assign(s, p); log.saves.push(p); }, toast: (t) => log.toasts.push(t) });
  return { m, s, log };
}

// Feeds frames at 30 fps; `make(i)` returns the hands for frame i.
function feed(m, from, n, make) {
  let t = from;
  for (let i = 0; i < n; i++, t += 33) m.update(det(make(i)), t);
  return t;
}

test('handPose: one finger draws, two fingers hover, open palm erases, fist does nothing', () => {
  assert.equal(handPose(point(0.5, 0.6).landmarks, A), 'draw');
  assert.equal(handPose(two(0.5, 0.6).landmarks, A), 'hover');
  assert.equal(handPose(palm(0.5, 0.6).landmarks, A), 'erase');
  assert.equal(handPose(fist(0.5, 0.6).landmarks, A), null);
});

test('OneEuro smooths jitter on a still fingertip', () => {
  const f = new OneEuro();
  const raw = [], out = [];
  for (let i = 0; i < 60; i++) {
    const x = 0.5 + (i % 2 ? 0.004 : -0.004);
    raw.push(x);
    out.push(f.filter(x, i * 33));
  }
  const spread = (a) => Math.max(...a.slice(20)) - Math.min(...a.slice(20));
  assert.ok(spread(out) < spread(raw) * 0.5, `raw ${spread(raw)} smooth ${spread(out)}`);
});

test('Board: erase splits strokes, undo and clear', () => {
  const b = new Board();
  b.begin({ x: 0.1, y: 0.5 }, 0, 'thin');
  for (let i = 1; i <= 8; i++) b.add({ x: 0.1 + i * 0.1, y: 0.5 });
  b.end();
  b.erase({ x: 0.5, y: 0.5 }, 0.06, A);
  assert.equal(b.strokes.length, 2, 'cut in two');
  assert.ok(b.strokes.every((s) => s.points.every((p) => Math.abs(p.x - 0.5) * A > 0.06)));
  b.begin({ x: 0.2, y: 0.2 }, 1, 'thin'); b.add({ x: 0.3, y: 0.2 }); b.end();
  assert.equal(b.strokes.length, 3);
  b.undo();
  assert.equal(b.strokes.length, 2);
  const v = b.version;
  b.clear();
  assert.equal(b.strokes.length, 0);
  assert.ok(b.version > v, 'version bumps on change');
});

test('draw mode: pointing and moving draws one stroke in the current colour', () => {
  const { m } = mode({ drawColor: 2 });
  feed(m, 0, 20, (i) => [point(0.3 + i * 0.01, 0.6)]);
  m.update(det([fist(0.5, 0.6)]), 700);
  m.update(det([fist(0.5, 0.6)]), 733);
  assert.equal(m.board.strokes.length, 1);
  const s = m.board.strokes[0];
  assert.equal(s.color, 2);
  assert.ok(s.points.length >= 15, `points: ${s.points.length}`);
});

test('draw mode: one missed frame does not break the stroke, two lift the pen', () => {
  const { m } = mode();
  const t = feed(m, 0, 10, (i) => [point(0.3 + i * 0.01, 0.6)]);
  m.update(det([two(0.4, 0.6)]), t);
  feed(m, t + 33, 10, (i) => [point(0.41 + i * 0.01, 0.6)]);
  m.update(det([]), 2000); m.update(det([]), 2033);
  assert.equal(m.board.strokes.length, 1, 'still one stroke');
  feed(m, 3000, 10, (i) => [point(0.3 + i * 0.01, 0.7)]);
  m.update(det([]), 4000); m.update(det([]), 4033);
  assert.equal(m.board.strokes.length, 2);
});

test('draw mode: hovering with two fingers leaves no ink', () => {
  const { m } = mode();
  feed(m, 0, 20, (i) => [two(0.3 + i * 0.01, 0.6)]);
  assert.equal(m.board.strokes.length, 0);
});

test('draw mode: open palm erases ink under it', () => {
  const { m } = mode();
  feed(m, 0, 30, (i) => [point(0.2 + i * 0.02, 0.5)]);
  feed(m, 1000, 3, () => []);
  const before = m.board.strokes.reduce((n, s) => n + s.points.length, 0);
  // The ink is at the fingertip (0.114 above the wrist, y ≈ 0.386); the palm centre is
  // 0.04 above the wrist, so a wrist at y 0.43 puts the palm on the line.
  feed(m, 2000, 10, () => [palm(0.5, 0.43)]);
  const after = m.board.strokes.reduce((n, s) => n + s.points.length, 0);
  assert.ok(after < before, `points ${before} -> ${after}`);
});

test('draw mode: both palms held for a second clears the board', () => {
  const { m } = mode();
  feed(m, 0, 20, (i) => [point(0.3 + i * 0.01, 0.6)]);
  feed(m, 700, 3, () => []);
  assert.equal(m.board.strokes.length, 1);
  const both = () => [palm(0.25, 0.9, { handedness: 'Left' }), palm(0.75, 0.9)];
  let t = feed(m, 1000, 15, both);
  assert.equal(m.board.strokes.length, 1, 'not yet');
  assert.ok(m.clearProgress > 0 && m.clearProgress < 1);
  t = feed(m, t, 20, both);
  assert.equal(m.board.strokes.length, 0);
});

test('draw mode: hovering a palette swatch for 0.4 s picks that colour; no ink in the palette strip', () => {
  const { m, s, log } = mode({ drawColor: 0 });
  const sw = PALETTE[3];
  // Put the index fingertip on the swatch: the tip sits 1.9 hand sizes above the wrist.
  const h = (dx = 0) => point(sw.x + 0.3 * 0.06 + dx, sw.y + 1.9 * 0.06);
  assert.equal(swatchAt({ x: sw.x, y: sw.y }), 3);
  feed(m, 0, 6, () => [h()]);
  assert.equal(s.drawColor, 0, 'not after 0.2 s');
  feed(m, 200, 10, () => [h()]);
  assert.equal(s.drawColor, 3);
  assert.deepEqual(log.saves.at(-1), { drawColor: 3 });
  assert.equal(m.board.strokes.length, 0, 'no ink drawn while picking');
});

test('draw mode: keys pick colours, undo and clear', () => {
  const { m, s } = mode();
  assert.equal(m.hotkey('Alt+Shift+5'), true);
  assert.equal(s.drawColor, 4);
  assert.equal(m.hotkey('Alt+Shift+9'), false);
  feed(m, 0, 10, (i) => [point(0.3 + i * 0.01, 0.6)]);
  feed(m, 400, 3, () => []);
  feed(m, 600, 10, (i) => [point(0.3 + i * 0.01, 0.7)]);
  feed(m, 1000, 3, () => []);
  assert.equal(m.board.strokes.length, 2);
  m.tool('undo');
  assert.equal(m.board.strokes.length, 1);
  m.tool('clear');
  assert.equal(m.board.strokes.length, 0);
});
