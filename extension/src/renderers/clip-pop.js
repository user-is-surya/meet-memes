// A meme clip that pops up in a corner (with its sound), optionally with a caption and
// a punch-zoom on your face at a given moment of the clip.
// meme.json render: { type: 'clip-pop', clip, position, size, caption, caption2, punchAt, punchScale }
import { Effect } from './base.js';
import { ClipPlayer } from '../content/clip-player.js';
import { clamp01, easeOutBack } from '../lib/draw.js';

const easeOut = (t) => 1 - (1 - t) ** 3;

let shadowCanvas = null;
function shadow() {
  if (shadowCanvas) return shadowCanvas;
  const c = shadowCanvas = new OffscreenCanvas(128, 128);
  const g = c.getContext('2d');
  g.filter = 'blur(10px)';
  g.fillStyle = 'rgba(0,0,0,.65)';
  g.beginPath();
  g.roundRect(22, 22, 84, 84, 10);
  g.fill();
  return c;
}

export class ClipPopEffect extends Effect {
  static layer = 3;

  async load() {
    this.clip = new ClipPlayer((p) => this.deps.assets.engine.fetchBytes(p));
    await this.clip.load((this.def.base || '') + this.r.clip);
  }

  get duration() { return (this.clip && this.clip.duration ? this.clip.duration : (this.r.durationMs ?? 2500)) + 250; }

  fire(info, now, opts) {
    super.fire(info, now, opts);
    if (this.clip) this.clip.start(now);
  }

  // Face punch-zoom (draws the frame itself, so it runs before other overlays).
  frameZoom(env) {
    if (this.r.punchAt == null) return null;
    const t = env.now - this.startAt - this.r.punchAt;
    if (t < 0 || t > 550) return null;
    const k = t < 150 ? easeOut(t / 150) : 1 - easeOut((t - 150) / 400);
    const f = env.det && env.det.face;
    const cx = f ? f.box.x + f.box.w / 2 : 0.5, cy = f ? f.box.y + f.box.h / 2 : 0.45;
    return { cx, cy, scale: 1 + ((this.r.punchScale ?? 1.15) - 1) * k };
  }

  renderGL(g, env) {
    const zoom = this.frameZoom(env);
    if (zoom) g.drawFrame({ zoom });

    const frame = this.clip && this.clip.frameAt(env.now);
    const t = env.now - this.startAt, left = this.endTime() - env.now;
    const sIn = easeOutBack(clamp01(t / 180)), sOut = clamp01(left / 200);
    const s = Math.min(sIn, 1) * sOut + (sIn > 1 ? sIn - 1 : 0);
    const hh = (this.r.size ?? 0.38), ar = frame ? this.clip.width / this.clip.height : 1;
    const hw = hh * ar / (env.w / env.h);
    const m = 0.035;
    const pos = this.r.position || 'bottom-right';
    const cx = pos.includes('left') ? m + hw / 2 : pos.includes('right') ? 1 - m - hw / 2 : 0.5;
    const cy = pos.includes('top') ? m * 1.6 + hh / 2 : 1 - m * 1.6 - hh / 2;
    const w = hw * s, h = hh * s;
    if (w <= 0.001) return;
    g.drawImage(shadow(), cx - w * 0.62, cy - h * 0.62, w * 1.24, h * 1.24, { alpha: sOut, key: 'clip-shadow', static: true });
    if (frame) g.drawImage(frame, cx - w / 2, cy - h / 2, w, h, { key: 'clip:' + this.def.id });
    else g.drawText(this.r.fallbackText || this.def.name, cx, cy, { size: 0.09 * s, fill: '#fff', stroke: '#000' });
    // caption, then caption2 from the punch moment on (e.g. "*click*" then "noice").
    const cap = this.r.caption2 && this.r.punchAt != null && t >= this.r.punchAt ? this.r.caption2 : this.r.caption;
    if (cap) {
      g.drawText(cap, cx, cy + h / 2 - 0.045 * s, {
        size: 0.06 * s, font: "'Segoe UI', Arial, sans-serif", weight: 700, italic: true, fill: '#fff', stroke: '#111', strokeWidth: 0.14,
      });
    }
  }
}
