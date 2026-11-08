// Turns a trigger spec from meme.json into an object with update(det, now) -> { active, info }.
// `active` is true while the pose is held (after holdMs); the meme manager fires on the rising edge.
// Pulse triggers (snap, throw) are active for a single update.
//
// det = { hands: [...], face: {box, nose, blendshapes} | null, aspect, now }
import { L, dist, handSize, palm, reach, isFist, isOpen, isPointing, inBox, fingerSpread } from '../lib/hands.js';

const conditions = {
  gesture(spec) {
    const need = spec.hands || 1, min = spec.minScore ?? 0.6;
    return (det) => {
      const hits = det.hands.filter((h) => h.gesture.name === spec.gesture && h.gesture.score >= min);
      return hits.length >= need ? { hand: palm(hits[0].landmarks) } : null;
    };
  },

  expression(spec) {
    return (det) => {
      const bs = det.face && det.face.blendshapes;
      if (!bs) return null;
      for (const [name, min] of Object.entries(spec.blendshapes || {})) if ((bs[name] || 0) < min) return null;
      return { hand: det.face.nose };
    };
  },

  // Absolute Cinema: both open hands raised beside the head, fingers spread (the poster pose).
  'both-hands-up'(spec) {
    const minSpread = spec.minSpread ?? 8;
    return (det) => {
      if (det.hands.length < 2) return null;
      const box = det.face && det.face.box;
      for (const h of det.hands) {
        const lm = h.landmarks;
        const wrist = lm[L.WRIST], tip = lm[L.MIDDLE_TIP], p = palm(lm);
        if (tip.y > wrist.y || !isOpen(lm, det.aspect)) return null;
        if (fingerSpread(lm, det.aspect) < minSpread) return null;
        if (box) {
          if (wrist.y > box.y + box.h * 0.8) return null;
          if (p.x > box.x - box.w * 0.05 && p.x < box.x + box.w * 1.05) return null;
        } else if (wrist.y > 0.45) {
          return null;
        }
      }
      return { hand: palm(det.hands[0].landmarks) };
    };
  },

  // Despair: palms covering the face. Uses the last seen face because hands hide it.
  'hands-over-face'(spec) {
    const need = spec.hands || 2;
    return (det) => {
      const box = det.face && det.face.box;
      if (!box || det.hands.length < need) return null;
      const covering = det.hands.filter((h) => inBox(palm(h.landmarks), box, 0.1, 0.15));
      return covering.length >= need ? { hand: det.face.nose } : null;
    };
  },

  // Feel the aura: index fingers pointing at the head, palms beside it.
  'hands-on-head'(spec) {
    const need = spec.hands || 2;
    return (det) => {
      const face = det.face;
      if (!face || det.hands.length < need) return null;
      const box = face.box;
      const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      const ok = det.hands.filter((h) => {
        const lm = h.landmarks;
        if (!isPointing(lm, det.aspect)) return false;
        const tip = lm[L.INDEX_TIP], mcp = lm[L.INDEX_MCP];
        if (!inBox(tip, box, 0.6, 0.6)) return false;
        if (inBox(palm(lm), box, -0.05, -0.05)) return false;
        return dist(tip, center, det.aspect) < dist(mcp, center, det.aspect);
      });
      return ok.length >= need ? { hand: face.nose } : null;
    };
  },

  // Thanos snap: thumb + middle finger pinch, then release (confirmed by the mic's
  // transient when available, otherwise by the middle finger snapping into the palm).
  snap(spec, ctx) {
    const state = new Map();
    const pinchRatio = spec.pinchRatio ?? 0.45;
    return (det, now) => {
      const audio = ctx.audio();
      for (const h of det.hands) {
        const lm = h.landmarks;
        const st = state.get(h.handedness) || { pinchAt: -Infinity };
        state.set(h.handedness, st);
        const size = handSize(lm, det.aspect);
        const pinch = dist(lm[L.THUMB_TIP], lm[L.MIDDLE_TIP], det.aspect) / size < pinchRatio;
        if (audio && audio.running) {
          if (pinch) st.pinchAt = now;
          if (now - st.pinchAt < 700 && audio.spikeSince(st.pinchAt - 250) && now - audio.lastSpikeAt < 600) {
            st.pinchAt = -Infinity;
            return { hand: palm(lm) };
          }
        } else if (pinch) {
          st.pinchAt = now;
        } else if (now - st.pinchAt < 450 && reach(lm, L.MIDDLE_TIP, det.aspect) < 1.35) {
          st.pinchAt = -Infinity;
          return { hand: palm(lm) };
        }
      }
      return null;
    };
  },

  // Throw: a fast hand sweep, by default starting from a fist (holding the broccoli).
  throw(spec) {
    const windowMs = spec.windowMs ?? 350, minDistance = spec.minDistance ?? 0.35;
    const minSpeed = spec.minSpeed ?? 1.6, requireFist = spec.requireFist !== false;
    const history = new Map();
    return (det, now) => {
      for (const h of det.hands) {
        const lm = h.landmarks;
        const p = palm(lm);
        const list = history.get(h.handedness) || [];
        history.set(h.handedness, list);
        list.push({ t: now, x: p.x * det.aspect, y: p.y, fist: isFist(lm, det.aspect) || h.gesture.name === 'Closed_Fist' });
        while (list.length && now - list[0].t > 1200) list.shift();
        const start = list.find((s) => now - s.t <= windowMs);
        if (!start || start === list[list.length - 1]) continue;
        const d = Math.hypot(p.x * det.aspect - start.x, p.y - start.y);
        const dt = (now - start.t) / 1000;
        if (d < minDistance || d / dt < minSpeed) continue;
        if (requireFist && !list.some((s) => s.fist && s.t <= start.t + 120)) continue;
        list.length = 0;
        return {
          hand: p,
          from: { x: start.x / det.aspect, y: start.y },
          dir: { x: (p.x * det.aspect - start.x) / d, y: (p.y - start.y) / d },
        };
      }
      return null;
    };
  },
};

