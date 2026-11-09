// Spell mode: five gestures (see ./gestures.js), drawn in one of three styles.
// All art is procedural (Canvas2D shapes on the overlay + GPU particles).
import { SpellGestures } from './gestures.js';
import { ParticleSystem } from '../gfx/particles.js';

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
const easeOut = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const TAU = Math.PI * 2;

const FADE_MS = 250, CHANNEL_LINGER = 400, PORTAL_MS = 6000, BLAST_MS = 900, BLAST_FLY = 300;

function circle(ctx, r) { ctx.beginPath(); ctx.arc(0, 0, Math.max(0.5, r), 0, TAU); ctx.stroke(); }
function polygon(ctx, n, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * TAU;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
}
// Deterministic pseudo-random in [0,1) from an integer.
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// --- the three looks: (ctx centred on the spell, R px, t seconds, a alpha) ---
function strangeCircle(ctx, R, t, a, st) {
  ctx.strokeStyle = rgba(st.core, a);
  ctx.lineWidth = Math.max(1.2, R * 0.022);
  circle(ctx, R); circle(ctx, R * 0.92);
  ctx.save();
  ctx.rotate(t * 0.8);
  ctx.beginPath();
  for (let i = 0; i < 48; i++) {
    const ang = (i / 48) * TAU, r0 = R * (i % 4 ? 0.82 : 0.77);
    ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
    ctx.lineTo(Math.cos(ang) * R * 0.88, Math.sin(ang) * R * 0.88);
  }
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.rotate(-t * 1.3);
  ctx.strokeStyle = rgba(st.hi, a);
  polygon(ctx, 4, R * 0.66); polygon(ctx, 4, R * 0.66, Math.PI / 4);
  circle(ctx, R * 0.47);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU;
    ctx.save(); ctx.translate(Math.cos(ang) * R * 0.72, Math.sin(ang) * R * 0.72); circle(ctx, R * 0.05); ctx.restore();
  }
  ctx.restore();
  ctx.save();
  ctx.rotate(t * 2);
  ctx.beginPath();
  for (let i = 0; i < 12; i++) { const s = (i / 12) * TAU; ctx.moveTo(Math.cos(s) * R * 0.3, Math.sin(s) * R * 0.3); ctx.arc(0, 0, R * 0.3, s, s + 0.3); }
  ctx.stroke();
  ctx.restore();
}

function wandaCircle(ctx, R, t, a, st) {
  const mist = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.15);
  mist.addColorStop(0, rgba(st.core, 0.28 * a));
  mist.addColorStop(1, rgba(st.core, 0));
  ctx.fillStyle = mist;
  ctx.beginPath(); ctx.arc(0, 0, R * 1.15, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(st.core, a);
  ctx.lineWidth = Math.max(1.2, R * 0.03);
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const th = (i / 120) * TAU;
    const r = R * (1 + 0.05 * Math.sin(6 * th + t * 3) + 0.03 * Math.sin(11 * th - t * 2));
    if (i === 0) ctx.moveTo(Math.cos(th) * r, Math.sin(th) * r); else ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r);
  }
  ctx.stroke();
  ctx.strokeStyle = rgba(st.hi, a * 0.9);
  ctx.lineWidth = Math.max(1, R * 0.02);
  for (let k = 0; k < 3; k++) {
    const s = t * 1.7 + (k / 3) * TAU;
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const u = i / 30, r = R * (0.25 + 0.55 * u), th = s + u * 2.6;
      if (i === 0) ctx.moveTo(Math.cos(th) * r, Math.sin(th) * r); else ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(st.core, a * 0.6);
  polygon(ctx, 6, R * 0.82, -t * 0.4);
}

