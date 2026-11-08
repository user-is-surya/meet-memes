// MAIN world. Makes Meet's self-view show exactly what others receive: any <video> whose
// stream contains a track we wrapped at the sender is switched to our output track.
// The srcObject getter keeps returning Meet's own stream so Meet's bookkeeping is unchanged.
// When our wrapper stops, the element gets Meet's stream back.
(() => {
  const MM = window.__meetMemes;
  if (!MM || MM.selfView || typeof HTMLMediaElement !== 'function') return;
  const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
  if (!desc || !desc.set) return;

  const shown = new Map(); // element -> { orig, swapped, wrapper }

  function wrapperFor(stream) {
    if (!stream || typeof stream.getVideoTracks !== 'function') return null;
    for (const t of stream.getVideoTracks()) {
      const w = MM.wrappers.get(t);
      if (w && w.kind === 'video' && !w.stopped) return w;
    }
    return null;
  }

  function restore(el) {
    const s = shown.get(el);
    if (!s) return;
    shown.delete(el);
    delete el.dataset.meetMemesSelf;
    desc.set.call(el, s.orig);
  }

  function consider(el, stream) {
    if (!(el instanceof HTMLVideoElement)) return;
    const prev = shown.get(el);
    if (prev && prev.orig === stream) return;
    if (prev) { shown.delete(el); delete el.dataset.meetMemesSelf; }
    const wrapper = wrapperFor(stream);
    if (!wrapper) return;
    try {
      const swapped = new MediaStream([wrapper.output, ...stream.getAudioTracks()]);
      desc.set.call(el, swapped);
      shown.set(el, { orig: stream, swapped, wrapper });
      el.dataset.meetMemesSelf = '1';
    } catch (err) {
      console.warn('[meet-memes] self-view swap failed', err);
    }
  }

  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      const s = shown.get(this);
      return s ? s.orig : desc.get.call(this);
    },
    set(stream) {
      if (shown.has(this)) { shown.delete(this); delete this.dataset.meetMemesSelf; }
      desc.set.call(this, stream);
      try { consider(this, stream); } catch { /* fail open */ }
    },
  });

  MM.selfView = {
    // The stream the element is really playing (tests/debug).
    current: (el) => desc.get.call(el),
    onWrapped() {
      for (const el of document.querySelectorAll('video')) {
        if (!shown.has(el)) consider(el, desc.get.call(el));
      }
    },
    onDropped(wrapper) {
      for (const [el, s] of [...shown]) if (s.wrapper === wrapper) restore(el);
    },
  };
})();
