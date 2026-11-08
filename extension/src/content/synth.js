// Small procedural sounds (no audio files needed), rendered as mono 48 kHz PCM.
export const RATE = 48000;
export const SYNTHS = ['boom', 'whoosh', 'click'];

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
