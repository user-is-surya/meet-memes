// MAIN world. Mixes meme sounds into the microphone track Meet sends, chunk by chunk
// (audio insertable streams), so there is no AudioContext that autoplay rules could
// suspend and silence the mic. Sounds are only mixed while Meet's mic track is enabled
// and live (never while muted). Sound data arrives from the content script by
// window.postMessage: { __mm: 'sfx-load', key, pcm: Float32Array (mono), rate },
// { __mm: 'sfx-play', key, id, volume, loop }, { __mm: 'sfx-stop', id | all }.
(() => {
  const MM = window.__meetMemes;
  if (!MM || MM.mixer) return;

  const buffers = new Map(); // key -> { pcm, rate }
  const voices = [];
  let nextId = 1;

  MM.sfxAllowed = (src) => !!src && src.enabled !== false && !src.muted && src.readyState === 'live';

  // planes: Float32Array per channel (modified in place). Returns true if anything was mixed.
  MM.mixInto = (planes, sampleRate, list, volume) => {
    if (!list.length || !planes.length) return false;
    const n = planes[0].length;
    for (let vi = list.length - 1; vi >= 0; vi--) {
      const v = list[vi];
      const step = v.rate / sampleRate;
      const len = v.pcm.length;
      const gain = v.volume * volume;
      let pos = v.pos;
      let ended = false;
      for (let i = 0; i < n; i++) {
        if (pos >= len) {
          if (v.loop) pos -= len; else { ended = true; break; }
        }
        const i0 = pos | 0, frac = pos - i0;
        const a = v.pcm[i0], b = i0 + 1 < len ? v.pcm[i0 + 1] : (v.loop ? v.pcm[0] : a);
        const s = (a + (b - a) * frac) * gain;
        for (let c = 0; c < planes.length; c++) planes[c][i] += s;
        pos += step;
      }
      v.pos = v.loop && pos >= len ? pos % len : pos;
      if (ended || (!v.loop && v.pos >= len)) list.splice(vi, 1);
    }
    for (const p of planes) for (let i = 0; i < n; i++) {
      if (p[i] > 1) p[i] = 1; else if (p[i] < -1) p[i] = -1;
    }
    return true;
  };

  function mixChunk(data, source) {
    if (!voices.length) return data;
    const allowed = MM.sfxAllowed(source);
    const ch = data.numberOfChannels, n = data.numberOfFrames, rate = data.sampleRate;
    if (!allowed) {
      // Keep sounds in time while muted, but send nothing.
      for (let vi = voices.length - 1; vi >= 0; vi--) {
        const v = voices[vi];
        v.pos += n * v.rate / rate;
        if (v.pos >= v.pcm.length) { if (v.loop) v.pos %= v.pcm.length; else voices.splice(vi, 1); }
      }
      return data;
    }
    const buf = new Float32Array(ch * n);
    const planes = [];
    for (let c = 0; c < ch; c++) {
      const p = buf.subarray(c * n, (c + 1) * n);
      data.copyTo(p, { planeIndex: c, format: 'f32-planar' });
      planes.push(p);
    }
    MM.mixInto(planes, rate, voices, MM.sfxVolume ?? 1);
    const out = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: ch, timestamp: data.timestamp, data: buf });
    data.close();
    return out;
  }

  MM.mixer = {
    wrap(source) {
      if (typeof MediaStreamTrackProcessor !== 'function' || typeof MediaStreamTrackGenerator !== 'function') return null;
      try {
        const processor = new MediaStreamTrackProcessor({ track: source });
        const output = new MediaStreamTrackGenerator({ kind: 'audio' });
        const abort = new AbortController();
        const transform = new TransformStream({
          transform(data, controller) {
            let out = data;
            try { out = mixChunk(data, source); } catch (err) { out = data; }
            controller.enqueue(out);
          },
        });
        processor.readable.pipeThrough(transform).pipeTo(output.writable, { signal: abort.signal }).catch(() => {});
        const wrapper = {
          source, output, kind: 'audio', refs: 0, stopped: false,
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
        output.getSettings = () => source.getSettings();
        output.getConstraints = () => source.getConstraints();
        output.applyConstraints = (c) => source.applyConstraints(c);
        return wrapper;
      } catch (err) {
        console.warn('[meet-memes] could not wrap audio track', err);
        return null;
      }
    },
  };

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data || typeof e.data.__mm !== 'string') return;
      const m = e.data;
      if (m.__mm === 'sfx-load' && m.pcm) buffers.set(m.key, { pcm: m.pcm, rate: m.rate || 48000 });
      else if (m.__mm === 'sfx-volume') MM.sfxVolume = m.volume;
      else if (m.__mm === 'sfx-play') {
        const b = buffers.get(m.key);
        if (!b) return;
        if (voices.length > 8) voices.shift();
        voices.push({ id: m.id ?? nextId++, pcm: b.pcm, rate: b.rate, pos: 0, volume: m.volume ?? 1, loop: !!m.loop });
      } else if (m.__mm === 'sfx-stop') {
        for (let i = voices.length - 1; i >= 0; i--) if (m.all || voices[i].id === m.id) voices.splice(i, 1);
      }
    });
  }
})();