function doomCircle(ctx, R, t, a, st) {
  ctx.strokeStyle = rgba(st.core, a);
  ctx.lineWidth = Math.max(1.2, R * 0.025);
  circle(ctx, R); circle(ctx, R * 0.86);
  ctx.save();
  ctx.rotate(t * 0.5);
  polygon(ctx, 3, R * 0.84); polygon(ctx, 3, R * 0.84, Math.PI);
  ctx.restore();
  ctx.strokeStyle = rgba(st.hi, a);
  ctx.save();
  ctx.rotate(-t * 0.35);
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * TAU, c = Math.cos(ang), s = Math.sin(ang), r0 = R * 0.89, r1 = R * 0.97;
    const kind = Math.floor(hash(i) * 3);
    ctx.moveTo(c * r0, s * r0);
    ctx.lineTo(c * r1, s * r1);
    if (kind === 1) { const b = ang + 0.06; ctx.lineTo(Math.cos(b) * r1, Math.sin(b) * r1); }
    if (kind === 2) { const b = ang - 0.05, m = (r0 + r1) / 2; ctx.moveTo(c * m, s * m); ctx.lineTo(Math.cos(b) * m, Math.sin(b) * m); }
  }
  ctx.stroke();
  ctx.restore();
  // Crackling lightning along the ring (new shape every frame).
  ctx.strokeStyle = rgba([235, 255, 240], a * 0.85);
  ctx.lineWidth = Math.max(1, R * 0.012);
  for (let k = 0; k < 3; k++) {
    const s0 = Math.random() * TAU;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const th = s0 + i * 0.12, r = R * (0.93 + (Math.random() - 0.5) * 0.12);
      if (i === 0) ctx.moveTo(Math.cos(th) * r, Math.sin(th) * r); else ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r);
    }
    ctx.stroke();
  }
}

export const STYLES = {
  strange: { name: 'Strange', core: [255, 140, 30], hi: [255, 222, 150], particle: 'spark', motif: strangeCircle, falls: true },
  wanda: { name: 'Wanda', core: [235, 25, 65], hi: [255, 130, 160], particle: 'soft', motif: wandaCircle, falls: false },
  doom: { name: 'Doom', core: [40, 255, 110], hi: [200, 255, 210], particle: 'spark', motif: doomCircle, falls: false },
};
const STYLE_KEYS = Object.keys(STYLES);
const SOUNDS = ['hum', 'drone', 'blast', 'portal'];

export class SpellMode {
  // sfx: SfxBus (load/play); save(patch) persists settings.
  constructor({ getSettings, save, toast = () => {}, sfx = null }) {
    Object.assign(this, { getSettings, save, toast, sfx });
    this.gestures = new SpellGestures();
    this.shields = new Map();
    this.orb = null;
    this.channel = null;
    this.portals = [];
    this.blasts = [];
    this.face = null;
    this.hum = null;
    this.drone = null;
    this.ps = new ParticleSystem(3000);
    this.lastT = null;
    this.soundsLoaded = false;
  }

  get styleId() { const s = this.getSettings().spellStyle; return STYLES[s] ? s : 'strange'; }
  get style() { return STYLES[this.styleId]; }

  // Sounds are synthesized the first time Spell mode is used, not at page load.
  loadSounds() {
    if (this.soundsLoaded || !this.sfx) return;
    this.soundsLoaded = true;
    for (const s of SOUNDS) this.sfx.load('spell:' + s, 'synth:' + s, null);
  }

  play(name, o = {}) {
    return this.sfx ? this.sfx.play('spell:' + name, { volume: 1, ...o }) : { stop() {} };
  }

  // Alt+Shift+1/2/3 pick the style; 4 casts a blast, 5 opens a portal (no gesture needed).
  hotkey(combo, now = performance.now()) {
    this.loadSounds();
    const m = /^Alt\+Shift\+([1-5])$/.exec(combo);
    if (!m) return false;
    const n = Number(m[1]);
    if (n === 4) { this.cast('blast', now); return true; }
    if (n === 5) { this.cast('portal', now); return true; }
    const id = STYLE_KEYS[n - 1];
    this.save({ spellStyle: id });
    this.toast(`✨ ${STYLES[id].name}`);
    return true;
  }

  cast(kind, now) {
    const f = this.face && this.face.box;
    if (kind === 'blast') {
      this.blasts.push({ x: f ? f.x + f.w * 1.3 : 0.65, y: f ? f.y + f.h * 1.2 : 0.7, born: now });
      this.play('blast');
    } else if (kind === 'portal') {
      // Beside your head, on whichever side has more room.
      const left = f ? f.x + f.w / 2 > 0.5 : true;
      this.portals.push({ x: left ? 0.25 : 0.75, y: 0.45, r: 0.17, born: now });
      if (this.portals.length > 3) this.portals.shift();
      this.play('portal', { volume: 0.8 });
    }
  }

