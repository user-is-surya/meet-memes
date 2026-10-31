// Canvas helpers shared by the renderers.

const pool = new Map();

// Reusable offscreen canvases, keyed by purpose.
export function scratch(key, w, h) {
  let c = pool.get(key);
  if (!c) { c = new OffscreenCanvas(w, h); pool.set(key, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

export function fitRect(sw, sh, dw, dh, mode = 'contain') {
  const s = mode === 'cover' ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh);
  const w = sw * s, h = sh * s;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const easeOutBack = (t) => { const c = 1.7; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

// Meme-style caption: Impact, white fill, black outline, auto-shrinks to fit.
export function caption(ctx, text, x, y, size, opts = {}) {
  if (!text) return;
  const maxW = opts.maxWidth ?? ctx.canvas.width * 0.92;
  const font = opts.font || "Impact, 'Arial Black', 'Helvetica Neue', sans-serif";
  const weight = opts.weight ?? 900;
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  if (opts.letterSpacing) ctx.letterSpacing = `${opts.letterSpacing * size}px`;
  let w = ctx.measureText(text).width;
  if (w > maxW) { size = size * maxW / w; ctx.font = `${weight} ${size}px ${font}`; w = maxW; }
  ctx.textAlign = opts.align || 'center';
  // Keep centred captions fully on screen (only when drawing untransformed).
  const m = ctx.getTransform();
  if (ctx.textAlign === 'center' && m.a === 1 && m.d === 1 && m.b === 0 && m.c === 0) {
    const pad = size * 0.3, cw = ctx.canvas.width;
    x = Math.min(Math.max(x, w / 2 + pad), cw - w / 2 - pad);
  }
  ctx.textBaseline = opts.baseline || 'middle';
  ctx.lineJoin = 'round';
  if (opts.stroke !== false) {
    ctx.strokeStyle = opts.strokeColor || '#000';
    ctx.lineWidth = Math.max(2, size * 0.1);
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = opts.color || '#fff';
  if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = size * 0.4; }
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Face box in pixels, or a sensible centre box when no face is known.
export function faceRect(env) {
  const f = env.det && env.det.face;
  if (!f) return { x: env.w * 0.35, y: env.h * 0.2, w: env.w * 0.3, h: env.h * 0.45 };
  return { x: f.box.x * env.w, y: f.box.y * env.h, w: f.box.w * env.w, h: f.box.h * env.h };
}

// Where to place an item of size (iw, ih) for a named position.
export function anchor(position, iw, ih, env, info) {
  const { w, h } = env, m = Math.round(h * 0.04);
  switch (position) {
    case 'top': return { x: (w - iw) / 2, y: m };
    case 'bottom': return { x: (w - iw) / 2, y: h - ih - m };
    case 'top-left': return { x: m, y: m };
    case 'top-right': return { x: w - iw - m, y: m };
    case 'bottom-left': return { x: m, y: h - ih - m };
    case 'bottom-right': return { x: w - iw - m, y: h - ih - m };
    case 'face': {
      const f = faceRect(env);
      return { x: f.x + f.w / 2 - iw / 2, y: Math.max(m, f.y - ih * 0.9) };
    }
    case 'hand': {
      const p = info && info.hand;
      if (p) return { x: p.x * w - iw / 2, y: Math.max(m, p.y * h - ih * 1.05) };
      return { x: (w - iw) / 2, y: (h - ih) / 2 };
    }
    default: return { x: (w - iw) / 2, y: (h - ih) / 2 };
  }
}

// The person cut out of the frame with the segmentation mask (transparent elsewhere).
export function personLayer(src, mask, w, h) {
  const c = scratch('person', w, h);
  const p = c.getContext('2d');
  p.globalCompositeOperation = 'copy';
  p.drawImage(src, 0, 0, w, h);
  p.globalCompositeOperation = 'destination-in';
  p.drawImage(mask, 0, 0, w, h);
  p.globalCompositeOperation = 'source-over';
  return c;
}

const emojiCache = new Map();
export function emojiImage(emoji, size = 256) {
  const key = emoji + size;
  if (emojiCache.has(key)) return emojiCache.get(key);
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext('2d');
  g.font = `${size * 0.8}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, size / 2, size * 0.54);
  const img = { width: size, height: size, frameAt: () => c };
  emojiCache.set(key, img);
  return img;
}
