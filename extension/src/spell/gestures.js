// Spell mode's 5-gesture grammar, shared by every spell style.
//   shield   one open palm, fingers up, held 0.3 s      (held: follows the hand)
//   orb      two open hands facing, in front of the chest (held)
//   blast    an open palm pushed at the camera            (one-shot)
//   portal   a circle traced with the index finger        (one-shot)
//   channel  both hands raised beside the head, spread    (held, after 0.4 s)
// update(det, now) -> { shields: [{x,y,r}], orb: {x,y,r}|null, channel: {hands}|null,
//                       blasts: [{x,y}], portals: [{x,y,r}] }
// Positions are normalized frame coordinates; radii are in frame-height units.
import { L, palm, handSize, reach, fingerSpread } from '../lib/hands.js';
import { handPose } from '../draw/pose.js';

const SHIELD_MS = 300, ORB_MS = 120, CHANNEL_MS = 400;
const BLAST_WINDOW = 350, BLAST_GROWTH = 1.3, BLAST_COOLDOWN = 1000;
const PORTAL_KEEP = 2000, PORTAL_COOLDOWN = 800;

function info(h, aspect) {
  const lm = h.landmarks;
  const tips = [L.INDEX_TIP, L.MIDDLE_TIP, L.RING_TIP, L.PINKY_TIP];
  const meanReach = tips.reduce((s, t) => s + reach(lm, t, aspect), 0) / 4;
  const size = handSize(lm, aspect);
  return {
    h, lm, size, p: palm(lm),
    open: meanReach > 1.5 && h.gesture.name !== 'Closed_Fist',
    up: lm[L.MIDDLE_TIP].y < lm[L.WRIST].y - size * 0.9,
    spread: fingerSpread(lm, aspect),
  };
}

// Held-pose timer: true once `on` has been continuously true for `ms`.
class Hold {
  constructor(ms) { this.ms = ms; this.since = null; }
  update(on, now) {
    if (!on) { this.since = null; return false; }
    if (this.since === null) this.since = now;
    return now - this.since >= this.ms;
  }
}

export class SpellGestures {
  constructor() {
    this.channelHold = new Hold(CHANNEL_MS);
    this.orbHold = new Hold(ORB_MS);
    this.shieldHolds = new Map(); // handedness -> Hold
    this.sizes = new Map(); // handedness -> [{t, size}]
    this.blastAt = new Map();
    this.trails = new Map(); // handedness -> { pts: [{t,x,y}], lastAt }
    this.portalAt = -Infinity;
  }