  update(det, now) {
    this.loadSounds();
    const r = this.gestures.update(det, now);
    this.face = det.face;
    const follow = (cur, nxt, k = 0.5) => { cur.x += (nxt.x - cur.x) * k; cur.y += (nxt.y - cur.y) * k; cur.r += (nxt.r - cur.r) * k; };

    for (const s of r.shields) {
      const cur = this.shields.get(s.hand);
      if (cur) follow(cur, s); else this.shields.set(s.hand, { ...s, born: now });
      this.shields.get(s.hand).lastSeen = now;
    }
    for (const [k, s] of this.shields) if (now - s.lastSeen > FADE_MS) this.shields.delete(k);

    if (r.orb) {
      if (this.orb) follow(this.orb, r.orb); else this.orb = { ...r.orb, born: now };
      this.orb.lastSeen = now;
    } else if (this.orb && now - this.orb.lastSeen > FADE_MS) this.orb = null;

    if (r.channel) {
      if (!this.channel) this.channel = { born: now };
      this.channel.hands = r.channel.hands;
      this.channel.lastSeen = now;
    } else if (this.channel && now - this.channel.lastSeen > CHANNEL_LINGER) this.channel = null;

    for (const b of r.blasts) { this.blasts.push({ ...b, born: now }); this.play('blast'); }
    for (const p of r.portals) {
      this.portals.push({ ...p, born: now });
      if (this.portals.length > 3) this.portals.shift();
      this.play('portal', { volume: 0.8 });
    }
    this.blasts = this.blasts.filter((b) => now - b.born < BLAST_MS);
    this.portals = this.portals.filter((p) => now - p.born < PORTAL_MS);

    const wantHum = this.shields.size > 0 || !!this.orb;
    if (wantHum && !this.hum) this.hum = this.play('hum', { loop: true, volume: 0.55 });
    else if (!wantHum && this.hum) { this.hum.stop(); this.hum = null; }
    if (this.channel && !this.drone) this.drone = this.play('drone', { loop: true, volume: 0.6 });
    else if (!this.channel && this.drone) { this.drone.stop(); this.drone = null; }
  }

  // Leaving Spell mode: stop sounds, drop held spells (portals and blasts too).
  pause() {
    if (this.hum) { this.hum.stop(); this.hum = null; }
    if (this.drone) { this.drone.stop(); this.drone = null; }
    this.shields.clear();
    this.orb = null;
    this.channel = null;
    this.portals = [];
    this.blasts = [];
    this.ps.clear();
    this.lastT = null;
  }

  get busy() {
    return this.shields.size > 0 || !!this.orb || !!this.channel || this.portals.length > 0 || this.blasts.length > 0 || this.ps.count > 0;
  }

