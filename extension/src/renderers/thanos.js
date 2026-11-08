// Thanos snap, Infinity War style.
//   snap -> 0.8 s of nothing -> a ragged front sweeps across you (lower body and the side
//   away from the snapping hand first, head last). Ahead of the front you turn ash-brown;
//   at the front you crumble into thousands of flakes (your own colours, turning to ash)
//   that drift away on the wind. Behind it: your empty room.
//   Snap again (or wait 20 s) -> you re-form from a warm golden shimmer, Endgame style.
//
// The empty room comes from a background model learned while Meet Memes is on, with
// never-seen areas rebuilt by content-aware fill (src/fx/inpaint.js). Never blurred.
// meme.json render: { type: 'thanos', wind (1 = default strength), autoReturnMs }
import { Effect } from './base.js';
import { ThanosTimeline, PAUSE_MS } from '../fx/thanos-timeline.js';
import { BackgroundModel } from '../fx/bg-model.js';
import { buildPlate, nearestFill } from '../fx/inpaint.js';
import { ParticleSystem } from '../gfx/particles.js';
import { registerPass } from '../gfx/graphics.js';

const GW = 96, GH = 54; // CPU sampling grid for particle spawning
const ASH = [0.21, 0.165, 0.13];

// --- value noise / fbm, identical to NOISE_GLSL in gfx/gl.js so CPU and GPU agree ---
const fract = (v) => v - Math.floor(v);
function hash12(x, y) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}
function fbm(x, y) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 5; i++) { v += a * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 17.1; a *= 0.5; }
  return v;
}

registerPass('thanos', `
uniform sampler2D uPlate;
uniform sampler2D uPerson;
uniform float uFront, uBand, uMode, uRet, uExtent;
uniform vec2 uDir, uCenter;
void main() {
  vec2 uv = vLocal;
  vec3 live = texture(uFrame, uv).rgb;
  // Person = segmentation mask plus detected hands, taken generously so no fringe survives.
  float m = smoothstep(0.12, 0.38, texture(uPerson, uv).a);
  vec3 plate = texture(uPlate, uv).rgb;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec3 col;
  if (uMode < 0.5) {
    float d = clamp(dot((uv - uCenter) * asp, uDir) / uExtent * 0.5 + 0.5, 0.0, 1.0) + (fbm(uv * asp * 7.0) - 0.5) * 0.5;
    float alive = smoothstep(uFront, uFront + 0.012, d);
    float ash = 1.0 - smoothstep(uFront, uFront + uBand, d);
    float l = dot(live, vec3(0.299, 0.587, 0.114));
    vec3 ashCol = mix(vec3(0.23, 0.18, 0.145), vec3(l) * vec3(0.62, 0.5, 0.42), 0.45);
    vec3 person = mix(live, ashCol * (0.7 + 0.3 * l), ash * 0.92);
    person *= 1.0 - 0.4 * smoothstep(uFront + 0.035, uFront, d) * alive;
    col = mix(live, mix(plate, person, alive), m);
  } else {
    float n = fbm(uv * asp * 6.0 + 3.1);
    float t = uRet * 1.3 - 0.15;
    float alive = smoothstep(n - 0.04, n + 0.04, t);
    float edge = smoothstep(0.1, 0.0, abs(t - n)) * (1.0 - uRet * 0.8);
    vec3 person = live + vec3(1.0, 0.62, 0.22) * edge;
    col = mix(live, mix(plate, person, alive), m);
  }
  outColor = vec4(col, 1.0);
}`, (ctx, w, h, u, g, o) => {
  // 2D fallback: fade the room in over you as the front advances (no ragged edge).
  const plate = o.textures && o.textures.uPlate;
  const mask = g.mask;
  if (!plate || !mask) return;
  const a = u.uMode < 0.5 ? Math.min(1, Math.max(0, u.uFront)) : 1 - u.uRet;
  const c = g.thanosTmp = g.thanosTmp || new OffscreenCanvas(w, h);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const t = c.getContext('2d');
  t.globalCompositeOperation = 'copy';
  t.drawImage(plate, 0, 0, w, h);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(mask, 0, 0, w, h);
  ctx.globalAlpha = a;
  ctx.drawImage(c, 0, 0);
});

export class ThanosEffect extends Effect {
  static layer = 0;
  static needsMask = true;

  constructor(def, deps) {
    super(def, deps);
    this.tl = new ThanosTimeline({ autoReturnMs: this.r.autoReturnMs ?? 20000 });
    this.dust = new ParticleSystem(60000);
    this.shimmer = new ParticleSystem(8000);
    this.grid = { frame: null, mask: null };
    this.lastLearn = -Infinity;
    this.lastNow = 0;
  }

