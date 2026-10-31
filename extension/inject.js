// Runs in Meet's own JS world (MAIN) at document_start.
// Wraps getUserMedia so the camera track Meet receives is our processed track.
// Each camera frame is drawn into a shared <canvas id="meet-memes-src">, then a
// synchronous DOM event lets the content script (isolated world) compose effects
// into <canvas id="meet-memes-fx">. If it did, we send fx; otherwise the raw frame.
// Anything unexpected falls back to the untouched camera stream.
(() => {
  if (window.__meetMemesInjected) return;
  window.__meetMemesInjected = true;

  const md = navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== 'function') return;
  if (typeof MediaStreamTrackProcessor !== 'function' || typeof MediaStreamTrackGenerator !== 'function') {
    console.warn('[meet-memes] Insertable streams unavailable; effects disabled.');
    return;
  }

  const ROOT_ID = 'meet-memes-root';
  const origGetUserMedia = md.getUserMedia.bind(md);

  const byId = (id) => document.getElementById(id);

  function wrapTrack(camTrack) {
    const processor = new MediaStreamTrackProcessor({ track: camTrack });
    const generator = new MediaStreamTrackGenerator({ kind: 'video' });
    let root = null, src = null, fx = null, sctx = null;

    const transform = new TransformStream({
      transform(frame, controller) {
        try {
          if (!root || !root.isConnected) root = byId(ROOT_ID);
          const mode = root && root.dataset.mode;
          if (!mode || mode === 'off') return controller.enqueue(frame);

          if (!src || !src.isConnected) {
            src = byId('meet-memes-src');
            fx = byId('meet-memes-fx');
            sctx = src && src.getContext('2d', { alpha: false });
          }
          if (!src || !fx || !sctx) return controller.enqueue(frame);

          const w = frame.displayWidth, h = frame.displayHeight;
          if (src.width !== w || src.height !== h) { src.width = w; src.height = h; }
          sctx.drawImage(frame, 0, 0, w, h);

          root.dataset.used = '0';
          src.dispatchEvent(new Event('meet-memes-frame'));

          if (mode === 'everyone' && root.dataset.used === '1' && fx.width === w && fx.height === h) {
            const out = new VideoFrame(fx, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
            frame.close();
            controller.enqueue(out);
          } else {
            controller.enqueue(frame);
          }
        } catch (err) {
          console.warn('[meet-memes] frame error', err);
          try { controller.enqueue(frame); } catch { /* frame already closed */ }
        }
      },
    });

    processor.readable
      .pipeThrough(transform)
      .pipeTo(generator.writable)
      .catch(() => {})
      .finally(() => camTrack.stop());

    // Make the generator look like the real camera to Meet.
    const origStop = generator.stop.bind(generator);
    generator.stop = () => { origStop(); camTrack.stop(); };
    generator.getSettings = () => camTrack.getSettings();
    generator.getCapabilities = () => camTrack.getCapabilities();
    generator.getConstraints = () => camTrack.getConstraints();
    generator.applyConstraints = (c) => camTrack.applyConstraints(c);
    try { Object.defineProperty(generator, 'label', { get: () => camTrack.label }); } catch { /* ignore */ }
    camTrack.addEventListener('ended', () => generator.dispatchEvent(new Event('ended')));
    return generator;
  }

  md.getUserMedia = async function getUserMedia(constraints) {
    const stream = await origGetUserMedia(constraints);
    try {
      const [cam] = stream.getVideoTracks();
      if (!cam) return stream;
      const wrapped = wrapTrack(cam);
      return new MediaStream([wrapped, ...stream.getAudioTracks()]);
    } catch (err) {
      console.warn('[meet-memes] could not wrap camera, using raw stream', err);
      return stream;
    }
  };
})();
