// Draw mode: write in the air with your index finger. See docs/superpowers/specs/
// 2026-11-09-bad-connection-draw-spells-design.md (Phase 4).
//   ☝️ index finger   pen down        ✌️ two fingers   pen up, cursor
//   ✋ open palm       eraser          🙌 both palms 1 s clear
//   air palette along the top: hover a swatch 0.4 s to pick it (last one: brush size)
import { L, palm, handSize } from '../lib/hands.js';
import { handPose, OneEuro } from './pose.js';
import { Board } from './board.js';

export const COLORS = ['#38c8ff', '#ff3b8b', '#ffd23f', '#3bff8a', '#b45bff', '#ffffff'];
export const COLOR_NAMES = ['cyan', 'pink', 'yellow', 'green', 'purple', 'white'];
export const SIZES = { thin: 0.009, thick: 0.022 }; // stroke width, frame-height units
const PY = 0.075, STEP = 0.07, SWATCH_R = 0.026;
export const PALETTE = [
  ...COLORS.map((color, i) => ({ x: 0.5 + (i - 3) * STEP, y: PY, color: i })),
  { x: 0.5 + 3 * STEP, y: PY, size: true },
];
const PALETTE_ZONE = PY + 0.06; // fingertips above this never ink
const DWELL_MS = 400, CLEAR_MS = 1000;

export function swatchAt(p, aspect = 16 / 9) {
  for (let i = 0; i < PALETTE.length; i++) {
    const s = PALETTE[i];
    if (Math.hypot((p.x - s.x) * aspect, p.y - s.y) < SWATCH_R * 1.5) return i;
  }
  return -1;
}

export class DrawMode {
  // getSettings() -> settings (drawColor); save(patch) persists.
  constructor({ getSettings, save, toast = () => {} }) {
    Object.assign(this, { getSettings, save, toast });
    this.board = new Board();
    this.size = 'thin';
    this.fx = new OneEuro();
    this.fy = new OneEuro();
    this.down = false;
    this.hits = 0;
    this.misses = 0;
    this.prev = null;
    this.hand = null;
    this.cursor = null;
    this.dwellIdx = -1;
    this.dwellLatched = -1;
    this.dwellSince = 0;
    this.dwellProgress = 0;
    this.clearSince = null;
    this.clearLatched = false;
    this.clearProgress = 0;
    this.render = { layer: null, version: -1, drawn: new WeakMap() };
  }

  get color() { return this.getSettings().drawColor || 0; }

  update(det, now) {
    const a = det.aspect || 16 / 9;
    const poses = det.hands.map((h) => ({ h, pose: handPose(h.landmarks, a) }));

    // Both palms open: charge, then clear the board (once per gesture).
    if (poses.filter((p) => p.pose === 'erase').length >= 2) {
      this.lift();
      this.cursor = null;
      if (this.clearLatched) return;
      if (this.clearSince === null) this.clearSince = now;
      this.clearProgress = Math.min(1, (now - this.clearSince) / CLEAR_MS);
      if (this.clearProgress >= 1) {
        this.board.clear();
        this.clearLatched = true;
        this.clearProgress = 0;
      }
      return;
    }
    this.clearSince = null;
    this.clearLatched = false;
    this.clearProgress = 0;

    const cand = poses.filter((p) => p.pose);
    const cur = cand.find((p) => p.h.handedness === this.hand) || cand[0];
    if (!cur) { this.miss(); this.cursor = null; this.resetDwell(); return; }
    this.hand = cur.h.handedness;
    const lm = cur.h.landmarks;

    if (cur.pose === 'erase') {
      this.lift();
      this.resetDwell();
      this.fx.reset(); this.fy.reset();
      const c = palm(lm), r = handSize(lm, a) * 1.2;
      this.board.erase(c, r, a);
      this.cursor = { kind: 'erase', x: c.x, y: c.y, r };
      return;
    }

    const tip = lm[L.INDEX_TIP];
    const p = { x: this.fx.filter(tip.x, now), y: this.fy.filter(tip.y, now) };
    this.cursor = { kind: cur.pose, x: p.x, y: p.y };

    if (p.y < PALETTE_ZONE) {
      this.lift();
      this.dwell(swatchAt(p, a), now);
      return;
    }
    this.resetDwell();

    if (cur.pose !== 'draw') { this.miss(); return; }
    this.misses = 0;
    this.hits++;
    if (this.down) this.board.add(p);
    else if (this.hits >= 2) {
      this.down = true;
      this.board.begin(this.prev || p, this.color, this.size);
      this.board.add(p);
    }
    this.prev = p;
  }

  miss() {
    this.hits = 0;
    this.misses++;
    if (this.misses >= 2) {
      this.lift();
      this.fx.reset(); this.fy.reset();
    }
  }

  lift() {
    if (this.down) { this.board.end(); this.render.version = -1; }
    this.down = false;
    this.hits = 0;
    this.prev = null;
  }

  resetDwell() { this.dwellIdx = -1; this.dwellLatched = -1; this.dwellProgress = 0; }

