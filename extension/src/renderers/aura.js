// Feel the aura: a glowing aura hugs your outline (pulsing), wisps rise off your edges,
// and "+1000 AURA" floats above you. Holds while you hold the pose.
// meme.json render: { type: 'aura', color, caption, hold, minMs, lingerMs, durationMs }
import { Effect } from './base.js';
import { registerPass } from '../gfx/graphics.js';
import { ParticleSystem } from '../gfx/particles.js';
import { clamp01 } from '../lib/draw.js';

registerPass('maskGlow', `
uniform vec3 uColor;
uniform float uRadius, uStrength;
void main() {
  if (uHasMask < 0.5) { outColor = vec4(0.0); return; }
  float m = texture(uMask, vLocal).a;
  vec2 asp = vec2(uRes.y / uRes.x, 1.0);
  float acc = 0.0, wsum = 0.0;
  for (int ring = 1; ring <= 3; ring++) {
    float r = uRadius * float(ring) / 3.0;
    for (int k = 0; k < 8; k++) {
      float a = 6.2831853 * float(k) / 8.0 + float(ring) * 0.4;
      vec2 o = vec2(cos(a), sin(a)) * r * asp;
      float w = 1.0 / float(ring);
      acc += texture(uMask, vLocal + o).a * w;
      wsum += w;
    }
  }
  float halo = acc / wsum;
  float flame = 0.75 + 0.25 * fbm(vLocal * vec2(9.0, 5.0) + vec2(0.0, -uTime * 1.4));
  float glow = clamp(halo * (1.0 - smoothstep(0.3, 0.7, m)) * 1.8, 0.0, 1.0) * flame;
  outColor = vec4(uColor, glow * uStrength);
}`, (ctx, w, h, u, g) => {
  if (!g.mask) return;
  ctx.globalAlpha = 0.6 * (u.uStrength || 1);
  ctx.filter = `blur(${Math.round(h * 0.02)}px) drop-shadow(0 0 ${Math.round(h * 0.02)}px rgb(${u.uColor.map((c) => c * 255 | 0).join(',')}))`;
  ctx.drawImage(g.mask, 0, 0, w, h);
});

const GW = 64, GH = 36;

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0xb26bff;
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
}

export class AuraEffect extends Effect {
  static layer = 1;
  static needsMask = true;

  constructor(def, deps) {
    super(def, deps);
    this.wisps = new ParticleSystem(2000);
    this.color = hexToRgb(this.r.color);
  }

  stop() { super.stop(); this.wisps.clear(); }

  // Edge cells of the person mask, where wisps come from.
  edges(mask) {
    if (mask === this.edgeSrc) return this.edgeList;
    this.edgeSrc = mask;
    if (!this.grid) this.grid = new OffscreenCanvas(GW, GH);
    const c = this.grid.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, GW, GH);
    c.drawImage(mask, 0, 0, GW, GH);
    const a = c.getImageData(0, 0, GW, GH).data, list = [];
    const on = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && a[(y * GW + x) * 4 + 3] > 128;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (on(x, y) && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1))) list.push([(x + 0.5) / GW, (y + 0.5) / GH]);
    }
    this.edgeList = list;
    return list;
  }

  renderGL(g, env) {
    const now = env.now, a = this.envelope(now);
    const dt = Math.min(0.1, Math.max(0, (now - (this.lastNow || now)) / 1000));
    this.lastNow = now;
    const pulse = 0.85 + 0.15 * Math.sin(now / 1000 * Math.PI * 2 * 1.2);
    const mask = env.det && env.det.mask;
    if (mask) {
      g.pass('maskGlow', { blend: 'add', uniforms: { uColor: this.color, uRadius: 0.055, uStrength: 1.5 * a * pulse } });
      const edges = this.edges(mask);
      if (edges.length && a > 0.2) {
        const n = Math.round(30 * (env.quality ?? 1) * a);
        this.wisps.spawn(n, (k, p) => {
          const [x, y] = edges[(Math.random() * edges.length) | 0];
          p.x = x + (Math.random() - 0.5) * 0.01; p.y = y;
          p.vx = (Math.random() - 0.5) * 0.04; p.vy = -0.1 - Math.random() * 0.1;
          p.life = 0.8 + Math.random() * 0.9; p.size = 3 + Math.random() * 5;
          p.r = Math.min(1, this.color[0] + 0.25); p.g = Math.min(1, this.color[1] + 0.25); p.b = Math.min(1, this.color[2] + 0.2); p.a = 0.55;
        });
      }
    }
    if (this.wisps.count) {
      const t = now / 1000;
      this.wisps.step(dt, { drag: 0.4, force: (i, ps, out) => { out.x = Math.sin(ps.y[i] * 18 + t * 2) * 0.12; out.y = -0.05; } });
      g.particles(this.wisps, { shape: 'soft', blend: 'add' });
    }
    const f = env.det && env.det.face;
    const capY = f ? Math.max(0.09, f.box.y - 0.08) : 0.1;
    const ta = clamp01((now - this.startAt - 150) / 300) * a;
    if (ta > 0 && this.r.caption) {
      const rise = (1 - clamp01((now - this.startAt) / 500)) * 0.03;
      g.drawText(this.r.caption, 0.5, capY + rise, {
        size: 0.085, font: "'Montserrat', 'Arial Black', Impact, sans-serif", weight: 900, fill: '#ffffff',
        glow: 0.5, glowColor: this.r.color || '#b26bff', stroke: '#2a0a4a', strokeWidth: 0.08, alpha: ta,
      });
    }
  }
}
