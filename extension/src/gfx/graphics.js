// The drawing API effects use. Two implementations with the same methods:
//   GLGraphics       WebGL2 (normal path)
//   Canvas2DGraphics 2D canvas fallback (no WebGL2 / context lost): same calls, simpler looks
// All positions and sizes are frame-normalized (0..1, y down) unless noted.
//
//   drawFrame({ mono, contrast, brightness, saturation, tint:[r,g,b,amt], zoom:{cx,cy,scale}, shake:{x,y,rot} })
//   drawImage(img, x, y, w, h, { alpha, rotate, blend, crop:[u,v,w,h] , key, static })
//   drawText(text, x, y, { size (fraction of frame height), font, weight, fill, stroke, strokeWidth, align, glow, italic, alpha, scale, rotate, blend })
//   drawPerson({ alpha, feather, tex })     the frame cut out by the segmentation mask
//   particles(ps, { blend, shape: 'soft'|'flake'|'spark', sizeScale })   ps = ParticleSystem (sizes in px at 720p)
//   pass(name, { uniforms, textures: { uName: source } , blend })   full-frame shader (see registerPass)
//   draw2D((ctx, w, h) => {})               escape hatch: draw with Canvas2D on a transparent overlay
import { FS_HEADER, NOISE_GLSL } from './gl.js';

const passes = new Map();

// fs: GLSL body (FS_HEADER + NOISE_GLSL are prepended). Built-in uniforms: uRes, uTime,
// uFrame (sampler, the base video frame), uMask (sampler, person mask; 0 if none), uHasMask.
// fallback2D(ctx, w, h, uniforms, g): optional Canvas2D approximation.
export function registerPass(name, fs, fallback2D = null) {
  passes.set(name, { fs, fallback2D });
}

const FRAME_FS = FS_HEADER + `
uniform sampler2D uTex;
uniform float uMono, uContrast, uBrightness, uSaturation;
uniform vec4 uTint;
uniform vec3 uZoom; // cx, cy, scale
uniform vec3 uShake; // x, y, rot
void main() {
  vec2 uv = vLocal;
  vec2 c = uZoom.xy;
  vec2 d = (uv - c);
  float r = uShake.z; float cs = cos(r), sn = sin(r);
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  uv = c + d / max(uZoom.z, 0.01) + uShake.xy;
  uv = clamp(uv, vec2(0.0), vec2(1.0));
  vec3 col = texture(uTex, uv).rgb;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col = mix(col, vec3(l), uMono);
  col = (col - 0.5) * uContrast + 0.5;
  col *= uBrightness;
  col = mix(col, uTint.rgb, uTint.a);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const IMAGE_FS = FS_HEADER + `
uniform sampler2D uTex;
uniform float uAlpha;
void main() { vec4 c = texture(uTex, vUv); outColor = vec4(c.rgb, c.a * uAlpha); }`;

const PERSON_FS = FS_HEADER + `
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform float uAlpha, uFeather;
void main() {
  float m = texture(uMask, vLocal).a;
  m = smoothstep(0.5 - uFeather, 0.5 + uFeather, m);
  outColor = vec4(texture(uTex, vLocal).rgb, m * uAlpha);
}`;

const PARTICLE_VS = `#version 300 es
in vec2 aPos;
in vec4 aInst;   // x, y, size(px@720p), rot
in vec4 aColor;
uniform vec2 uRes;
uniform float uSizeScale;
out vec2 vLocal;
out vec4 vColor;
void main() {
  float s = aInst.z * uSizeScale * uRes.y / 720.0;
  vec2 local = (aPos - 0.5) * s;
  float c = cos(aInst.w), sn = sin(aInst.w);
  local = vec2(c * local.x - sn * local.y, sn * local.x + c * local.y);
  vec2 pix = aInst.xy * uRes + local;
  gl_Position = vec4(pix.x / uRes.x * 2.0 - 1.0, 1.0 - pix.y / uRes.y * 2.0, 0.0, 1.0);
  vLocal = aPos;
  vColor = aColor;
}`;

const PARTICLE_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vColor;
out vec4 outColor;
uniform float uShape;
void main() {
  vec2 p = vLocal * 2.0 - 1.0;
  float a;
  if (uShape < 0.5) a = smoothstep(1.0, 0.0, length(p));                       // soft glow dot
  else if (uShape < 1.5) a = smoothstep(1.0, 0.75, max(abs(p.x), abs(p.y) * 1.35)); // flake
  else a = smoothstep(1.0, 0.0, length(p * vec2(1.0, 4.0)));                     // spark streak
  outColor = vec4(vColor.rgb, vColor.a * a);
}`;

const SHAPES = { soft: 0, flake: 1, spark: 2 };