  dwell(i, now) {
    if (i < 0) { this.resetDwell(); return; }
    if (i !== this.dwellIdx) { this.dwellIdx = i; this.dwellSince = now; }
    if (i === this.dwellLatched) { this.dwellProgress = 0; return; }
    this.dwellProgress = Math.min(1, (now - this.dwellSince) / DWELL_MS);
    if (this.dwellProgress >= 1) { this.pick(i); this.dwellLatched = i; this.dwellProgress = 0; }
  }

  pick(i) {
    const s = PALETTE[i];
    if (s.size) this.size = this.size === 'thin' ? 'thick' : 'thin';
    else this.save({ drawColor: s.color });
  }

  // Alt+Shift+1..6 pick colours. Returns false for keys Draw mode doesn't use.
  hotkey(combo) {
    const m = /^Alt\+Shift\+([1-6])$/.exec(combo);
    if (!m) return false;
    this.save({ drawColor: Number(m[1]) - 1 });
    this.toast(`✏️ ${COLOR_NAMES[Number(m[1]) - 1]}`);
    return true;
  }

  tool(name) {
    this.lift();
    if (name === 'undo') { if (!this.board.undo()) this.toast('Nothing to undo'); return true; }
    if (name === 'clear') { this.board.clear(); return true; }
    return false;
  }

  // Leaving Draw mode keeps the drawing for when you come back, but lifts the pen.
  pause() { this.lift(); this.cursor = null; this.resetDwell(); this.clearProgress = 0; }

  // ---- rendering ----
  renderGL(g, env) {
    const changed = this.paintInk(env.w, env.h);
    g.drawImage(this.render.layer, 0, 0, 1, 1, { key: 'draw-ink', static: !changed });
    g.draw2D((ctx, w, h) => this.paintUI(ctx, w, h));
  }

  // Keeps the ink layer up to date; returns true if it changed.
  paintInk(w, h) {
    const R = this.render;
    let layer = R.layer;
    if (!layer || layer.width !== w || layer.height !== h) {
      layer = R.layer = new OffscreenCanvas(w, h);
      R.version = -1;
    }
    const ctx = layer.getContext('2d');
    if (R.version !== this.board.version) {
      ctx.clearRect(0, 0, w, h);
      R.drawn = new WeakMap();
      for (const s of this.board.strokes) { neon(ctx, s, 0, w, h); R.drawn.set(s, s.points.length); }
      R.version = this.board.version;
      return true;
    }
    let changed = false;
    for (const s of this.board.strokes) {
      const n = R.drawn.get(s) || 0;
      if (n < s.points.length) { neon(ctx, s, Math.max(0, n - 2), w, h); R.drawn.set(s, s.points.length); changed = true; }
    }
    return changed;
  }

  paintUI(ctx, w, h) {
    // Palette.
    const r = SWATCH_R * h;
    for (let i = 0; i < PALETTE.length; i++) {
      const s = PALETTE[i], x = s.x * w, y = s.y * h;
      const near = this.cursor && this.cursor.y < PALETTE_ZONE + 0.08;
      ctx.globalAlpha = near ? 0.95 : 0.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (s.size) {
        ctx.fillStyle = 'rgba(20,20,28,.75)';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, (this.size === 'thin' ? SIZES.thin : SIZES.thick) * h * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = COLORS[s.color];
        ctx.fill();
      }
      ctx.lineWidth = Math.max(1.5, h * 0.004);
      ctx.strokeStyle = !s.size && s.color === this.color ? '#fff' : 'rgba(255,255,255,.35)';
      ctx.stroke();
      if (i === this.dwellIdx && this.dwellProgress > 0) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(2, h * 0.006);
        ctx.beginPath();
        ctx.arc(x, y, r * 1.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.dwellProgress);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Cursor.
    const c = this.cursor;
    if (!c) return;
    const col = COLORS[this.color], x = c.x * w, y = c.y * h;
    ctx.lineWidth = Math.max(1.5, h * 0.004);
    if (c.kind === 'erase') {
      ctx.setLineDash([h * 0.012, h * 0.01]);
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.arc(x, y, c.r * h, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (c.kind === 'hover') {
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(x, y, SIZES[this.size] * h * 1.4 + h * 0.006, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = h * 0.02;
      ctx.beginPath(); ctx.arc(x, y, SIZES[this.size] * h * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// Neon stroke: coloured glow + bright core, smoothed with quadratic curves through midpoints.
// Draws points from index `from` on (incremental painting re-draws a little overlap).
function neon(ctx, s, from, w, h) {
  const pts = s.points;
  if (pts.length < 2) return;
  const col = COLORS[s.color] || COLORS[0], width = SIZES[s.size] * h;
  const path = () => {
    ctx.beginPath();
    const i0 = Math.max(0, from);
    let p = pts[i0];
    ctx.moveTo(p.x * w, p.y * h);
    for (let i = i0 + 1; i < pts.length - 1; i++) {
      const q = pts[i], m = { x: (q.x + pts[i + 1].x) / 2, y: (q.y + pts[i + 1].y) / 2 };
      ctx.quadraticCurveTo(q.x * w, q.y * h, m.x * w, m.y * h);
      p = m;
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x * w, last.y * h);
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = width * 2.2;
  ctx.strokeStyle = col;
  ctx.lineWidth = width;
  path(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = s.color === 5 ? '#ffffff' : 'rgba(255,255,255,.75)';
  ctx.lineWidth = width * 0.38;
  path(); ctx.stroke();
  ctx.restore();
}
