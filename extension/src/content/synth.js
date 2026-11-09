// Small procedural sounds (no audio files needed), rendered as mono 48 kHz PCM.
export const RATE = 48000;
export const SYNTHS = ['boom', 'whoosh', 'click', 'hum', 'drone', 'blast', 'portal'];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
}

function normalize(pcm, peak = 0.9) {
  let m = 0; for (const v of pcm) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i] / m * peak;
  return pcm;
}

const builders = {
  // Deep cinematic boom: a falling sub sine plus a short filtered noise hit.
  boom() {
    const n = Math.round(1.6 * RATE), out = new Float32Array(n), r = rng(7);
    let phase = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const f = 28 + 22 * Math.exp(-t * 3);
      phase += 2 * Math.PI * f / RATE;
      const body = Math.sin(phase) * Math.exp(-t * 2.2) * Math.min(1, t * 200);
      lp += (r() - lp) * 0.08;
      const hit = lp * 2.5 * Math.exp(-t * 14);
      out[i] = body + hit + 0.35 * Math.sin(phase * 2) * Math.exp(-t * 4);
    }
    return normalize(out, 0.95);
  },
  // Airy whoosh for throws.
  whoosh() {
    const n = Math.round(0.6 * RATE), out = new Float32Array(n), r = rng(3);
    let lp = 0, bp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const k = 0.02 + 0.25 * Math.sin(Math.PI * t);
      lp += (r() - lp) * k; bp = lp - bp * 0.5;
      out[i] = bp * Math.sin(Math.PI * t) ** 2;
    }
    return normalize(out, 0.6);
  },
  // Spell shield / orb: a warm magical hum. 2 s, loops seamlessly (whole cycles only).
  hum() {
    const n = 2 * RATE, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / RATE, w = 2 * Math.PI * t;
      const trem = 0.75 + 0.25 * Math.sin(w * 4);
      out[i] = trem * (Math.sin(w * 110) * 0.5 + Math.sin(w * 165) * 0.3 + Math.sin(w * 220) * 0.12)
        + Math.sin(w * 880) * 0.04 * (0.5 + 0.5 * Math.sin(w * 0.5));
    }
    return normalize(out, 0.5);
  },
  // Spell channel: a deep, shimmering drone. 2 s, loops seamlessly.
  drone() {
    const n = 2 * RATE, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / RATE, w = 2 * Math.PI * t;
      const swell = 0.7 + 0.3 * Math.sin(w * 0.5);
      out[i] = swell * (Math.sin(w * 55) * 0.5 + Math.sin(w * 82.5) * 0.35 + Math.sin(w * 110 + Math.sin(w * 3) * 2) * 0.2)
        + Math.sin(w * 1320) * 0.03 * (0.5 + 0.5 * Math.sin(w * 1.5));
    }
    return normalize(out, 0.5);
  },
  // Spell blast: a rising zap into a boom.
  blast() {
    const n = Math.round(1.1 * RATE), out = new Float32Array(n), r = rng(19);
    let ph = 0, sub = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const f = 300 + 2400 * Math.min(1, t / 0.25);
      ph += 2 * Math.PI * f / RATE;
      const zap = Math.sin(ph) * (t < 0.3 ? Math.min(1, t * 40) * 0.35 : 0) * Math.exp(-Math.max(0, t - 0.2) * 30);
      sub += 2 * Math.PI * (45 + 30 * Math.exp(-(t - 0.28) * 6)) / RATE;
      const boom = t > 0.28 ? Math.sin(sub) * Math.exp(-(t - 0.28) * 3.5) : 0;
      lp += (r() - lp) * 0.15;
      const hit = t > 0.28 ? lp * 2 * Math.exp(-(t - 0.28) * 12) : 0;
      out[i] = zap + boom + hit;
    }
    return normalize(out, 0.9);
  },
  // Spell portal: sparks crackling round a ring, with a rising shimmer.
  portal() {
    const n = Math.round(1.4 * RATE), out = new Float32Array(n), r = rng(23);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      ph += 2 * Math.PI * (500 + 700 * t) / RATE;
      const env = Math.min(1, t * 8) * Math.exp(-t * 1.6);
      const crack = (r() + 1) / 2 > 0.985 ? r() * 0.9 : 0;
      out[i] = env * (Math.sin(ph) * 0.15 + crack + r() * 0.05);
    }
    return normalize(out, 0.7);
  },
  // Tongue-click-like tick.
  click() {
    const n = Math.round(0.06 * RATE), out = new Float32Array(n), r = rng(11);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      out[i] = (Math.sin(2 * Math.PI * 1800 * t) * 0.6 + r() * 0.4) * Math.exp(-t * 120);
    }
    return normalize(out, 0.8);
  },
};

export function synth(name) {
  const b = builders[name];
  return b ? b() : null;
}
