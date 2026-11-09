import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hand, FACE } from './helpers/hands.mjs';
import { SpellGestures } from '../extension/src/spell/gestures.js';

const A = 16 / 9;
const det = (hands, face = FACE) => ({ hands, face, aspect: A });
const palmUp = (x, y, extra = {}) => hand({ x, y, ...extra });
const point = (x, y) => hand({ x, y, fingers: { middle: 'curl', ring: 'curl', pinky: 'curl' } });
const fist = (x, y) => hand({ x, y, fingers: { index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' } });

// Feeds frames at 30 fps; returns every result.
function feed(g, from, n, make, face = FACE) {
  const out = [];
  for (let i = 0, t = from; i < n; i++, t += 33) out.push({ t, ...g.update(det(make(i, t), face), t) });
  return out;
}

test('shield: one open palm, fingers up, held 0.3 s', () => {
  const g = new SpellGestures();
  const r = feed(g, 0, 15, () => [palmUp(0.7, 0.7)]);
  assert.equal(r[3].shields.length, 0, 'not instantly');
  const last = r.at(-1);
  assert.equal(last.shields.length, 1);
  assert.ok(Math.abs(last.shields[0].x - 0.7) < 0.03);
  assert.ok(last.shields[0].r > 0.05);
});

test('shield: a hand hanging down or a fist is not a shield', () => {
  const g = new SpellGestures();
  assert.equal(feed(g, 0, 20, () => [palmUp(0.7, 0.5, { dir: { x: 0, y: 1 } })]).at(-1).shields.length, 0);
  assert.equal(feed(g, 1000, 20, () => [fist(0.7, 0.7)]).at(-1).shields.length, 0);
});

test('orb: two open hands facing each other in front of the chest', () => {
  const g = new SpellGestures();
  const hands = () => [
    palmUp(0.4, 0.82, { dir: { x: 0.7, y: -0.7 }, handedness: 'Left' }),
    palmUp(0.6, 0.82, { dir: { x: -0.7, y: -0.7 } }),
  ];
  const last = feed(g, 0, 10, hands).at(-1);
  assert.ok(last.orb, 'orb');
  assert.ok(Math.abs(last.orb.x - 0.5) < 0.04, `centre ${last.orb.x}`);
  assert.ok(last.orb.r > 0.03 && last.orb.r < 0.25, `radius ${last.orb.r}`);
  assert.equal(last.shields.length, 0, 'no shields while making an orb');
  assert.equal(last.channel, null);
});

test('channel: both hands raised beside the head, fingers spread, held 0.4 s', () => {
  const g = new SpellGestures();
  const hands = () => [
    palmUp(0.28, 0.52, { spread: 1, handedness: 'Left' }),
    palmUp(0.72, 0.52, { spread: 1 }),
  ];
  const r = feed(g, 0, 20, hands);
  assert.equal(r[5].channel, null, 'not instantly');
  const last = r.at(-1);
  assert.ok(last.channel, 'channel');
  assert.equal(last.orb, null, 'not an orb');
  assert.equal(last.shields.length, 0);
});

test('blast: an open palm pushed at the camera fires once; slowly coming closer does not', () => {
  const g = new SpellGestures();
  // Fast push: hand size 0.06 -> 0.09 in ~200 ms.
  const fast = feed(g, 0, 20, (i) => [palmUp(0.6, 0.7, { s: 0.06 + Math.min(i, 6) * 0.005 })]);
  const blasts = fast.flatMap((r) => r.blasts);
  assert.equal(blasts.length, 1);
  assert.ok(Math.abs(blasts[0].x - 0.6) < 0.05);

  const g2 = new SpellGestures();
  const slow = feed(g2, 0, 90, (i) => [palmUp(0.6, 0.7, { s: 0.06 + i * 0.0004 })]);
  assert.equal(slow.flatMap((r) => r.blasts).length, 0);
});

test('portal: tracing a circle with the index finger opens a portal there; a straight swipe does not', () => {
  const g = new SpellGestures();
  const cx = 0.55, cy = 0.45, R = 0.11;
  const r = feed(g, 0, 36, (i) => {
    const a = (i / 30) * Math.PI * 2;
    const tip = { x: cx + Math.cos(a) * R / A, y: cy + Math.sin(a) * R };
    return [point(tip.x + 0.018, tip.y + 0.114)];
  });
  const portals = r.flatMap((x) => x.portals);
  assert.equal(portals.length, 1, `portals: ${portals.length}`);
  assert.ok(Math.abs(portals[0].x - cx) < 0.03 && Math.abs(portals[0].y - cy) < 0.03, JSON.stringify(portals[0]));
  assert.ok(Math.abs(portals[0].r - R) < 0.03, `r ${portals[0].r}`);

  const g2 = new SpellGestures();
  const line = feed(g2, 0, 36, (i) => [point(0.2 + i * 0.015, 0.6)]);
  assert.equal(line.flatMap((x) => x.portals).length, 0);
});

test('nothing in view: nothing happens', () => {
  const g = new SpellGestures();
  const last = feed(g, 0, 10, () => []).at(-1);
  assert.deepEqual([last.shields.length, last.orb, last.channel, last.blasts.length, last.portals.length], [0, null, null, 0, 0]);
});

// --- SpellMode (logic; drawing is covered by the browser test) ---
import { SpellMode, STYLES } from '../extension/src/spell/spell-mode.js';

function spellMode(settings = {}) {
  const s = { spellStyle: 'strange', ...settings };
  const log = { plays: [], stops: 0, saves: [], toasts: [] };
  const sfx = {
    load: () => Promise.resolve(true),
    play: (key, o) => { log.plays.push({ key, ...o }); return { stop: () => { log.stops++; } }; },
  };
  const m = new SpellMode({ getSettings: () => s, save: (p) => { Object.assign(s, p); log.saves.push(p); }, toast: (t) => log.toasts.push(t), sfx });
  return { m, s, log };
}

test('spell mode: Alt+Shift+1/2/3 pick Strange, Wanda, Doom', () => {
  const { m, s, log } = spellMode();
  assert.deepEqual(Object.keys(STYLES), ['strange', 'wanda', 'doom']);
  assert.equal(m.hotkey('Alt+Shift+2'), true);
  assert.equal(s.spellStyle, 'wanda');
  assert.match(log.toasts.at(-1), /wanda/i);
  assert.equal(m.hotkey('Alt+Shift+3'), true);
  assert.equal(s.spellStyle, 'doom');
  assert.equal(m.hotkey('Alt+Shift+6'), false);
});

test('spell mode: a portal stays open for 6 s, then closes', () => {
  const { m, log } = spellMode();
  const cx = 0.55, cy = 0.45, R = 0.11;
  let t = 0;
  for (let i = 0; i < 36; i++, t += 33) {
    const a = (i / 30) * Math.PI * 2;
    m.update(det([point(cx + Math.cos(a) * R / A + 0.018, cy + Math.sin(a) * R + 0.114)]), t);
  }
  assert.equal(m.portals.length, 1);
  assert.ok(log.plays.some((p) => p.key === 'spell:portal'), 'portal sound');
  m.update(det([]), t + 3000);
  assert.equal(m.portals.length, 1, 'still open at 3 s');
  m.update(det([]), t + 6600);
  assert.equal(m.portals.length, 0, 'closed after 6 s');
});

test('spell mode: a blast plays its sound and finishes within a second', () => {
  const { m, log } = spellMode();
  let t = 0;
  for (let i = 0; i < 10; i++, t += 33) m.update(det([palmUp(0.6, 0.7, { s: 0.06 + Math.min(i, 6) * 0.005 })]), t);
  assert.equal(m.blasts.length, 1);
  assert.ok(log.plays.some((p) => p.key === 'spell:blast'));
  m.update(det([]), t + 1200);
  assert.equal(m.blasts.length, 0);
});

test('spell mode: holding a shield loops the hum; letting go stops it', () => {
  const { m, log } = spellMode();
  let t = 0;
  for (let i = 0; i < 15; i++, t += 33) m.update(det([palmUp(0.7, 0.7)]), t);
  assert.ok(m.shields.size >= 1);
  const hums = log.plays.filter((p) => p.key === 'spell:hum');
  assert.equal(hums.length, 1);
  assert.equal(hums[0].loop, true);
  for (let i = 0; i < 15; i++, t += 33) m.update(det([]), t);
  assert.equal(log.stops, 1);
  assert.equal(m.shields.size, 0, 'shield faded out');
});

test('spell mode: pause() stops sounds and clears held spells', () => {
  const { m, log } = spellMode();
  let t = 0;
  for (let i = 0; i < 15; i++, t += 33) m.update(det([palmUp(0.7, 0.7)]), t);
  m.pause();
  assert.equal(log.stops, 1);
  assert.equal(m.shields.size, 0);
});

test('spell mode: Alt+Shift+4 casts a blast and Alt+Shift+5 opens a portal, no gesture needed', () => {
  const { m, log } = spellMode();
  m.update(det([]), 0);
  assert.equal(m.hotkey('Alt+Shift+4', 100), true);
  assert.equal(m.blasts.length, 1);
  assert.ok(log.plays.some((p) => p.key === 'spell:blast'));
  assert.equal(m.hotkey('Alt+Shift+5', 200), true);
  assert.equal(m.portals.length, 1);
  assert.ok(m.portals[0].r > 0.05);
});
