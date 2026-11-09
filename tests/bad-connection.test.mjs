import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadConnSchedule } from '../extension/src/fx/bad-connection.js';
import { makeSandbox } from './helpers/main-world.mjs';

// Runs a schedule at 30 fps from `from` to `to` ms and collects what it decided.
function run(s, from, to) {
  const out = [];
  for (let t = from; t < to; t += 33) out.push({ t, ...s.step(t) });
  return out;
}

test('bad connection schedule: idle until started', () => {
  const s = new BadConnSchedule({ seed: 3 });
  const f = s.step(1000);
  assert.equal(f.hold, false);
  assert.equal(f.block, 0);
  assert.deepEqual(f.stale, []);
});

test('bad connection schedule: most frames are held, a few get through, blocks stay in range', () => {
  const s = new BadConnSchedule({ seed: 3 });
  s.start(0);
  const frames = run(s, 0, 30000);
  const fresh = frames.filter((f) => !f.hold).length / frames.length;
  assert.ok(fresh > 0.08 && fresh < 0.6, `fresh frame share ${fresh.toFixed(2)}`);
  const blocks = frames.map((f) => f.block).filter((b) => b > 0);
  assert.ok(blocks.length > frames.length * 0.3, 'blocky most of the time');
  assert.ok(blocks.every((b) => b >= 8 && b <= 40), 'block size 8..40 px');
});

test('bad connection schedule: has long freezes and reports each one once as a burst', () => {
  const s = new BadConnSchedule({ seed: 5 });
  s.start(0);
  const frames = run(s, 0, 40000);
  const bursts = frames.filter((f) => f.burstMs);
  assert.ok(bursts.length >= 2, `bursts: ${bursts.length}`);
  for (const b of bursts) {
    assert.ok(b.burstMs >= 1500 && b.burstMs <= 4000, `burst ${b.burstMs}`);
    // Every frame inside the freeze is held.
    const inside = frames.filter((f) => f.t > b.t && f.t < b.t + b.burstMs - 40);
    assert.ok(inside.every((f) => f.hold), 'held through the freeze');
  }
});

test('bad connection schedule: starts mild and gets worse', () => {
  const s = new BadConnSchedule({ seed: 9 });
  s.start(0);
  assert.ok(s.intensity(0) < 0.5);
  assert.equal(s.intensity(10000), 1);
  const early = run(s, 0, 2000).filter((f) => f.hold).length / 61;
  const late = run(s, 20000, 22000).filter((f) => f.hold).length / 61;
  assert.ok(early < late, `held share early ${early.toFixed(2)} vs late ${late.toFixed(2)}`);
});

test('bad connection schedule: stale blocks are 16 px aligned rectangles inside the frame', () => {
  const s = new BadConnSchedule({ seed: 4 });
  s.start(0);
  const rects = run(s, 5000, 15000).flatMap((f) => f.stale);
  assert.ok(rects.length > 0, 'some stale blocks');
  for (const r of rects) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9, JSON.stringify(r));
  }
});

test('bad connection schedule: same seed, same decisions; stop() goes back to idle', () => {
  const a = new BadConnSchedule({ seed: 7 }), b = new BadConnSchedule({ seed: 7 });
  a.start(0); b.start(0);
  assert.deepEqual(run(a, 0, 5000), run(b, 0, 5000));
  a.stop();
  assert.equal(a.step(6000).hold, false);
  assert.equal(a.active, false);
});

// --- audio (MAIN world) ---

const chunk = (n = 480, v = 0.5) => [new Float32Array(n).fill(v)];
const silent = (p) => p.every((x) => x === 0);
const untouched = (p, v = 0.5) => p.every((x) => x === v);

test('bad connection audio: off by default, chunks pass through untouched', () => {
  const { MM } = makeSandbox();
  const planes = chunk();
  assert.equal(MM.badconn.degrade(planes, 48000, 0), false);
  assert.ok(untouched(planes[0]));
});

test('bad connection audio: on, it drops out and buzzes but still lets speech through', () => {
  const { MM } = makeSandbox();
  MM.badconn.set({ on: true, seed: 2, now: 0 });
  let dropped = 0, clear = 0, changed = 0;
  for (let t = 0; t < 30000; t += 10) {
    const planes = chunk();
    MM.badconn.degrade(planes, 48000, t);
    if (silent(planes[0])) dropped++;
    else if (untouched(planes[0])) clear++;
    else changed++;
  }
  const n = 3000;
  assert.ok(dropped / n > 0.1 && dropped / n < 0.6, `dropped ${dropped}`);
  assert.ok(clear / n > 0.15, `clear ${clear}`);
  assert.ok(changed / n > 0.03, `robotic/lo-fi ${changed}`);
});