// ---------------------------------------------------------------------------
export class GLGraphics {
  constructor(ctx) {
    this.c = ctx; // { gl, program, texture, blend, drawQuad, setUniforms, quad }
    this.instBuf = null;
    this.instCap = 0;
    this.text = new TextCache();
    this.overlay = null;
  }

  begin(frame, { w, h, now, mask }) {
    const { gl } = this.c;
    this.frame = frame; this.w = w; this.h = h; this.now = now; this.mask = mask || null;
    gl.viewport(0, 0, w, h);
    this.frameTex = null;
  }

  sampler(p, name, unit) { this.c.gl.uniform1i(p.loc(name), unit); }

  bindFrame(unit = 0) {
    if (!this.frameTex) this.frameTex = this.c.texture(this.frame, unit, { key: 'frame' });
    else this.c.texture(this.frame, unit, { key: 'frame', static: true });
  }

  base() { return { uRes: [this.w, this.h], uTime: this.now / 1000 }; }

  // The mask only changes when a detection lands; re-upload just then.
  bindMask(mask, unit) {
    const fresh = mask !== this.maskObj;
    this.c.texture(mask, unit, { key: 'mask', static: true, dirty: fresh });
    this.maskObj = mask;
  }

  drawFrame(o = {}) {
    const p = this.c.program('frame', FRAME_FS);
    this.c.blend('copy');
    this.bindFrame(0);
    this.c.gl.useProgram(p.prog);
    this.sampler(p, 'uTex', 0);
    const z = o.zoom || {}, s = o.shake || {};
    this.c.drawQuad(p, {
      ...this.base(), uRect: [0, 0, 1, 1],
      uMono: o.mono || 0, uContrast: o.contrast ?? 1, uBrightness: o.brightness ?? 1, uSaturation: o.saturation ?? 1,
      uTint: o.tint || [0, 0, 0, 0],
      uZoom: [z.cx ?? 0.5, z.cy ?? 0.5, z.scale ?? 1], uShake: [s.x || 0, s.y || 0, s.rot || 0],
    });
  }

  drawImage(img, x, y, w, h, o = {}) {
    if (!img) return;
    const p = this.c.program('image', IMAGE_FS);
    this.c.blend(o.blend);
    this.c.texture(img, 0, { key: o.key, static: o.static });
    this.c.gl.useProgram(p.prog);
    this.sampler(p, 'uTex', 0);
    this.c.drawQuad(p, { ...this.base(), uRect: [x, y, w, h], uRot: o.rotate || 0, uAlpha: o.alpha ?? 1, uCrop: o.crop || [0, 0, 1, 1] });
  }

  drawText(text, x, y, o = {}) {
    const item = this.text.get(text, o, this.h);
    if (!item) return;
    const sc = o.scale ?? 1;
    const w = item.canvas.width / this.w * sc, h = item.canvas.height / this.h * sc;
    const ax = o.align === 'left' ? 0 : o.align === 'right' ? 1 : 0.5;
    this.drawImage(item.canvas, x - w * ax, y - h / 2, w, h, { alpha: o.alpha, rotate: o.rotate, blend: o.blend, key: item.key, static: true });
  }

  drawPerson(o = {}) {
    const mask = o.mask || this.mask;
    if (!mask) return;
    const p = this.c.program('person', PERSON_FS);
    this.c.blend('normal');
    this.bindFrame(0);
    this.bindMask(mask, 1);
    this.c.gl.useProgram(p.prog);
    this.sampler(p, 'uTex', 0);
    this.sampler(p, 'uMask', 1);
    this.c.drawQuad(p, { ...this.base(), uRect: [0, 0, 1, 1], uAlpha: o.alpha ?? 1, uFeather: o.feather ?? 0.15 });
  }

  particles(ps, o = {}) {
    if (!ps || !ps.count) return;
    const { gl } = this.c;
    const p = this.c.program('particles', PARTICLE_FS, PARTICLE_VS);
    const n = ps.count;
    if (!this.instBuf || this.instCap < n) {
      this.instCap = Math.max(n, this.instCap * 2, 1024);
      this.instData = new Float32Array(this.instCap * 8);
      if (!this.instBuf) this.instBuf = gl.createBuffer();
      if (!this.vao) this.vao = gl.createVertexArray();
    }
    const d = this.instData;
    for (let i = 0, j = 0; i < n; i++, j += 8) {
      const life = ps.life[i], fade = Math.min(1, (life - ps.age[i]) / Math.min(0.5, life * 0.4));
      d[j] = ps.x[i]; d[j + 1] = ps.y[i]; d[j + 2] = ps.size[i]; d[j + 3] = ps.rot[i];
      d[j + 4] = ps.r[i]; d[j + 5] = ps.g[i]; d[j + 6] = ps.b[i]; d[j + 7] = ps.a[i] * Math.max(0, fade);
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.c.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 8), gl.STREAM_DRAW);
    const aInst = gl.getAttribLocation(p.prog, 'aInst'), aColor = gl.getAttribLocation(p.prog, 'aColor');
    gl.enableVertexAttribArray(aInst);
    gl.vertexAttribPointer(aInst, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(aInst, 1);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(aColor, 1);
    gl.useProgram(p.prog);
    this.c.setUniforms(p, { uRes: [this.w, this.h], uSizeScale: o.sizeScale ?? 1, uShape: SHAPES[o.shape || 'soft'] });
    this.c.blend(o.blend || 'normal');
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.vertexAttribDivisor(aInst, 0);
    gl.vertexAttribDivisor(aColor, 0);
    gl.disableVertexAttribArray(aInst);
    gl.disableVertexAttribArray(aColor);
    gl.bindVertexArray(null);
  }

