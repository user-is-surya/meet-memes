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

  // Fake bad connection, audio side. Alternates clear stretches with dropouts (silence),
  // robotic packet-loss buzz (a 15 ms grain repeated, decaying) and muffled low-bitrate
  // audio. burst(ms) forces silence while the video side shows a long freeze.
  const bc = { on: false, r: Math.random, seg: 'clear', segUntil: 0, burstUntil: -Infinity, grain: null, rep: 0, lp: 0 };
  const seeded = (seed) => {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  };
  const SEGS = { clear: [200, 1000], drop: [80, 600], robot: [120, 500], lofi: [300, 900] };
  MM.badconn = {
    set({ on, seed, now = performance.now() } = {}) {
      bc.on = !!on;
      if (!bc.on) return;
      bc.r = seed !== undefined ? seeded(seed) : Math.random;
      bc.seg = 'clear';
      bc.segUntil = now + 400 + bc.r() * 600;
      bc.burstUntil = -Infinity;
    },
    burst(ms, now = performance.now()) { if (bc.on) bc.burstUntil = Math.max(bc.burstUntil, now + ms); },
    get on() { return bc.on; },
    // planes: Float32Array per channel, modified in place. Returns true if anything changed.
    degrade(planes, rate, now) {
      if (!bc.on || !planes.length) return false;
      const n = planes[0].length;
      if (now < bc.burstUntil) { for (const p of planes) p.fill(0); return true; }
      if (now >= bc.segUntil) {
        if (bc.seg !== 'clear') bc.seg = 'clear';
        else { const x = bc.r(); bc.seg = x < 0.5 ? 'drop' : x < 0.8 ? 'robot' : 'lofi'; }
        const [lo, hi] = SEGS[bc.seg];
        bc.segUntil = now + lo + bc.r() * (hi - lo);
        if (bc.seg === 'robot') {
          bc.grain = planes[0].slice(0, Math.min(n, Math.round(rate * 0.015)));
          bc.rep = 0;
        }
      }
      if (bc.seg === 'clear') return false;
      if (bc.seg === 'drop') { for (const p of planes) p.fill(0); return true; }
      if (bc.seg === 'robot' && bc.grain && bc.grain.length) {
        const g = bc.grain, len = g.length;
        for (let i = 0; i < n; i++) {
          const k = bc.rep + i;
          const s = g[k % len] * 0.92 ** Math.floor(k / len);
          for (const p of planes) p[i] = s;
        }
        bc.rep += n;
        return true;
      }
      // lofi: sample-and-hold every 4th sample, one-pole low-pass, a bit quieter.
      let lp = bc.lp, held = 0;
      for (let i = 0; i < n; i++) {
        if (i % 4 === 0) held = planes[0][i];
        lp += (held - lp) * 0.35;
        const s = lp * 0.85;
        for (const p of planes) p[i] = s;
      }
      bc.lp = lp;
      return true;
    },
  };

  function mixChunk(data, source) {
    if (!voices.length && !bc.on) return data;
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
    MM.badconn.degrade(planes, rate, performance.now());
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
      else if (m.__mm === 'badconn') MM.badconn.set({ on: m.on });
      else if (m.__mm === 'badconn-burst') MM.badconn.burst(m.ms || 0);
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
