// Owns the output canvas (#meet-memes-fx, read by the MAIN world each frame), the
// optionally mirrored "base" frame that effects and detection work from, the graphics
// backend (WebGL2, or Canvas2D if WebGL2 is missing or its context is lost), and the
// frame-time budget.
import { createGL } from './gl.js';
import { GLGraphics, Canvas2DGraphics } from './graphics.js';
import { FrameBudget } from './budget.js';

export class Compositor {
  constructor(root, { forceCanvas2D = false } = {}) {
    this.root = root;
    this.budget = new FrameBudget(8);
    this.baseCanvas = null;
    this.lost = false;
    this.init(forceCanvas2D);
  }

  init(force2D) {
    // The output canvas is always a plain 2D canvas: the MAIN world builds a VideoFrame
    // from it every frame, which is reliable for 2D canvases. The GPU renders offscreen
    // and is copied in at the end of each frame (one cheap GPU-side drawImage).
    if (!this.fx) {
      const fx = document.getElementById('meet-memes-fx') || document.createElement('canvas');
      fx.id = 'meet-memes-fx';
      fx.width = fx.height = 2;
      if (!fx.isConnected) this.root.appendChild(fx);
      this.fx = fx;
      this.fxCtx = fx.getContext('2d', { alpha: false });
    }

    let ctx = null;
    if (!force2D) {
      try {
        this.glCanvas = new OffscreenCanvas(2, 2);
        ctx = createGL(this.glCanvas);
      } catch (err) { console.warn('[meet-memes] WebGL2 init failed', err); }
    }
    if (ctx) {
      this.mode = 'gl';
      this.g = new GLGraphics(ctx);
      this.glCtx = ctx;
      this.glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; }, { once: true });
    } else {
      this.mode = '2d';
      this.g = new Canvas2DGraphics(this.fxCtx);
      this.glCtx = null;
      this.glCanvas = null;
    }
    this.root.dataset.gfx = this.mode;
  }

  // Debug/testing: simulate a lost GPU context.
  loseContext() {
    const ext = this.glCtx && this.glCtx.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext(); else this.lost = true;
  }

  get quality() { return this.budget.quality; }

  // The frame effects and detection should use: `src` itself, or a mirrored copy.
  frameFor(src, mirror) {
    if (!mirror) return src;
    const w = src.width, h = src.height;
    if (!this.baseCanvas) this.baseCanvas = new OffscreenCanvas(w, h);
    const b = this.baseCanvas;
    if (b.width !== w || b.height !== h) { b.width = w; b.height = h; }
    const c = b.getContext('2d', { alpha: false });
    c.setTransform(-1, 0, 0, 1, w, 0);
    c.drawImage(src, 0, 0, w, h);
    c.setTransform(1, 0, 0, 1, 0, 0);
    return b;
  }

  // Starts composing a frame; returns the graphics API. `frame` comes from frameFor().
  begin(frame, { now, mask }) {
    if (this.lost) {
      this.lost = false;
      console.warn('[meet-memes] GPU context lost; using the 2D renderer for this session');
      this.init(true);
    }
    const w = frame.width, h = frame.height;
    if (this.fx.width !== w || this.fx.height !== h) { this.fx.width = w; this.fx.height = h; }
    if (this.glCanvas && (this.glCanvas.width !== w || this.glCanvas.height !== h)) { this.glCanvas.width = w; this.glCanvas.height = h; }
    this.t0 = performance.now();
    this.g.begin(frame, { w, h, now, mask });
    return this.g;
  }

  end() {
    if (this.mode === 'gl' && !this.lost) {
      const c = this.fxCtx;
      c.globalCompositeOperation = 'copy';
      c.globalAlpha = 1;
      c.filter = 'none';
      c.drawImage(this.glCanvas, 0, 0);
      c.globalCompositeOperation = 'source-over';
    }
    this.budget.record(performance.now() - this.t0);
  }
}
