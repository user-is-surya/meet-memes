// MAIN world. Hooks the point where Meet hands its final (post blur / virtual background)
// tracks to WebRTC, and swaps in our wrapped output. The sender's `track` getter keeps
// returning Meet's own track so Meet's bookkeeping is unaffected.
(() => {
  const MM = window.__meetMemes;
  if (!MM || MM.acquire || typeof RTCPeerConnection !== 'function' || typeof RTCRtpSender !== 'function') return;

  const senderSource = new WeakMap(); // sender -> source track Meet thinks it is sending

  MM.dropWrapper = (wrapper) => {
    if (MM.wrappers.get(wrapper.source) === wrapper) MM.wrappers.delete(wrapper.source);
    try { if (MM.selfView) MM.selfView.onDropped(wrapper); } catch { /* ignore */ }
    wrapper.stop();
  };

  // Returns the track to actually send for `track`, taking a reference on its wrapper.
  MM.acquire = (track) => {
    if (!track || MM.outputs.has(track)) return track;
    let wrapper = MM.wrappers.get(track);
    if (!wrapper) {
      if (track.kind === 'video') wrapper = MM.wrapVideo && MM.wrapVideo(track);
      else if (track.kind === 'audio') wrapper = MM.mixer && MM.mixer.wrap(track);
      if (!wrapper) return track;
      MM.wrappers.set(track, wrapper);
      MM.outputs.add(wrapper.output);
      if (wrapper.kind === 'video') {
        MM.stats.videoWrapped++;
        MM.stats.path = 'sender';
        try { if (MM.selfView) MM.selfView.onWrapped(wrapper); } catch { /* ignore */ }
      }
      else MM.stats.audioWrapped++;
    }
    wrapper.refs++;
    return wrapper.output;
  };

  MM.release = (track) => {
    const wrapper = track && MM.wrappers.get(track);
    if (!wrapper) return;
    wrapper.refs--;
    if (wrapper.refs <= 0) MM.dropWrapper(wrapper);
  };

  const PC = RTCPeerConnection.prototype;
  const origAddTrack = PC.addTrack;
  PC.addTrack = function addTrack(track, ...streams) {
    const out = MM.acquire(track);
    let sender;
    try {
      sender = origAddTrack.call(this, out, ...streams);
    } catch (err) {
      if (out !== track) MM.release(track);
      throw err;
    }
    if (out !== track) senderSource.set(sender, track);
    return sender;
  };

  const origAddTransceiver = PC.addTransceiver;
  if (origAddTransceiver) {
    PC.addTransceiver = function addTransceiver(trackOrKind, ...rest) {
      if (!trackOrKind || typeof trackOrKind === 'string') return origAddTransceiver.call(this, trackOrKind, ...rest);
      const out = MM.acquire(trackOrKind);
      let tr;
      try {
        tr = origAddTransceiver.call(this, out, ...rest);
      } catch (err) {
        if (out !== trackOrKind) MM.release(trackOrKind);
        throw err;
      }
      if (out !== trackOrKind) senderSource.set(tr.sender, trackOrKind);
      return tr;
    };
  }

  const SP = RTCRtpSender.prototype;
  const origReplace = SP.replaceTrack;
  SP.replaceTrack = async function replaceTrack(track) {
    const prev = senderSource.get(this);
    const out = MM.acquire(track);
    try {
      await origReplace.call(this, out);
    } catch (err) {
      if (out !== track) MM.release(track);
      throw err;
    }
    if (out !== track) senderSource.set(this, track); else senderSource.delete(this);
    if (prev) MM.release(prev);
    return undefined;
  };

  const desc = Object.getOwnPropertyDescriptor(SP, 'track');
  if (desc && desc.get) {
    Object.defineProperty(SP, 'track', {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        const real = desc.get.call(this);
        const src = senderSource.get(this);
        return src && real && MM.outputs.has(real) ? src : real;
      },
    });
  }
})();
