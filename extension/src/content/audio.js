// Listens to the mic for sharp transients: finger snaps (Thanos) and tongue clicks (Noice).
// Uses its own audio stream (unaffected by Meet's mute button) and never sends audio anywhere.

// Classifies one analysis buffer: 'snap' (loud, very peaky), 'click' (quieter, very short
// and peaky), or null (speech, music, silence). floor = running background peak level.
export function classifyTransient(buf, floor) {
  let peak = 0, peakAt = 0, sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) { peak = a; peakAt = i; }
    sum += buf[i] * buf[i];
  }
  const rms = Math.sqrt(sum / buf.length) || 1e-6;
  const crest = peak / rms;
  if (peak > Math.max(0.15, floor * 5) && crest > 5) return 'snap';
  if (peak > Math.max(0.06, floor * 4) && crest > 6) {
    // Short: energy ~1.25 ms worth of samples after the peak + 25 ms must have died down.
    let tail = 0, tn = 0;
    for (let i = peakAt + 1200; i < buf.length; i++) { tail += buf[i] * buf[i]; tn++; }
    if (!tn || Math.sqrt(tail / tn) < peak * 0.3) return 'click';
  }
  return null;
}

export class SnapListener {
  constructor() {
    this.running = false;
    this.lastSpikeAt = -Infinity; // snaps
    this.lastClickAt = -Infinity; // tongue clicks (and snaps)
    this.floor = 0.02;
  }

  async start() {
    if (this.running || this.starting) return;
    this.starting = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.ctx = new AudioContext();
      const resume = () => this.ctx && this.ctx.state === 'suspended' && this.ctx.resume();
      window.addEventListener('pointerdown', resume, true);
      window.addEventListener('keydown', resume, true);
      resume();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
      this.timer = setInterval(() => this.tick(), 15);
      this.running = true;
    } catch (err) {
      console.warn('[meet-memes] mic unavailable, snap uses vision only', err);
    } finally {
      this.starting = false;
    }
  }

  tick() {
    this.analyser.getFloatTimeDomainData(this.buf);
    let peak = 0;
    for (const v of this.buf) { const a = Math.abs(v); if (a > peak) peak = a; }
    const kind = classifyTransient(this.buf, this.floor);
    const now = performance.now();
    if (kind === 'snap') { this.lastSpikeAt = now; this.lastClickAt = now; }
    else if (kind === 'click') this.lastClickAt = now;
    this.floor = this.floor * 0.995 + peak * 0.005;
  }

  spikeSince(t) {
    return this.lastSpikeAt >= t;
  }

  stop() {
    clearInterval(this.timer);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.stream = this.ctx = null;
    this.running = false;
  }
}

export const TransientListener = SnapListener;
