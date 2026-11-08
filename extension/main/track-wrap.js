// MAIN world. Wraps a video track: source -> processor -> MM.processFrame -> generator.
// Returns null (caller passes the source through) when insertable streams are missing
// or anything throws while setting up.
(() => {
  const MM = window.__meetMemes;
  if (!MM || MM.wrapVideo) return;

  // opts.gate(): process frames only while it returns true (getUserMedia fallback).
  // opts.ownsSource: stopping the output also stops the camera (getUserMedia path,
  // where Meet holds our output and never sees the real camera track).
  MM.wrapVideo = (source, opts = {}) => {
    if (typeof MediaStreamTrackProcessor !== 'function' || typeof MediaStreamTrackGenerator !== 'function') return null;
    try {
      const processor = new MediaStreamTrackProcessor({ track: source });
      const output = new MediaStreamTrackGenerator({ kind: 'video' });
      const abort = new AbortController();
      const transform = new TransformStream({
        transform(frame, controller) {
          let out = frame;
          try {
            if (MM.processFrame && (!opts.gate || opts.gate())) out = MM.processFrame(frame, source);
          } catch { out = frame; }
          controller.enqueue(out);
        },
      });
      processor.readable.pipeThrough(transform).pipeTo(output.writable, { signal: abort.signal }).catch(() => {});

      const wrapper = {
        source, output, kind: 'video', refs: 0, stopped: false,
        stop() {
          if (wrapper.stopped) return;
          wrapper.stopped = true;
          abort.abort();
          try { output.stop(); } catch { /* ignore */ }
          source.removeEventListener('ended', onEnded);
          output.dispatchEvent(new Event('ended'));
        },
      };
      const onEnded = () => (MM.dropWrapper ? MM.dropWrapper(wrapper) : wrapper.stop());
      source.addEventListener('ended', onEnded);
      if (opts.ownsSource) {
        const origStop = output.stop.bind(output);
        output.stop = () => { origStop(); source.stop(); };
        try { Object.defineProperty(output, 'label', { get: () => source.label }); } catch { /* ignore */ }
      }

      // Look like the camera to anyone who inspects the sender's track.
      output.getSettings = () => source.getSettings();
      output.getCapabilities = () => (source.getCapabilities ? source.getCapabilities() : {});
      output.getConstraints = () => source.getConstraints();
      output.applyConstraints = (c) => source.applyConstraints(c);
      return wrapper;
    } catch (err) {
      console.warn('[meet-memes] could not wrap video track', err);
      return null;
    }
  };
})();