  get duration() { return Infinity; }
  isActive() { return this.tl.state !== 'idle' || this.tl.pendingSnap !== null || this.dust.count > 0 || this.shimmer.count > 0; }
  endTime() { return this.isActive() ? Infinity : -1; }

  stop() {
    this.tl.reset();
    this.dust.clear();
    this.shimmer.clear();
    this.stopSound();
  }

  fire(info, now) {
    if (this.tl.state === 'pause' || this.tl.state === 'returning') return;
    this.playSound();
    this.startAt = now;
    this.info = info || {};
    this.tl.snap(now);
  }

  setHeld() {}

  // ---- learning the empty room ----
  onDetect(det, src, force = false) {
    if (!det.mask || !src || !src.width) return;
    const now = performance.now();
    if (!force && (now - this.lastLearn < 150 || this.tl.state === 'pause')) return;
    this.lastLearn = now;
    const scale = Math.min(1, 960 / src.width);
    const w = Math.max(16, Math.round(src.width * scale)), h = Math.max(9, Math.round(src.height * scale));
    if (!this.bg || this.bg.w !== w || this.bg.h !== h) {
      this.bg = new BackgroundModel(w, h, { dilate: Math.max(3, Math.round(w / 80)), minSeen: 4 });
      this.learnCanvas = new OffscreenCanvas(w, h);
    }
    const c = this.learnCanvas.getContext('2d', { willReadFrequently: true });
    c.globalCompositeOperation = 'copy';
    c.drawImage(src, 0, 0, w, h);
    const frame = c.getImageData(0, 0, w, h).data;
    c.drawImage(det.mask, 0, 0, w, h);
    const mask = c.getImageData(0, 0, w, h).data;
    this.bg.learn(frame, mask);
  }

  // Snapshot the learned room and build the plate (content-aware fill) in the engine
  // iframe, a separate process, so the call's video never stutters. The silent pause
  // waits for it (up to 2 s).
  beginSnap() {
    this.plateReady = false;
    if (!this.bg) return;
    const { rgba, known, w, h } = this.bg.snapshot();
    const token = this.snapToken = (this.snapToken || 0) + 1;
    const done = (full) => {
      if (!full || token !== this.snapToken) return;
      this.plate = this.plate && this.plate.width === w && this.plate.height === h ? this.plate : new OffscreenCanvas(w, h);
      this.plate.getContext('2d').putImageData(new ImageData(full, w, h), 0, 0);
      this.plateReady = true;
    };
    this.snapData = { rgba, known, w, h };
    const engine = this.deps && this.deps.assets && this.deps.assets.engine;
    if (engine && engine.buildPlate) engine.buildPlate(rgba.slice(), known.slice(), w, h).then(done).catch(() => {});
    else setTimeout(() => done(buildPlate(rgba, known, w, h)), 0);
  }

  // The good fill is late (slow machine): carry on with an instant nearest-pixel fill.
  // When the content-aware fill arrives it replaces this.
  useQuickPlate() {
    const d = this.snapData;
    if (!d) return;
    this.plate = this.plate && this.plate.width === d.w && this.plate.height === d.h ? this.plate : new OffscreenCanvas(d.w, d.h);
    this.plate.getContext('2d').putImageData(new ImageData(nearestFill(d.rgba, d.known, d.w, d.h), d.w, d.h), 0, 0);
    this.plateReady = true;
  }

  // Low-res copies of the frame and mask for spawning particles with the right colours.
  sample(env, force = false) {
    if (!this.gridCanvas) this.gridCanvas = new OffscreenCanvas(GW, GH);
    const c = this.gridCanvas.getContext('2d', { willReadFrequently: true });
    c.globalCompositeOperation = 'copy';
    this.sampleN = (this.sampleN || 0) + 1;
    if (force || !this.grid.frame || this.sampleN % 3 === 0) {
      c.drawImage(env.src, 0, 0, GW, GH);
      this.grid.frame = c.getImageData(0, 0, GW, GH).data;
    }
    const mask = env.det && env.det.mask;
    if (mask && (force || mask !== this.gridMaskSrc)) {
      this.gridMaskSrc = mask;
      c.drawImage(mask, 0, 0, GW, GH);
      this.grid.mask = c.getImageData(0, 0, GW, GH).data;
    }
  }

