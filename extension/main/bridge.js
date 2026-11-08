// MAIN world, loaded first. Creates the shared namespace and the per-frame handoff
// to the content script (isolated world):
//   1. draw the frame into <canvas id="meet-memes-src">
//   2. fire a synchronous 'meet-memes-frame' event; the content script composes into
//      <canvas id="meet-memes-fx"> and sets root.dataset.used = '1' if it drew anything
//   3. send fx as the new frame, otherwise the untouched one
// Any error falls back to the untouched frame.
(() => {
  if (window.__meetMemes) return;
  const ROOT_ID = 'meet-memes-root';
  const byId = (id) => document.getElementById(id);

  const MM = window.__meetMemes = {
    wrappers: new Map(), // source track -> wrapper
    outputs: new WeakSet(), // tracks we created (never wrap these)
    stats: { path: 'none', videoWrapped: 0, audioWrapped: 0, framesOut: 0, lastFrameAt: 0 },
  };

  let root = null, src = null, fx = null, sctx = null;

  // Returns the frame to send. Takes ownership of `frame` (closes it if replaced).
  MM.processFrame = (frame, source) => {
    try {
      if (!root || !root.isConnected) root = byId(ROOT_ID);
      if (!root) return frame;
      root.dataset.sourceEnabled = String(source.enabled !== false);
      const mode = root.dataset.mode;
      if (!mode || mode === 'off' || source.enabled === false) return frame;

      if (!src || !src.isConnected) {
        src = byId('meet-memes-src');
        fx = byId('meet-memes-fx');
        sctx = src && src.getContext('2d', { alpha: false });
      }
      if (!src || !fx || !sctx) return frame;

      const w = frame.displayWidth, h = frame.displayHeight;
      if (src.width !== w || src.height !== h) { src.width = w; src.height = h; }
      sctx.drawImage(frame, 0, 0, w, h);

      root.dataset.used = '0';
      src.dispatchEvent(new Event('meet-memes-frame'));

      if (mode === 'everyone' && root.dataset.used === '1' && fx.width === w && fx.height === h) {
        const out = new VideoFrame(fx, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
        frame.close();
        MM.stats.framesOut++;
        MM.stats.lastFrameAt = performance.now();
        return out;
      }
      return frame;
    } catch (err) {
      console.warn('[meet-memes] frame error', err);
      return frame;
    }
  };
})();