  pass(name, o = {}) {
    const def = passes.get(name);
    if (!def) throw new Error('unknown pass ' + name);
    const p = this.c.program('pass:' + name, FS_HEADER + NOISE_GLSL + `
uniform sampler2D uFrame;
uniform sampler2D uMask;
uniform float uHasMask;
` + def.fs);
    const { gl } = this.c;
    this.c.blend(o.blend || 'normal');
    this.bindFrame(0);
    gl.useProgram(p.prog);
    this.sampler(p, 'uFrame', 0);
    let unit = 1;
    const mask = o.mask || this.mask;
    if (mask) { this.bindMask(mask, unit); this.sampler(p, 'uMask', unit); unit++; }
    for (const [uName, src] of Object.entries(o.textures || {})) {
      if (!src) continue;
      this.c.texture(src, unit, { key: 'pass:' + name + ':' + uName, dirty: true });
      this.sampler(p, uName, unit);
      unit++;
    }
    this.c.drawQuad(p, { ...this.base(), uRect: [0, 0, 1, 1], uHasMask: mask ? 1 : 0, ...(o.uniforms || {}) });
  }

  draw2D(fn) {
    const c = this.overlay = ensureCanvas(this.overlay, this.w, this.h);
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.clearRect(0, 0, this.w, this.h);
    fn(ctx, this.w, this.h);
    this.drawImage(c, 0, 0, 1, 1, { key: 'overlay2d' });
  }
}

// ---------------------------------------------------------------------------
export class Canvas2DGraphics {
  constructor(ctx) {
    this.ctx = ctx;
    this.text = new TextCache();
  }

  begin(frame, { w, h, now, mask }) {
    Object.assign(this, { frame, w, h, now, mask: mask || null });
  }

