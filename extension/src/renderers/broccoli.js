// Fanum broccoli. Hold your hands like a plate: a plate of broccoli appears on them.
// Fling it up and back over your shoulder: it flies away behind you, and a huge
// explosion goes off BEHIND you (you're cut out and stay in front, lit by the fire),
// with a white flash, rolling fireball, smoke, embers and debris.
// Hotkey: skips the plate and throws straight away.
// meme.json render: { type: 'broccoli', holdPlateMs, boomMs, soundAt }
import { Effect } from './base.js';
import { registerPass } from '../gfx/graphics.js';
import { ParticleSystem } from '../gfx/particles.js';
import { detectSweep } from '../fx/sweep.js';
import { palm } from '../lib/hands.js';
import { clamp01 } from '../lib/draw.js';

const FLIGHT_MS = 650;
const BOOM_DELAY_MS = 220; // after the plate leaves
const easeOut = (t) => 1 - (1 - t) ** 3;

registerPass('explosion', `
uniform vec2 uCenter;
uniform float uRadius, uAge, uIntensity;
void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = (vLocal - uCenter) * asp;
  float r = length(p);
  vec2 rise = vec2(0.0, uAge * 0.08);
  float n = fbm(p * 3.2 + rise * 4.0 + vec2(0.0, -uAge * 0.7));
  float n2 = fbm(p * 8.0 - uAge * 1.4 + 7.3);
  float edge = uRadius * (0.72 + 0.55 * n);
  float fire = smoothstep(edge, edge * 0.5, r);
  float core = smoothstep(edge * 0.55, 0.0, r) * (1.0 - smoothstep(0.0, 1.4, uAge));
  float early = 1.0 - smoothstep(0.0, 0.4, uAge); // white-hot at the start
  float heat = clamp(fire * (0.55 + 0.7 * n2 + early * 0.9) + core * 1.2, 0.0, 1.6);
  vec3 col = mix(vec3(0.12, 0.05, 0.02), vec3(0.85, 0.22, 0.02), smoothstep(0.1, 0.45, heat));
  col = mix(col, vec3(1.0, 0.62, 0.12), smoothstep(0.45, 0.85, heat));
  col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(0.9, 1.35, heat));
  float smoke = smoothstep(edge * 1.55, edge * 0.75, r) * smoothstep(0.25, 1.8, uAge) * (0.45 + 0.6 * n);
  float cool = smoothstep(1.2, 3.2, uAge);
  vec3 smokeCol = vec3(0.16, 0.14, 0.13) * (0.6 + 0.7 * n2);
  col = mix(col, smokeCol, cool * 0.8 * (1.0 - core));
  float a = clamp(max(fire, smoke * 0.85), 0.0, 1.0) * uIntensity;
  outColor = vec4(col, a);
}`, (ctx, w, h, u) => {
  const cx = u.uCenter[0] * w, cy = u.uCenter[1] * h, r = u.uRadius * h * 1.2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
  g.addColorStop(0, `rgba(255,240,190,${u.uIntensity})`);
  g.addColorStop(0.35, `rgba(255,140,30,${u.uIntensity})`);
  g.addColorStop(0.8, `rgba(120,40,10,${0.8 * u.uIntensity})`);
  g.addColorStop(1, 'rgba(40,30,25,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

// Warm light on the edges of your silhouette that face the fire (the explosion behind
// you lighting you up), fading out on the far side.
registerPass('rim', `
uniform vec3 uColor;
uniform vec2 uCenter;
uniform float uStrength, uWidth;
void main() {
  if (uHasMask < 0.5) { outColor = vec4(0.0); return; }
  vec2 d = vec2(uWidth * uRes.y / uRes.x, uWidth);
  float m = texture(uMask, vLocal).a;
  float mr = texture(uMask, vLocal + vec2(d.x, 0.0)).a, ml = texture(uMask, vLocal - vec2(d.x, 0.0)).a;
  float md = texture(uMask, vLocal + vec2(0.0, d.y)).a, mu = texture(uMask, vLocal - vec2(0.0, d.y)).a;
  float edge = clamp((m - min(min(mr, ml), min(md, mu))) * 2.0, 0.0, 1.0) * smoothstep(0.35, 0.65, m);
  vec2 outward = -vec2(mr - ml, md - mu);
  vec2 toFire = uCenter - vLocal;
  float facing = (length(outward) > 0.001 && length(toFire) > 0.001) ? max(0.0, dot(normalize(outward), normalize(toFire))) : 0.0;
  outColor = vec4(uColor, edge * facing * uStrength);
}`);

let plateCanvas = null;
let floretCanvas = null;
function floret() {
  if (floretCanvas) return floretCanvas;
  const c = floretCanvas = new OffscreenCanvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#8fbf5a';
  g.fillRect(29, 34, 7, 22); // stem
  for (const [x, y, r, col] of [[32, 26, 16, '#2f6b1f'], [20, 30, 11, '#3d8226'], [44, 30, 11, '#3d8226'], [26, 18, 10, '#4a9a2e'], [39, 17, 10, '#4a9a2e'], [32, 12, 8, '#5aad38']]) {
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.15)';
  for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(18 + Math.random() * 28, 8 + Math.random() * 24, 1.6, 0, 6.3); g.fill(); }
  return c;
}
function plateArt() {
  if (plateCanvas) return plateCanvas;
  const W = 320, H = 200;
  const c = plateCanvas = new OffscreenCanvas(W, H);
  const g = c.getContext('2d');
  // shadow
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.ellipse(W / 2, H * 0.74, W * 0.46, H * 0.18, 0, 0, Math.PI * 2); g.fill();
  // plate
  const grad = g.createRadialGradient(W / 2, H * 0.62, 10, W / 2, H * 0.62, W * 0.45);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.75, '#f1f1f1'); grad.addColorStop(1, '#cfcfcf');
  g.fillStyle = grad;
  g.beginPath(); g.ellipse(W / 2, H * 0.64, W * 0.45, H * 0.2, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(W / 2, H * 0.64, W * 0.32, H * 0.13, 0, 0, Math.PI * 2); g.stroke();
  // broccoli pile
  const f = floret();
  for (const [x, y, s] of [[0.32, 0.38, 0.32], [0.5, 0.33, 0.36], [0.67, 0.39, 0.31], [0.41, 0.48, 0.3], [0.59, 0.49, 0.3], [0.5, 0.52, 0.27], [0.25, 0.5, 0.24]]) {
    g.drawImage(f, x * W - s * H / 2, y * H - s * H / 2, s * H, s * H);
  }
  return c;
}
let whiteCanvas = null;
function white() {
  if (!whiteCanvas) { whiteCanvas = new OffscreenCanvas(4, 4); const c = whiteCanvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); }
  return whiteCanvas;
}

export class BroccoliEffect extends Effect {
  static layer = 1;
  static needsMask = true;

  constructor(def, deps) {
    super(def, deps);
    this.phase = 'idle'; // idle | holding | flying | boom
    this.hist = new Map();
    this.embers = new ParticleSystem(4000);
    this.debris = new ParticleSystem(120);
    this.florets = new ParticleSystem(40);
  }

  async load() { plateArt(); floret(); }

  get boomMs() { return this.r.boomMs ?? 4000; }
  isActive() { return this.phase !== 'idle'; }
  endTime() { return this.phase === 'idle' ? -1 : Infinity; }
  setHeld() {}

  stop() {
    this.phase = 'idle';
    this.embers.clear(); this.debris.clear(); this.florets.clear();
    this.stopSound();
  }

  fire(info, now, { hotkey = false } = {}) {
    if (this.phase === 'flying' || this.phase === 'boom') return;
    this.info = info || {};
    this.startAt = now;
    this.plate = (info && info.plate) || { x: 0.5, y: 0.82, span: 0.35 };
    if (hotkey) this.throw(now, Math.random() < 0.5 ? 'left' : 'right');
    else { this.phase = 'holding'; this.holdUntil = now + (this.r.holdPlateMs ?? 4000); }
  }

  throw(now, side) {
    this.phase = 'flying';
    this.side = side;
    this.flyAt = now;
    this.from = { ...this.plate };
    const dir = side === 'left' ? -1 : 1;
    this.to = { x: Math.min(0.92, Math.max(0.08, this.from.x + dir * 0.32)), y: 0.12 };
    this.boomCenter = { x: Math.min(0.85, Math.max(0.15, this.from.x + dir * 0.22)), y: 0.42 };
    this.boom2Center = { x: Math.min(0.88, Math.max(0.12, this.from.x - dir * 0.3)), y: 0.5 };
    this.florets.spawn(9, (k, p) => {
      p.x = this.from.x + (Math.random() - 0.5) * this.from.span * 0.5; p.y = this.from.y - 0.03;
      p.vx = dir * (0.25 + Math.random() * 0.35); p.vy = -0.9 - Math.random() * 0.5;
      p.life = 0.9; p.size = 26 + Math.random() * 14; p.vr = (Math.random() - 0.5) * 12; p.rot = Math.random() * 6;
    });
  }

  boom(now) {
    this.phase = 'boom';
    this.boomAt = now;
    this.playSound();
    const c = this.boomCenter;
    this.embers.spawn(Math.round(1600 * (this.quality || 1)), (k, p) => {
      const a = Math.random() * Math.PI * 2, sp = 0.15 + Math.random() * 0.9;
      p.x = c.x; p.y = c.y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 0.15;
      p.life = 0.8 + Math.random() * 2.2; p.size = 2 + Math.random() * 3;
      p.r = 1; p.g = 0.55 + Math.random() * 0.4; p.b = 0.15 + Math.random() * 0.2; p.a = 1;
    });
    this.debris.spawn(28, (k, p) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.8, sp = 0.8 + Math.random() * 1.2;
      p.x = c.x + Math.cos(a) * 0.06; p.y = c.y + Math.sin(a) * 0.06; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.life = 1.2 + Math.random() * 1.2; p.size = 4 + Math.random() * 6; p.kind = 1;
      p.r = p.g = p.b = 0.08 + Math.random() * 0.1; p.a = 1; p.vr = (Math.random() - 0.5) * 14;
    });
  }

  onDetect(det) {
    if (this.phase !== 'holding') return;
    const now = performance.now();
    for (const h of det.hands) {
      const p = palm(h.landmarks);
      const list = this.hist.get(h.handedness) || [];
      list.push({ t: now, x: p.x, y: p.y });
      while (list.length && now - list[0].t > 600) list.shift();
      this.hist.set(h.handedness, list);
      const side = detectSweep(list, det.face, now);
      if (side) { this.throw(now, side); this.hist.clear(); return; }
    }
    // Keep the plate on the hands while they stay in the plate pose.
    if (det.hands.length >= 2) {
      const a = palm(det.hands[0].landmarks), b = palm(det.hands[1].landmarks);
      this.plate = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, span: Math.max(0.2, Math.abs(a.x - b.x) + 0.18) };
    }
  }

  renderGL(g, env) {
    const now = env.now;
    this.quality = env.quality ?? 1;
    const dt = Math.min(0.1, Math.max(0, (now - (this.lastNow || now)) / 1000));
    this.lastNow = now;
    const asp = env.w / env.h;

    if (this.phase === 'holding') {
      if (now > this.holdUntil) { this.stop(); return; }
      const t = clamp01((now - this.startAt) / 220), pl = this.plate;
      const w = pl.span * 1.25 * easeOut(t), h = w * asp * (200 / 320);
      g.drawImage(plateArt(), pl.x - w / 2, pl.y - h * 0.62, w, h, { key: 'plate', static: true, alpha: t });
      return;
    }

    if (this.phase === 'flying') {
      const t = clamp01((now - this.flyAt) / FLIGHT_MS);
      const x = this.from.x + (this.to.x - this.from.x) * t;
      const y = this.from.y + (this.to.y - this.from.y) * t - Math.sin(t * Math.PI) * 0.18;
      const s = 1 - 0.65 * t;
      const w = this.from.span * 1.25 * s, h = w * asp * (200 / 320);
      g.drawImage(plateArt(), x - w / 2, y - h / 2, w, h, { key: 'plate', static: true, rotate: t * Math.PI * 3 * (this.side === 'left' ? -1 : 1), alpha: 1 - clamp01((t - 0.8) / 0.2) });
      this.drawFlorets(g, dt, asp);
      if (now - this.flyAt > FLIGHT_MS + BOOM_DELAY_MS) this.boom(now);
      return;
    }

    if (this.phase === 'boom') {
      const age = (now - this.boomAt) / 1000;
      const total = this.boomMs / 1000;
      if (age > total) { this.stop(); return; }
      const intensity = 1 - clamp01((age - (total - 1)) / 1);
      const radius = 0.68 * easeOut(clamp01(age / 0.5)) + 0.05 * age;
      // Fire behind you: explosion over the frame, then you on top.
      g.pass('explosion', { uniforms: { uCenter: [this.boomCenter.x, this.boomCenter.y], uRadius: radius, uAge: age, uIntensity: intensity } });
      // A second blast on the other side a beat later, so the whole background goes up.
      const age2 = age - 0.25;
      if (age2 > 0) {
        const r2 = 0.5 * easeOut(clamp01(age2 / 0.45)) + 0.04 * age2;
        g.pass('explosion', { uniforms: { uCenter: [this.boom2Center.x, this.boom2Center.y], uRadius: r2, uAge: age2 + 0.3, uIntensity: intensity } });
      }
      this.debris.step(dt, { drag: 0.6, gravity: 1.2 });
      g.particles(this.debris, { shape: 'flake' });
      this.embers.step(dt, { drag: 0.9, gravity: 0.25, wind: { x: 0, y: -0.05 } });
      g.particles(this.embers, { shape: 'spark', blend: 'add' });
      g.drawPerson({ lo: 0.62, hi: 0.85 }); // tight cut so no pale halo of the old background
      g.pass('rim', { blend: 'add', uniforms: { uColor: [1, 0.5, 0.15], uCenter: [this.boomCenter.x, this.boomCenter.y], uStrength: 0.55 * intensity, uWidth: 0.01 } });
      // White flashes, like the edit (at the boom and again ~2.2 s later).
      for (const at of [0, 2.2]) {
        const f = age - at;
        if (f >= 0 && f < 0.18) g.drawImage(white(), 0, 0, 1, 1, { key: 'white', static: true, alpha: (1 - f / 0.18) * 0.9 });
      }
    }
  }

  drawFlorets(g, dt, asp) {
    if (!this.florets.count) return;
    this.florets.step(dt, { gravity: 1.6 });
    const f = floret();
    for (let i = 0; i < this.florets.count; i++) {
      const h = this.florets.size[i] / 720, w = h / asp; // square on screen
      g.drawImage(f, this.florets.x[i] - w / 2, this.florets.y[i] - h / 2, w, h, { key: 'floret', static: true, rotate: this.florets.rot[i] });
    }
  }
}