test('bad connection audio: a burst silences audio for its whole length', () => {
  const { MM } = makeSandbox();
  MM.badconn.set({ on: true, seed: 2, now: 0 });
  MM.badconn.burst(2000, 1000);
  for (let t = 1000; t < 2990; t += 10) {
    const planes = chunk();
    MM.badconn.degrade(planes, 48000, t);
    assert.ok(silent(planes[0]), `silent at ${t}`);
  }
});

test('bad connection audio: turning it off stops degrading', () => {
  const { MM } = makeSandbox();
  MM.badconn.set({ on: true, seed: 2, now: 0 });
  MM.badconn.set({ on: false });
  for (let t = 0; t < 3000; t += 10) {
    const planes = chunk();
    MM.badconn.degrade(planes, 48000, t);
    assert.ok(untouched(planes[0]));
  }
});

// --- content-script controller ---
import { BadConnection, findLeaveButton } from '../extension/src/content/bad-connection.js';

function controller(settings = {}) {
  const log = { posts: [], toasts: [], leaves: 0 };
  const s = { activeMode: 'meme', badConnKind: 'both', badConnAutoLeaveSec: 0, ...settings };
  const bc = new BadConnection({
    getSettings: () => s,
    post: (m) => log.posts.push(m),
    toast: (t) => log.toasts.push(t),
    leave: () => { log.leaves++; return log.leaveResult ?? true; },
  });
  return { bc, log, s };
}

test('bad connection controller: audio-only turns the mic side on, video off', () => {
  const { bc, log } = controller({ badConnKind: 'audio' });
  bc.start(0);
  assert.equal(bc.active, true);
  assert.equal(bc.videoOn, false);
  assert.deepEqual(log.posts.at(-1), { __mm: 'badconn', on: true });
});

test('bad connection controller: video-only leaves the mic alone', () => {
  const { bc, log } = controller({ badConnKind: 'video' });
  bc.start(0);
  assert.equal(bc.videoOn, true);
  assert.deepEqual(log.posts.at(-1), { __mm: 'badconn', on: false });
});

test('bad connection controller: toggle stops it again; does nothing while Off', () => {
  const { bc, log, s } = controller();
  bc.toggle(0);
  assert.equal(bc.active, true);
  bc.toggle(100);
  assert.equal(bc.active, false);
  assert.deepEqual(log.posts.at(-1), { __mm: 'badconn', on: false });
  s.activeMode = 'off';
  bc.toggle(200);
  assert.equal(bc.active, false);
  assert.match(log.toasts.at(-1), /turn meet memes on/i);
});

test('bad connection controller: auto-leave counts down for 5 s, then leaves once', () => {
  const { bc, log } = controller({ badConnAutoLeaveSec: 15 });
  bc.start(0);
  bc.tick(9900);
  assert.equal(log.toasts.filter((t) => /leaving/i.test(t)).length, 0);
  bc.tick(10000);
  assert.match(log.toasts.at(-1), /leaving in 5/i);
  bc.tick(14000);
  assert.match(log.toasts.at(-1), /leaving in 1/i);
  bc.tick(15000);
  bc.tick(15500);
  assert.equal(log.leaves, 1);
  assert.equal(bc.active, false);
});

test('bad connection controller: no auto-leave when it is off; says so when the button is missing', () => {
  const a = controller();
  a.bc.start(0);
  a.bc.tick(600000);
  assert.equal(a.log.leaves, 0);
  const b = controller({ badConnAutoLeaveSec: 15 });
  b.log.leaveResult = false;
  b.bc.start(0);
  b.bc.tick(15000);
  assert.equal(b.log.leaves, 1);
  assert.match(b.log.toasts.at(-1), /leave button/i);
});

test('bad connection controller: a long video freeze also drops the audio when both are on', () => {
  const { bc, log } = controller({ badConnKind: 'both' });
  bc.start(0);
  for (let t = 0; t < 20000; t += 33) bc.decide(t, 1280, 720);
  const bursts = log.posts.filter((m) => m.__mm === 'badconn-burst');
  assert.ok(bursts.length >= 1);
  assert.ok(bursts.every((m) => m.ms >= 1500 && m.ms <= 4000));
});

const btn = (label, text = '') => ({ getAttribute: (k) => (k === 'aria-label' ? label : null), textContent: text });

test('findLeaveButton: by aria-label, then by the call_end icon', () => {
  const doc = (list) => ({ querySelectorAll: () => list });
  const leave = btn('Leave call');
  assert.equal(findLeaveButton(doc([btn('Turn off microphone'), leave])), leave);
  const icon = btn('Salir de la llamada', 'call_end');
  assert.equal(findLeaveButton(doc([btn('Chat'), icon])), icon);
  assert.equal(findLeaveButton(doc([btn('Chat')])), null);
});