  drawFrame(o = {}) {
    const { ctx, w, h } = this;
    const f = [];
    if (o.mono) f.push(`grayscale(${o.mono})`);
    if (o.saturation != null && o.saturation !== 1) f.push(`saturate(${o.saturation})`);
    if (o.contrast != null && o.contrast !== 1) f.push(`contrast(${o.contrast})`);
    if (o.brightness != null && o.brightness !== 1) f.push(`brightness(${o.brightness})`);
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.filter = f.join(' ') || 'none';
    const z = o.zoom || {}, s = o.shake || {};
    const sc = z.scale ?? 1, cx = (z.cx ?? 0.5) * w, cy = (z.cy ?? 0.5) * h;
    ctx.translate(cx, cy);
    ctx.rotate(-(s.rot || 0));
    ctx.scale(sc, sc);
    ctx.translate(-cx - (s.x || 0) * w, -cy - (s.y || 0) * h);
    ctx.drawImage(this.frame, 0, 0, w, h);
    ctx.restore();
    if (o.tint && o.tint[3]) {
      ctx.save();
      ctx.globalAlpha = o.tint[3];
      ctx.fillStyle = `rgb(${o.tint[0] * 255},${o.tint[1] * 255},${o.tint[2] * 255})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  drawImage(img, x, y, w, h, o = {}) {
    if (!img) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.globalCompositeOperation = o.blend === 'add' ? 'lighter' : o.blend === 'screen' ? 'screen' : o.blend === 'multiply' ? 'multiply' : 'source-over';
    const px = x * this.w, py = y * this.h, pw = w * this.w, ph = h * this.h;
    ctx.translate(px + pw / 2, py + ph / 2);
    if (o.rotate) ctx.rotate(o.rotate);
    if (o.crop) {
      const iw = img.displayWidth || img.width, ih = img.displayHeight || img.height;
      ctx.drawImage(img, o.crop[0] * iw, o.crop[1] * ih, o.crop[2] * iw, o.crop[3] * ih, -pw / 2, -ph / 2, pw, ph);
    } else {
      ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
    }
    ctx.restore();
  }

  drawText(text, x, y, o = {}) {
    const item = this.text.get(text, o, this.h);
    if (!item) return;
    const sc = o.scale ?? 1;
    const w = item.canvas.width / this.w * sc, h = item.canvas.height / this.h * sc;
    const ax = o.align === 'left' ? 0 : o.align === 'right' ? 1 : 0.5;
    this.drawImage(item.canvas, x - w * ax, y - h / 2, w, h, o);
  }

  drawPerson(o = {}) {
    const mask = o.mask || this.mask;
    if (!mask) return;
    const c = this.personCanvas = ensureCanvas(this.personCanvas, this.w, this.h);
    const p = c.getContext('2d');
    p.globalCompositeOperation = 'copy';
    p.drawImage(this.frame, 0, 0, this.w, this.h);
    p.globalCompositeOperation = 'destination-in';
    p.drawImage(mask, 0, 0, this.w, this.h);
    this.drawImage(c, 0, 0, 1, 1, { alpha: o.alpha });
  }

  particles(ps, o = {}) {
    if (!ps || !ps.count) return;
    const { ctx, w, h } = this;
    const n = Math.min(ps.count, 2500), k = (o.sizeScale ?? 1) * h / 720;
    ctx.save();
    ctx.globalCompositeOperation = o.blend === 'add' ? 'lighter' : 'source-over';
    for (let i = 0; i < n; i++) {
      const life = ps.life[i], fade = Math.min(1, (life - ps.age[i]) / Math.min(0.5, life * 0.4));
      ctx.globalAlpha = Math.max(0, ps.a[i] * fade);
      ctx.fillStyle = `rgb(${ps.r[i] * 255 | 0},${ps.g[i] * 255 | 0},${ps.b[i] * 255 | 0})`;
      const s = ps.size[i] * k;
      ctx.fillRect(ps.x[i] * w - s / 2, ps.y[i] * h - s / 2, s, s);
    }
    ctx.restore();
  }

  pass(name, o = {}) {
    const def = passes.get(name);
    if (def && def.fallback2D) {
      this.ctx.save();
      def.fallback2D(this.ctx, this.w, this.h, o.uniforms || {}, this, o);
      this.ctx.restore();
    }
  }

  draw2D(fn) {
    this.ctx.save();
    fn(this.ctx, this.w, this.h);
    this.ctx.restore();
  }
}

// ---------------------------------------------------------------------------
function ensureCanvas(c, w, h) {
  if (!c) c = new OffscreenCanvas(w, h);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

// Renders styled text into small cached canvases (LRU).
class TextCache {
  constructor() { this.map = new Map(); }

  get(text, o, frameH) {
    if (!text) return null;
    const size = Math.max(6, Math.round((o.size ?? 0.08) * frameH));
    const font = o.font || "Impact, 'Anton', 'Arial Black', sans-serif";
    const weight = o.weight ?? 900;
    const style = o.italic ? 'italic ' : '';
    const key = [text, size, font, weight, style, o.fill, o.stroke, o.strokeWidth, o.glow, o.glowColor, o.letterSpacing].join('|');
    let item = this.map.get(key);
    if (item) { this.map.delete(key); this.map.set(key, item); return item; }

    const pad = Math.ceil(size * (0.25 + (o.glow || 0)));
    const m = new OffscreenCanvas(4, 4).getContext('2d');
    m.font = `${style}${weight} ${size}px ${font}`;
    if (o.letterSpacing) m.letterSpacing = `${o.letterSpacing * size}px`;
    const tw = Math.ceil(m.measureText(text).width);
    const c = new OffscreenCanvas(tw + pad * 2, Math.ceil(size * 1.3) + pad * 2);
    const g = c.getContext('2d');
    g.font = m.font;
    if (o.letterSpacing) g.letterSpacing = m.letterSpacing;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const cx = c.width / 2, cy = c.height / 2 + size * 0.04;
    if (o.glow) {
      g.shadowColor = o.glowColor || o.fill || '#fff';
      g.shadowBlur = size * o.glow;
      g.fillStyle = o.fill || '#fff';
      g.fillText(text, cx, cy);
      g.shadowBlur = 0;
    }
    if (o.stroke) {
      g.strokeStyle = o.stroke;
      g.lineWidth = Math.max(2, size * (o.strokeWidth ?? 0.12));
      g.strokeText(text, cx, cy);
    }
    g.fillStyle = o.fill || '#fff';
    g.fillText(text, cx, cy);
    item = { canvas: c, key: 'text:' + key };
    this.map.set(key, item);
    if (this.map.size > 64) this.map.delete(this.map.keys().next().value);
    return item;
  }
}
