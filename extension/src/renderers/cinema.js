// Absolute Cinema: you become the poster. A one-frame white cut, then your live video in
// high-contrast black and white with a dark vignette, film grain and gate flicker, a slow
// push-in on your face, and ABSOLUTE / CINEMA in big white letters. Holds while you hold
// the pose, lingers, then fades back to colour.
// meme.json render: { type: 'cinema', hold: true, minMs, lingerMs, title, subtitle }
import { Effect } from './base.js';
import { registerPass } from '../gfx/graphics.js';
import { clamp01 } from '../lib/draw.js';

const easeInOut = (t) => t * t * (3 - 2 * t);

registerPass('filmLook', `
uniform float uVignette, uGrain, uFlicker, uAmount;
void main() {
  vec2 uv = vLocal;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float r = length((uv - 0.5) * asp * vec2(0.9, 1.05));
  float vig = smoothstep(0.35, 1.05, r) * uVignette;
  float g = (hash12(uv * uRes + fract(uTime * 37.0) * 512.0) - 0.5) * uGrain;
  float flick = (vnoise(vec2(uTime * 12.0, 3.7)) - 0.5) * uFlicker;
  // A black layer whose opacity carries the vignette, the flicker and the grain.
  float a = clamp(vig - flick + g, 0.0, 1.0) * uAmount;
  outColor = vec4(0.0, 0.0, 0.0, a);
}`, (ctx, w, h, u) => {
  const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${0.85 * (u.uVignette || 0) * (u.uAmount ?? 1)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
});

export class CinemaEffect extends Effect {
  static layer = 2;

  renderGL(g, env) {
    const now = env.now;
    const t = now - this.startAt;
    const amount = this.envelope(now); // 0..1 fade in/out (fadeMs)
    const end = this.endTime();
    const holdFor = (end === Infinity ? t : Math.min(t, end - this.startAt));
    const f = env.det && env.det.face;
    const cx = f ? f.box.x + f.box.w / 2 : 0.5, cy = f ? f.box.y + f.box.h * 0.45 : 0.42;
    const push = 1 + 0.06 * easeInOut(clamp01(holdFor / 6000)) * amount;

    g.drawFrame({
      mono: amount,
      contrast: 1 + 0.35 * amount,
      brightness: 1 + 0.04 * amount,
      zoom: { cx, cy, scale: push },
    });
    g.pass('filmLook', { uniforms: { uVignette: 0.75, uGrain: 0.07, uFlicker: 0.06, uAmount: amount } });

    // The cut: one frame of white, fading fast.
    if (t < 140) g.drawImage(white(), 0, 0, 1, 1, { alpha: 1 - t / 140, key: 'white', static: true });

    const ta = clamp01((t - 120) / 250) * amount;
    if (ta > 0) {
      const font = "'Montserrat', 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
      g.drawText(this.r.subtitle || 'ABSOLUTE', 0.5, 0.775, {
        size: 0.06, font, weight: 700, fill: '#fff', letterSpacing: 0.04, glow: 0.25, glowColor: 'rgba(0,0,0,.6)', alpha: ta,
      });
      g.drawText(this.r.title || 'CINEMA', 0.5, 0.9, {
        size: 0.15, font, weight: 800, fill: '#fff', glow: 0.3, glowColor: 'rgba(0,0,0,.7)', alpha: ta,
      });
    }
  }
}

let whiteCanvas = null;
function white() {
  if (!whiteCanvas) {
    whiteCanvas = new OffscreenCanvas(4, 4);
    const c = whiteCanvas.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 4, 4);
  }
  return whiteCanvas;
}