  setupSweep(env) {
    const hand = (this.info && this.info.hand) || { x: 0.5 };
    const asp = env.w / env.h;
    // Start from the side away from the snapping hand, low first, head last.
    const sx = hand.x < 0.5 ? -1 : 1;
    const len = Math.hypot(1, 0.6);
    this.dir = [sx / len, -0.6 / len];
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0, any = false;
    const m = this.grid.mask;
    if (m) for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (m[(y * GW + x) * 4 + 3] < 128) continue;
      any = true;
      x0 = Math.min(x0, x / GW); x1 = Math.max(x1, (x + 1) / GW); y0 = Math.min(y0, y / GH); y1 = Math.max(y1, (y + 1) / GH);
    }
    if (!any) { x0 = 0.25; x1 = 0.75; y0 = 0.1; y1 = 1; }
    this.center = [(x0 + x1) / 2, (y0 + y1) / 2];
    this.extent = Math.max(0.05, (Math.abs(this.dir[0]) * (x1 - x0) * asp + Math.abs(this.dir[1]) * (y1 - y0)) / 2);
    this.asp = asp;
    this.prevFront = -1;
    this.cellD = new Float32Array(GW * GH);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) this.cellD[gy * GW + gx] = this.sweepD((gx + 0.5) / GW, (gy + 0.5) / GH);
  }

  sweepD(u, v) {
    const ax = (u - this.center[0]) * this.asp, ay = v - this.center[1];
    const lin = Math.min(1, Math.max(0, (ax * this.dir[0] + ay * this.dir[1]) / this.extent * 0.5 + 0.5));
    return lin + (fbm(u * this.asp * 7, v * 7) - 0.5) * 0.5;
  }

  spawnDust(front, quality) {
    const { frame, mask } = this.grid;
    if (!frame || !mask) return;
    const perCell = Math.max(3, Math.round(16 * quality));
    const windSign = this.dir[0] < 0 ? 1 : -1; // blow away from where it started
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = (gy * GW + gx) * 4;
      if (mask[i + 3] < 128) continue;
      const d = this.cellD[gy * GW + gx];
      if (d <= this.prevFront || d > front) continue;
      const r = frame[i] / 255, g = frame[i + 1] / 255, b = frame[i + 2] / 255;
      this.dust.spawn(perCell, (k, p) => {
        p.x = (gx + Math.random()) / GW;
        p.y = (gy + Math.random()) / GH;
        const chunk = Math.random() < 0.1;
        p.kind = chunk ? 1 : 0;
        p.size = chunk ? 5 + Math.random() * 3 : 2 + Math.random() * 2;
        const j = 0.9 + Math.random() * 0.2;
        p.r = r * j; p.g = g * j; p.b = b * j; p.a = 0.95;
        p.vx = windSign * (0.03 + Math.random() * 0.05) + (Math.random() - 0.5) * 0.05;
        p.vy = -0.04 - Math.random() * 0.06;
        p.life = 2 + Math.random() * 1.5;
        p.rot = Math.random() * 6.28;
        p.vr = (Math.random() - 0.5) * 8;
        p.data = 0.8 + Math.random() * 0.4; // ash brightness
      });
    }
    this.windSign = windSign;
  }

  spawnShimmer() {
    const { mask } = this.grid;
    if (!mask) return;
    for (let gy = 0; gy < GH; gy += 1) for (let gx = 0; gx < GW; gx += 1) {
      if (mask[(gy * GW + gx) * 4 + 3] < 128) continue;
      this.shimmer.spawn(1, (k, p) => {
        const tx = (gx + Math.random()) / GW, ty = (gy + Math.random()) / GH;
        const ang = Math.random() * 6.28, rad = 0.05 + Math.random() * 0.14;
        p.x = tx + Math.cos(ang) * rad; p.y = ty + Math.sin(ang) * rad;
        const T = 0.8 + Math.random() * 0.45;
        p.vx = (tx - p.x) / T; p.vy = (ty - p.y) / T;
        p.life = T + 0.2;
        p.size = 3 + Math.random() * 3.5;
        p.r = 1; p.g = 0.5 + Math.random() * 0.2; p.b = 0.1 + Math.random() * 0.1; p.a = 0.9;
      });
    }
  }

  // The person mask plus a disc over every detected hand (segmentation sometimes misses
  // a fast-moving hand; it must vanish with the rest of you).
  personMask(env) {
    const W = 192, H = 108;
    if (!this.pm) this.pm = new OffscreenCanvas(W, H);
    const c = this.pm.getContext('2d');
    c.clearRect(0, 0, W, H);
    const det = env.det || {};
    if (det.mask) c.drawImage(det.mask, 0, 0, W, H);
    c.fillStyle = '#fff';
    for (const hnd of det.hands || []) {
      const lm = hnd.landmarks;
      const size = Math.hypot((lm[0].x - lm[9].x) * env.w / env.h, lm[0].y - lm[9].y);
      const r = Math.max(2, size * 0.55 * H);
      for (const p of lm) { c.beginPath(); c.arc(p.x * W, p.y * H, r, 0, Math.PI * 2); c.fill(); }
    }
    return this.pm;
  }

  // Dust physics, inlined for speed: drag, wind, swirling turbulence, gravity on chunks,
  // and each flake's colour settling to ash.
  stepDust(dt, t) {
    const ps = this.dust;
    const ease = 1 - Math.exp(-dt / 0.12), damp = Math.exp(-1.1 * dt);
    const ws = (this.r.wind ?? 1) * (this.windSign || 1);
    const wx = 0.3 * ws * dt, wy = -0.1 * dt;
    const { x, y, vx, vy, age, life, kind, r, g, b, data, rot, vr } = ps;
    let w = 0;
    for (let i = 0; i < ps.count; i++) {
      const a = age[i] + dt;
      if (a >= life[i]) continue;
      const px = x[i], py = y[i];
      const ax = Math.sin(py * 14 + t * 1.7 + px * 3) * 0.35;
      const ay = Math.cos(px * 12 + t * 1.3) * 0.25 + (kind[i] > 0 ? 0.18 : 0.045);
      const nvx = (vx[i] + ax * dt) * damp, nvy = (vy[i] + ay * dt) * damp;
      const k = data[i];
      if (w !== i) {
        life[w] = life[i]; kind[w] = kind[i]; data[w] = k; ps.size[w] = ps.size[i]; ps.a[w] = ps.a[i]; vr[w] = vr[i];
        r[w] = r[i]; g[w] = g[i]; b[w] = b[i]; rot[w] = rot[i];
      }
      x[w] = px + nvx * dt + wx; y[w] = py + nvy * dt + wy; vx[w] = nvx; vy[w] = nvy; age[w] = a;
      rot[w] += vr[w] * dt;
      r[w] += (ASH[0] * k - r[w]) * ease; g[w] += (ASH[1] * k - g[w]) * ease; b[w] += (ASH[2] * k - b[w]) * ease;
      w++;
    }
    ps.count = w;
  }

  renderGL(g, env) {
    const now = env.now;
    const dt = Math.min(0.1, Math.max(0, (now - (this.lastNow || now)) / 1000));
    this.lastNow = now;
    const st = this.tl.update(now);
    const q = env.quality ?? 1;

    if (st.justEntered && st.state === 'pause') {
      // Snapped before the room was learned (e.g. right after joining): learn it from this frame.
      if (!this.bg && env.det && env.det.mask) this.onDetect(env.det, env.src, true);
      if (!this.bg) {
        const msg = 'Thanos needs a second to see your room. Snap again in a moment.';
        if (this.deps && this.deps.toast) this.deps.toast(msg); else console.warn('[meet-memes]', msg);
        this.stop();
        return;
      }
      this.sample(env, true); this.setupSweep(env); this.beginSnap();
    }
    // Hold the silent pause until the room plate is ready (at most 2 s in total).
    if (st.state === 'dissolving' && !this.plateReady) {
      if (now - this.startAt < 2000) { this.tl.enter('pause', now - PAUSE_MS + 16); return; }
      this.useQuickPlate();
    }
    if (st.state === 'dissolving' || st.state === 'returning') this.sample(env);
    if (st.justEntered && st.state === 'returning') { this.dust.clear(); this.spawnShimmer(); }

    const plate = this.plate;
    if (plate && (st.state === 'dissolving' || st.state === 'gone')) {
      const front = st.state === 'gone' ? 99 : -0.3 + 1.6 * st.progress;
      if (st.state === 'dissolving') { this.spawnDust(front, q); this.prevFront = front; }
      g.pass('thanos', {
        uniforms: { uFront: front, uBand: 0.2, uMode: 0, uRet: 0, uDir: this.dir, uCenter: this.center, uExtent: this.extent },
        textures: { uPlate: plate, uPerson: this.personMask(env) },
      });
    } else if (plate && st.state === 'returning') {
      g.pass('thanos', {
        uniforms: { uFront: 0, uBand: 0.2, uMode: 1, uRet: st.progress, uDir: this.dir, uCenter: this.center, uExtent: this.extent },
        textures: { uPlate: plate, uPerson: this.personMask(env) },
      });
    }

    if (this.dust.count) {
      this.stepDust(dt, now / 1000);
      g.particles(this.dust, { shape: 'flake' });
    }
    if (this.shimmer.count) {
      this.shimmer.step(dt, {});
      g.particles(this.shimmer, { shape: 'soft' });
    }
  }
}
