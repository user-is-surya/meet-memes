// Emotional Damage (Steven He): crash zoom onto your face, handheld camera shake, a red
// hit-flash, and EMOTIONAL DAMAGE slammed onto the screen, shaking with the camera.
// meme.json render: { type: 'damage', durationMs, zoom, text }
import { Effect } from './base.js';
import { registerPass } from '../gfx/graphics.js';
import { clamp01 } from '../lib/draw.js';

registerPass('vignette', `
uniform vec3 uColor;
uniform float uStrength;
void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float r = length((vLocal - 0.5) * asp);
  float v = smoothstep(0.25, 0.95, r);
  outColor = vec4(uColor, clamp(v * uStrength + uStrength * 0.15, 0.0, 1.0));
}`, (ctx, w, h, u) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  const [r, gg, b] = (u.uColor || [1, 0, 0]).map((c) => Math.round(c * 255));
  g.addColorStop(0, `rgba(${r},${gg},${b},${0.15 * u.uStrength})`);
  g.addColorStop(1, `rgba(${r},${gg},${b},${u.uStrength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

const easeOut = (t) => 1 - (1 - t) ** 3;
const shake1 = (t, f, seed) => Math.sin(t * f + seed) * 0.6 + Math.sin(t * f * 2.3 + seed * 1.7) * 0.4;

export class DamageEffect extends Effect {
  static layer = 2;

  get duration() { return this.r.durationMs ?? 2600; }

  renderGL(g, env) {
    const now = env.now, t = now - this.startAt, total = this.duration;
    const f = env.det && env.det.face;
    const cx = f ? f.box.x + f.box.w / 2 : 0.5, cy = f ? f.box.y + f.box.h * 0.5 : 0.4;
    const maxZoom = this.r.zoom ?? 1.6;
    // Zoom: crash in over 120 ms, hold, ease back out over the last 400 ms.
    const zin = easeOut(clamp01(t / 120)), zout = 1 - easeOut(clamp01((t - (total - 400)) / 400));
    const scale = 1 + (maxZoom - 1) * Math.min(zin, zout);
    // Handheld shake for 1.5 s, decaying.
    const k = (1 - clamp01((t - 1500) / 300)) * Math.min(zin, zout);
    const ts = t / 1000;
    const shake = { x: shake1(ts, 23, 1) * 0.015 * k, y: shake1(ts, 19, 4) * 0.012 * k, rot: shake1(ts, 15, 7) * 0.021 * k };
    g.drawFrame({ zoom: { cx, cy, scale }, shake, contrast: 1.1, saturation: 1.15 });

    // Red hit-flash on impact, fading over 600 ms, and a faint red edge after.
    const flash = 0.85 * (1 - clamp01(t / 600)) + 0.1 * Math.min(zin, zout);
    g.pass('vignette', { uniforms: { uColor: [1, 0.06, 0.06], uStrength: flash } });

    // Title: slams in from 1.4x, shakes with the camera.
    const ta = clamp01((t - 60) / 80) * clamp01((total - t) / 250);
    if (ta > 0) {
      const slam = 1 + 0.4 * (1 - easeOut(clamp01((t - 60) / 160)));
      const font = "Impact, 'Anton', 'Arial Black', sans-serif";
      const x = 0.5 + shake.x * 0.8, y = 0.8 + shake.y * 0.8;
      g.drawText(this.r.text || 'EMOTIONAL DAMAGE', x, y, {
        size: 0.13, font, weight: 900, fill: '#ffffff', stroke: '#c40000', strokeWidth: 0.16, scale: slam, rotate: shake.rot * 0.6, alpha: ta,
      });
    }
  }
}
