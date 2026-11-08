// MAIN world, loaded last. The real work happens at the RTCRtpSender (main/sender-hook.js),
// after Meet's own background blur / replacement. This file keeps a getUserMedia wrap as a
// fallback: its output only processes frames while no sender-level wrapper exists (for
// example when Meet sends the camera track straight through with no effect applied, or if
// the sender hook can't see Meet's track at all). Otherwise it passes frames through.
(() => {
  const MM = window.__meetMemes;
  const md = navigator.mediaDevices;
  if (!MM || MM.gumHooked || !md || typeof md.getUserMedia !== 'function' || !MM.wrapVideo) return;
  MM.gumHooked = true;

  const senderVideoActive = () => {
    for (const w of MM.wrappers.values()) if (w.kind === 'video' && !w.stopped) return true;
    return false;
  };
  const gate = () => {
    if (senderVideoActive()) return false;
    MM.stats.path = 'gum';
    return true;
  };

  const origGetUserMedia = md.getUserMedia.bind(md);
  md.getUserMedia = async function getUserMedia(constraints) {
    const stream = await origGetUserMedia(constraints);
    try {
      const [cam] = stream.getVideoTracks();
      if (!cam) return stream;
      const wrapper = MM.wrapVideo(cam, { gate, ownsSource: true });
      if (!wrapper) return stream;
      MM.outputs.add(wrapper.output);
      return new MediaStream([wrapper.output, ...stream.getAudioTracks()]);
    } catch (err) {
      console.warn('[meet-memes] could not wrap camera, using raw stream', err);
      return stream;
    }
  };
})();