  update(det, now) {
    const a = det.aspect || 16 / 9;
    const hands = det.hands.map((h) => info(h, a));
    const open = hands.filter((x) => x.open);
    const out = { shields: [], orb: null, channel: null, blasts: [], portals: [] };

    // Channel: both hands raised beside the head, fingers spread, on opposite sides of it.
    const box = det.face && det.face.box;
    let channelCand = false;
    if (box && open.length >= 2) {
      const [l, r] = [...open].sort((x, y) => x.p.x - y.p.x);
      const level = (x) => x.p.y > box.y - box.h * 0.35 && x.p.y < box.y + box.h;
      channelCand = l.p.x < box.x && r.p.x > box.x + box.w && level(l) && level(r) && l.spread >= 7 && r.spread >= 7;
      if (this.channelHold.update(channelCand, now)) {
        out.channel = { hands: [l, r].map((x) => ({ palm: x.p, size: x.size, tips: [L.THUMB_TIP, L.INDEX_TIP, L.MIDDLE_TIP, L.RING_TIP, L.PINKY_TIP].map((t) => x.lm[t]) })) };
      }
    } else this.channelHold.update(false, now);

    // Orb: two open hands at the same height, a little apart, below the chin.
    let orbCand = null;
    if (!channelCand && open.length >= 2) {
      const [l, r] = [...open].sort((x, y) => x.p.x - y.p.x);
      const gap = (r.p.x - l.p.x) * a;
      const low = !box || Math.min(l.p.y, r.p.y) > box.y + box.h * 0.75;
      if (Math.abs(l.p.y - r.p.y) < 0.12 && gap > 0.12 && gap < 0.6 && low) {
        orbCand = { x: (l.p.x + r.p.x) / 2, y: (l.p.y + r.p.y) / 2, r: gap * 0.35 };
      }
    }
    if (this.orbHold.update(!!orbCand, now)) out.orb = orbCand;

    // Shields: open palms with fingers up, when no two-handed spell is forming.
    const seen = new Set();
    for (const x of hands) {
      const key = x.h.handedness;
      seen.add(key);
      let hold = this.shieldHolds.get(key);
      if (!hold) this.shieldHolds.set(key, hold = new Hold(SHIELD_MS));
      const ok = x.open && x.up && !channelCand && !orbCand;
      if (hold.update(ok, now)) out.shields.push({ x: x.p.x, y: x.p.y - x.size * 0.4, r: x.size * 1.6, hand: key });
    }
    for (const [key, hold] of this.shieldHolds) if (!seen.has(key)) hold.update(false, now);

    // Blast: an open hand growing fast (pushed toward the camera).
    for (const x of hands) {
      const key = x.h.handedness;
      const hist = this.sizes.get(key) || [];
      this.sizes.set(key, hist);
      hist.push({ t: now, size: x.size });
      while (hist.length && hist[0].t < now - BLAST_WINDOW) hist.shift();
      if (!x.open) continue;
      const min = Math.min(...hist.map((s) => s.size));
      if (x.size / min >= BLAST_GROWTH && now - (this.blastAt.get(key) ?? -Infinity) >= BLAST_COOLDOWN) {
        this.blastAt.set(key, now);
        hist.length = 0;
        out.blasts.push({ x: x.p.x, y: x.p.y, hand: key });
      }
    }
    for (const key of this.sizes.keys()) if (!seen.has(key)) this.sizes.delete(key);

    // Portal: the index fingertip traces a closed loop.
    for (const x of hands) {
      const key = x.h.handedness;
      let tr = this.trails.get(key);
      if (!tr) this.trails.set(key, tr = { pts: [], lastAt: -Infinity });
      if (handPose(x.lm, a) !== 'draw') {
        if (now - tr.lastAt > 300) tr.pts.length = 0;
        continue;
      }
      tr.lastAt = now;
      const tip = x.lm[L.INDEX_TIP];
      tr.pts.push({ t: now, x: tip.x * a, y: tip.y });
      while (tr.pts.length && tr.pts[0].t < now - PORTAL_KEEP) tr.pts.shift();
      const loop = now - this.portalAt >= PORTAL_COOLDOWN && closedLoop(tr.pts);
      if (loop) {
        this.portalAt = now;
        tr.pts.length = 0;
        out.portals.push({ x: loop.x / a, y: loop.y, r: loop.r, hand: key });
      }
    }
    return out;
  }
}

// Points (aspect-corrected) -> {x, y, r} if they go once round a roughly round loop.
export function closedLoop(pts) {
  if (pts.length < 12 || pts[pts.length - 1].t - pts[0].t < 400) return null;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  const rs = pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const R = rs.reduce((s, r) => s + r, 0) / rs.length;
  if (R < 0.04) return null;
  const sd = Math.sqrt(rs.reduce((s, r) => s + (r - R) ** 2, 0) / rs.length);
  if (sd / R > 0.3) return null;
  let total = 0, prev = Math.atan2(pts[0].y - cy, pts[0].x - cx);
  for (let i = 1; i < pts.length; i++) {
    const ang = Math.atan2(pts[i].y - cy, pts[i].x - cx);
    let d = ang - prev;
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
    prev = ang;
  }
  return Math.abs(total) >= 1.85 * Math.PI ? { x: cx, y: cy, r: R } : null;
}
