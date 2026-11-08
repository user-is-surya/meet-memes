// Laser eyes. Glowing red flares bloom on both irises (white-hot core, red glow, the
// long horizontal anamorphic streak of the "red eyes" meme), then beams fire from your
// eyes in the direction your head is turned, sparking where they leave the frame.
// Flares are tracked to your irises every frame (extrapolated between detections).
// meme.json render: { type: 'laser', hold: true, minMs, lingerMs, durationMs, soundLoop }
import { Effect } from './base.js';
import { registerPass } from '../gfx/graphics.js';
import { ParticleSystem } from '../gfx/particles.js';
import { clamp01 } from '../lib/draw.js';

registerPass('laserFlare', `
uniform vec4 uEyes;      // left.xy, right.xy (frame coords)
uniform float uR, uI, uStreak;
float flare(vec2 uv, vec2 c, vec2 asp) {
  vec2 d = (uv - c) * asp;
  float r = length(d) / uR;
  float core = exp(-r * r * 1.6);
  float glow = exp(-r * 0.9) * 0.6;
  float streak = exp(-abs(d.y) / (uR * 0.22)) * exp(-abs(d.x) / (uR * 9.0 * uStreak));
  return core * 1.4 + glow + streak * 0.9;
}
void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float f = flare(vLocal, uEyes.xy, asp) + flare(vLocal, uEyes.zw, asp);
  float flick = 0.92 + 0.08 * sin(uTime * 125.0);
  f *= uI * flick;
  vec3 col = mix(vec3(1.0, 0.08, 0.05), vec3(1.0, 0.92, 0.9), clamp(f - 1.1, 0.0, 1.0));
  outColor = vec4(col, clamp(f, 0.0, 1.0));
}`);

registerPass('laserBeam', `
uniform vec4 uEyes;
uniform vec2 uDir;       // unit direction in screen space (aspect-corrected)
uniform float uW, uI;
float beam(vec2 uv, vec2 c, vec2 asp) {
  vec2 p = (uv - c) * asp;
  float t = dot(p, uDir);
  if (t < 0.0) return 0.0;
  float d = length(p - uDir * t);
  float core = exp(-pow(d / (uW * 0.25), 2.0));
  float glow = exp(-d / uW) * 0.7;
  return (core * 1.3 + glow) * smoothstep(0.0, uW * 2.0, t);
}
void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float f = (beam(vLocal, uEyes.xy, asp) + beam(vLocal, uEyes.zw, asp)) * uI;
  f *= 0.9 + 0.1 * sin(uTime * 90.0 + vLocal.x * 40.0);
  vec3 col = mix(vec3(1.0, 0.1, 0.06), vec3(1.0, 0.95, 0.92), clamp(f - 1.0, 0.0, 1.0));
  outColor = vec4(col, clamp(f, 0.0, 1.0));
}`);

const EXTRAP_MS = 100;

export class LaserEffect extends Effect {
  static layer = 3;

  constructor(def, deps) {
    super(def, deps);
    this.track = []; // [{ t, l, r, pose }]
    this.sparks = new ParticleSystem(1500);
  }

  stop() { super.stop(); this.sparks.clear(); }

  onDetect(det) {
    const f = det.face;
    if (!f) return;
    const b = f.box;
    const eyes = f.eyes || {
      left: { x: b.x + b.w * 0.32, y: b.y + b.h * 0.42, r: b.w * 0.035 },
      right: { x: b.x + b.w * 0.68, y: b.y + b.h * 0.42, r: b.w * 0.035 },
    };
    this.track.push({ t: det.t || performance.now(), l: eyes.left, r: eyes.right, pose: f.pose || null, w: b.w });
    if (this.track.length > 2) this.track.shift();
  }