  // ---- rendering ----
  renderGL(g, env) {
    const now = env.now;
    const dt = this.lastT === null ? 0 : Math.min(0.05, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    const st = this.style;
    const aspect = env.w / env.h;
    this.emit(dt, now, st, aspect, env.quality ?? 1);
    this.ps.step(dt, { drag: st.falls ? 0.6 : 1.4, gravity: st.falls ? 0.5 : 0 });
    g.draw2D((ctx, w, h) => this.paint(ctx, w, h, now, st));
    g.particles(this.ps, { blend: 'add', shape: st.particle, sizeScale: 1 });
  }

  emit(dt, now, st, aspect, q) {
    if (!dt) return;
    const ps = this.ps, rate = dt * 60 * q;
    const col = (p, hiMix) => {
      const c = Math.random() < hiMix ? st.hi : st.core;
      p.r = c[0] / 255; p.g = c[1] / 255; p.b = c[2] / 255;
    };
    const soft = st.particle === 'soft';
    const spark = (x, y, vx, vy, life, size, alpha = 1, kind = 0) => ps.spawn(1, (_, p) => {
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.kind = kind;
      p.size = soft ? size * 3 : size; p.a = soft ? alpha * 0.35 : alpha;
      p.rot = Math.atan2(vy, vx * aspect);
      col(p, 0.35);
    });

    for (const s of this.shields.values()) {
      for (let i = 0; i < 5 * rate; i++) {
        const th = Math.random() * TAU, R = s.r * (0.95 + Math.random() * 0.1);
        const x = s.x + Math.cos(th) * R / aspect, y = s.y + Math.sin(th) * R;
        const v = 0.25 + Math.random() * 0.25;
        spark(x, y, -Math.sin(th) * v / aspect, Math.cos(th) * v, 0.35 + Math.random() * 0.35, 3 + Math.random() * 3, 1, st.falls ? 1 : 0);
      }
    }
    if (this.orb) {
      const o = this.orb;
      for (let i = 0; i < 7 * rate; i++) {
        const th = Math.random() * TAU, R = o.r * (1.4 + Math.random() * 0.5);
        const x = o.x + Math.cos(th) * R / aspect, y = o.y + Math.sin(th) * R;
        const inx = -Math.cos(th), iny = -Math.sin(th), tan = 0.6;
        spark(x, y, (inx + -iny * tan) * R * 2.2 / aspect, (iny + inx * tan) * R * 2.2, 0.4 + Math.random() * 0.2, 2.5 + Math.random() * 2.5);
      }
    }
    if (this.channel && this.channel.hands) {
      for (const hnd of this.channel.hands) {
        for (const tip of hnd.tips) {
          if (Math.random() > 0.6 * rate) continue;
          spark(tip.x, tip.y, (Math.random() - 0.5) * 0.08, -0.15 - Math.random() * 0.25, 0.6 + Math.random() * 0.6, 3 + Math.random() * 4, 0.9);
        }
      }
      for (let i = 0; i < 2 * rate; i++) {
        spark(0.1 + Math.random() * 0.8, 0.95 + Math.random() * 0.05, (Math.random() - 0.5) * 0.03, -0.08 - Math.random() * 0.12, 2 + Math.random() * 2, 2 + Math.random() * 3, 0.7);
      }
    }
    for (const p of this.portals) {
      const k = this.portalOpen(p, now);
      if (k <= 0) continue;
      for (let i = 0; i < 22 * rate * k; i++) {
        const th = Math.random() * TAU, R = p.r * k;
        const x = p.x + Math.cos(th) * R / aspect, y = p.y + Math.sin(th) * R;
        const v = 0.35 + Math.random() * 0.5, out = 0.2;
        spark(x, y, (-Math.sin(th) * v + Math.cos(th) * out) / aspect, Math.cos(th) * v + Math.sin(th) * out, 0.3 + Math.random() * 0.6, 5 + Math.random() * 5, 1, st.falls ? 1 : 0);
      }
    }
    for (const b of this.blasts) {
      const t = now - b.born;
      if (t > BLAST_FLY) continue;
      const pos = this.blastPos(b, t);
      for (let i = 0; i < 10 * rate; i++) {
        spark(pos.x + (Math.random() - 0.5) * 0.03, pos.y + (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.25 + Math.random() * 0.3, 3 + Math.random() * 4);
      }
    }
  }

  portalOpen(p, now) {
    const t = now - p.born;
    return easeOut(t / 450) * (1 - easeOut((t - (PORTAL_MS - 400)) / 400));
  }

  blastPos(b, t) {
    const u = Math.min(1, t / BLAST_FLY);
    return { x: b.x + (0.5 - b.x) * u * 0.6, y: b.y + (0.45 - b.y) * u * 0.6, u };
  }

  paint(ctx, w, h, now, st) {
    const t = now / 1000;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';

    // Channel: colour wash, glowing eyes, glowing hands.
    if (this.channel) {
      const a = easeOut((now - this.channel.born) / 500) * Math.min(1, 1 - (now - this.channel.lastSeen - 100) / CHANNEL_LINGER);
      ctx.fillStyle = rgba(st.core, 0.1 * a);
      ctx.fillRect(0, 0, w, h);
      const f = this.face;
      if (f && f.eyes) {
        const er = f.box.w * w * 0.16;
        for (const e of [f.eyes.left, f.eyes.right]) {
          const x = e.x * w, y = e.y * h;
          const gr = ctx.createRadialGradient(x, y, 0, x, y, er);
          gr.addColorStop(0, rgba([255, 255, 255], a));
          gr.addColorStop(0.25, rgba(st.hi, a));
          gr.addColorStop(1, rgba(st.core, 0));
          ctx.fillStyle = gr;
          ctx.fillRect(x - er, y - er, er * 2, er * 2);
          ctx.fillStyle = rgba(st.hi, 0.5 * a);
          ctx.fillRect(x - er * 2.2, y - er * 0.06, er * 4.4, er * 0.12);
        }
      }
      for (const hnd of this.channel.hands || []) {
        const x = hnd.palm.x * w, y = hnd.palm.y * h, r = hnd.size * h * 1.8;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, rgba(st.hi, 0.55 * a));
        gr.addColorStop(1, rgba(st.core, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }

    // Shields.
    ctx.shadowBlur = h * 0.012;
    ctx.shadowColor = rgba(st.hi, 1);
    for (const s of this.shields.values()) {
      const a = easeOut((now - s.born) / 200) * Math.min(1, 1 - (now - s.lastSeen - 60) / FADE_MS);
      ctx.save();
      ctx.translate(s.x * w, s.y * h);
      st.motif(ctx, s.r * h * (0.6 + 0.4 * easeOut((now - s.born) / 250)), t, a, st);
      ctx.restore();
    }

    // Orb.
    if (this.orb) {
      const o = this.orb, a = easeOut((now - o.born) / 200) * Math.min(1, 1 - (now - o.lastSeen - 60) / FADE_MS);
      const x = o.x * w, y = o.y * h, r = o.r * h * (1 + 0.06 * Math.sin(t * 9));
      ctx.shadowBlur = 0;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba([255, 255, 255], a));
      gr.addColorStop(0.35, rgba(st.hi, a));
      gr.addColorStop(0.7, rgba(st.core, 0.6 * a));
      gr.addColorStop(1, rgba(st.core, 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.shadowBlur = h * 0.01;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 2.5);
      st.motif(ctx, r * 1.25, t * 2, a * 0.7, st);
      ctx.restore();
    }

    // Portals.
    for (const p of this.portals) {
      const k = this.portalOpen(p, now);
      if (k <= 0) continue;
      const x = p.x * w, y = p.y * h, R = p.r * h * k;
      ctx.shadowBlur = 0;
      // Inner glow toward the rim, so the portal reads as an opening, not a disc.
      const inner = ctx.createRadialGradient(x, y, R * 0.2, x, y, R);
      inner.addColorStop(0, rgba(st.core, 0));
      inner.addColorStop(0.75, rgba(st.core, 0.12 * k));
      inner.addColorStop(1, rgba(st.hi, 0.45 * k));
      ctx.fillStyle = inner;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      // The style's own pattern spinning round the outside.
      ctx.shadowBlur = h * 0.01;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.6);
      st.motif(ctx, R * 1.18, t, 0.7 * k, st);
      ctx.restore();
      ctx.shadowBlur = h * 0.02;
      ctx.lineWidth = Math.max(2, R * 0.07);
      ctx.strokeStyle = rgba(st.core, k);
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
      ctx.lineWidth = Math.max(1, R * 0.025);
      ctx.strokeStyle = rgba(st.hi, k);
      ctx.setLineDash([R * 0.12, R * 0.08]);
      ctx.lineDashOffset = -t * R * 1.5;
      ctx.beginPath(); ctx.arc(x, y, R * 0.94, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Blasts: a bolt flying at the viewer, then a flash and a shock ring.
    ctx.shadowBlur = 0;
    for (const b of this.blasts) {
      const tt = now - b.born;
      if (tt < BLAST_FLY) {
        const pos = this.blastPos(b, tt), r = h * (0.03 + 0.5 * pos.u ** 2.2);
        const x = pos.x * w, y = pos.y * h;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, rgba([255, 255, 255], 1));
        gr.addColorStop(0.3, rgba(st.hi, 0.95));
        gr.addColorStop(1, rgba(st.core, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      } else {
        const v = (tt - BLAST_FLY) / (BLAST_MS - BLAST_FLY);
        ctx.fillStyle = rgba(st.hi, 0.75 * (1 - v) ** 2);
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = rgba(st.core, 1 - v);
        ctx.lineWidth = Math.max(2, h * 0.05 * (1 - v));
        ctx.beginPath(); ctx.arc(0.5 * w, 0.45 * h, v * h * 1.1, 0, TAU); ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
  }
}
