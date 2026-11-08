// Meme sounds. Decodes each sound once (to mono 48 kHz), hands the samples to the MAIN
// world mixer (main/audio-mix.js) which mixes them into the mic track Meet sends, and
// optionally plays them locally too ("hear meme sounds myself").
import { synth, RATE } from './synth.js';

let nextId = 1;
const post = (msg, transfer) => window.postMessage(msg, '*', transfer);

export class SfxBus {
  constructor({ getVolume = () => 0.7, getLocal = () => false } = {}) {
    this.getVolume = getVolume;
    this.getLocal = getLocal;
    this.loaded = new Map(); // key -> Float32Array (local copy for monitoring)
    this.pending = new Map();
    this.local = null;
  }

  setVolume(v) { post({ __mm: 'sfx-volume', volume: v }); }

  async decode(bytes) {
    const ctx = new OfflineAudioContext(1, 1, RATE);
    const buf = await ctx.decodeAudioData(bytes.slice(0));
    const n = buf.length, out = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels;
    }
    return out;
  }

  // ref: 'synth:<name>' or a file in the meme's folder. fetchBytes(path) -> {bytes} | null.
  // opts.from / opts.to (seconds) trim a clip's audio.
  load(key, ref, fetchBytes, opts = {}) {
    if (this.loaded.has(key)) return Promise.resolve(true);
    if (this.pending.has(key)) return this.pending.get(key);
    const p = (async () => {
      let pcm = null;
      if (ref.startsWith('synth:')) pcm = synth(ref.slice(6));
      else {
        const res = await fetchBytes(ref);
        if (res) pcm = await this.decode(res.bytes);
      }
      if (!pcm) return false;
      if (opts.from || opts.to) pcm = pcm.slice(Math.round((opts.from || 0) * RATE), opts.to ? Math.round(opts.to * RATE) : undefined);
      this.loaded.set(key, pcm);
      const copy = pcm.slice();
      post({ __mm: 'sfx-load', key, pcm: copy, rate: RATE }, [copy.buffer]);
      return true;
    })().catch((err) => { console.warn('[meet-memes] sound failed', key, err); return false; }).finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  has(key) { return this.loaded.has(key); }

  // Returns a handle with stop(). Plays into the call (and locally if enabled).
  play(key, { volume = 1, loop = false } = {}) {
    if (!this.loaded.has(key)) return { stop() {} };
    const id = nextId++;
    this.setVolume(this.getVolume());
    post({ __mm: 'sfx-play', key, id, volume, loop });
    const localNode = this.getLocal() ? this.playLocal(key, volume, loop) : null;
    return {
      stop() {
        post({ __mm: 'sfx-stop', id });
        try { if (localNode) localNode.stop(); } catch { /* ignore */ }
      },
    };
  }

  playLocal(key, volume, loop) {
    try {
      if (!this.local) {
        this.local = new AudioContext();
        const resume = () => this.local && this.local.state === 'suspended' && this.local.resume();
        window.addEventListener('pointerdown', resume, true);
        window.addEventListener('keydown', resume, true);
      }
      const pcm = this.loaded.get(key);
      const buf = this.local.createBuffer(1, pcm.length, RATE);
      buf.copyToChannel(pcm, 0);
      const node = this.local.createBufferSource();
      node.buffer = buf;
      node.loop = loop;
      const gain = this.local.createGain();
      gain.gain.value = volume * this.getVolume();
      node.connect(gain).connect(this.local.destination);
      node.start();
      return node;
    } catch { return null; }
  }

  stopAll() { post({ __mm: 'sfx-stop', all: true }); }
}