  // Eye positions now: linear extrapolation from the last two detections (max 100 ms ahead).
  eyesAt(now) {
    const [a, b] = this.track.length > 1 ? this.track : [this.track[0], this.track[0]];
    if (!b) return null;
    const dt = Math.max(1, b.t - a.t), k = Math.min(EXTRAP_MS, Math.max(0, now - b.t)) / dt;
    const ex = (p, q) => ({ x: q.x + (q.x - p.x) * k, y: q.y + (q.y - p.y) * k, r: q.r });
    return { l: ex(a.l, b.l), r: ex(a.r, b.r), pose: b.pose, w: b.w };
  }

  renderGL(g, env) {
    const now = env.now, t = now - this.startAt;
    const e = this.eyesAt(now);
    if (!e) {
      if (now - this.startAt > 600 && !this.warned) {
        this.warned = true;
        if (this.deps && this.deps.toast) this.deps.toast('Laser eyes need to see your face. Look at the camera.');
      }
      return;
    }
    const amount = this.envelope(now);
    const charge = clamp01(t / 300);
    const iris = Math.max(e.l.r, 0.004, e.w * 0.03);
    const R = iris * 2.2 * (0.3 + 0.7 * charge);
    const eyes = [e.l.x, e.l.y, e.r.x, e.r.y];
    const dt = Math.min(0.1, Math.max(0, (now - (this.lastNow || now)) / 1000));
    this.lastNow = now;

    // Beams after 600 ms, in the direction the head points (straight-on: a short burst at you).
    const firing = clamp01((t - 600) / 120) * amount;
    if (firing > 0) {
      const p = e.pose || { yaw: 0, pitch: 0 };
      let dx = Math.sin(p.yaw), dy = Math.sin(p.pitch);
      const mag = Math.hypot(dx, dy);
      const turned = clamp01((mag - 0.08) / 0.12);
      if (mag < 1e-3) { dx = 1; dy = 0; } else { dx /= mag; dy /= mag; }
      if (turned > 0) {
        g.pass('laserBeam', { blend: 'add', uniforms: { uEyes: eyes, uDir: [dx, dy], uW: 0.01 + iris * 0.6, uI: firing * turned } });
        this.spawnSparks(e, dx, dy, env, firing * turned);
      }
      // Facing the camera, the beams come at the viewer: flares swell with a pulse.
      this.blast = (1 - turned) * firing;
    } else {
      this.blast = 0;
    }
    const pulse = 1 + this.blast * (0.6 + 0.25 * Math.sin(t / 45));
    g.pass('laserFlare', { blend: 'add', uniforms: { uEyes: eyes, uR: R * pulse, uI: amount * (0.5 + 0.5 * charge), uStreak: 1 + this.blast * 0.8 } });

    if (this.sparks.count) {
      this.sparks.step(dt, { drag: 1.5, gravity: 0.8 });
      g.particles(this.sparks, { shape: 'spark', blend: 'add' });
    }
  }

  // Sparks where each beam leaves the frame.
  spawnSparks(e, dx, dy, env, k) {
    const asp = env.w / env.h;
    for (const eye of [e.l, e.r]) {
      // Ray from the eye (aspect-corrected direction) to the frame edge.
      const vx = dx / asp, vy = dy;
      let tMax = Infinity;
      if (vx > 1e-4) tMax = Math.min(tMax, (1 - eye.x) / vx); else if (vx < -1e-4) tMax = Math.min(tMax, -eye.x / vx);
      if (vy > 1e-4) tMax = Math.min(tMax, (1 - eye.y) / vy); else if (vy < -1e-4) tMax = Math.min(tMax, -eye.y / vy);
      if (!isFinite(tMax)) continue;
      const hx = eye.x + vx * tMax, hy = eye.y + vy * tMax;
      this.sparks.spawn(Math.round(10 * k * (env.quality ?? 1)), (i, p) => {
        const a = Math.atan2(-vy, -vx) + (Math.random() - 0.5) * 2.2, sp = 0.2 + Math.random() * 0.6;
        p.x = hx; p.y = hy; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.life = 0.2 + Math.random() * 0.35; p.size = 2 + Math.random() * 3;
        p.r = 1; p.g = 0.4 + Math.random() * 0.5; p.b = 0.2; p.a = 1;
      });
    }
  }
}