// A pose counts as "held" when, walking back from the newest detection, at least 70% of
// detections are hits (a few dropped frames don't reset it) for holdMs, and the newest
// detection is a hit. `progress` (0..1) drives the charge ring.
export function stable(test, { holdMs = 0, ratio = 0.7 } = {}) {
  const samples = []; // { t, hit }
  let info = null;
  return {
    update(det, now) {
      const hit = test(det, now);
      if (hit) info = hit;
      samples.push({ t: now, hit: !!hit });
      while (samples.length > 2 && now - samples[1].t > holdMs * 2 + 250) samples.shift();
      if (!hit) return { active: false, info, progress: 0 };
      if (holdMs <= 0) return { active: true, info, progress: 1 };
      let hits = 0, total = 0, earliest = now;
      for (let i = samples.length - 1; i >= 0; i--) {
        total++;
        if (samples[i].hit) hits++;
        const r = hits / total;
        if (r >= ratio) earliest = samples[i].t;
        else if (r < 0.5) break;
      }
      const progress = Math.min(1, (now - earliest) / holdMs);
      return { active: progress >= 1, info, progress };
    },
  };
}

function single(spec, ctx) {
  const make = conditions[spec.type];
  if (!make) {
    console.warn('[meet-memes] unknown trigger type', spec.type);
    return null;
  }
  return stable(make(spec, ctx), { holdMs: spec.holdMs ?? 0, ratio: spec.ratio ?? 0.7 });
}

// spec may be null (hotkey only), a single spec, or an array (any of them).
export function createTrigger(spec, ctx) {
  const specs = (Array.isArray(spec) ? spec : spec ? [spec] : []).map((s) => single(s, ctx)).filter(Boolean);
  if (!specs.length) return null;
  return {
    update(det, now) {
      let out = { active: false, info: null, progress: 0 };
      for (const t of specs) {
        const r = t.update(det, now);
        if (r.active && !out.active) out = r;
        else if (!out.active && r.progress > out.progress) out = { ...out, progress: r.progress, info: r.info };
      }
      return out;
    },
  };
}

// Decides which meme fires this detection: only on a pose's rising edge, outside its
// cooldown and the global quiet period after any fire; ties go to the lower priority
// number. A pose that went active while blocked must be released before it can fire.
export class TriggerArbiter {
  constructor({ quietMs = 1500 } = {}) {
    this.quietMs = quietMs;
    this.quietUntil = -Infinity;
    this.was = new Map();
  }

  // candidates: [{ id, priority, active, progress, cooldownUntil }]
  decide(candidates, now) {
    const quiet = now < this.quietUntil;
    let best = null;
    for (const c of candidates) {
      const rising = c.active && !this.was.get(c.id);
      this.was.set(c.id, c.active);
      if (!rising || quiet || now < (c.cooldownUntil || 0)) continue;
      if (!best || (c.priority ?? 99) < (best.priority ?? 99)) best = c;
    }
    if (best) this.quietUntil = now + this.quietMs;
    const progress = new Map();
    if (!quiet && !best) {
      for (const c of candidates) if (!c.active && c.progress > 0) progress.set(c.id, c.progress);
    }
    return { fire: best ? best.id : null, progress };
  }
}
