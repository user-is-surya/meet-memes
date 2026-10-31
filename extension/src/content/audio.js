// Listens to the mic for the sharp transient of a finger snap.
// Uses its own audio stream (unaffected by Meet's mute button) and never sends audio anywhere.
export class SnapListener {
  constructor() {
    this.running = false;
    this.lastSpikeAt = -Infinity;
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
    let peak = 0, sum = 0;
    for (const v of this.buf) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; }
    const rms = Math.sqrt(sum / this.buf.length) || 1e-6;
    // A snap is loud relative to the room and very peaky (high crest factor), unlike speech.
    if (peak > Math.max(0.15, this.floor * 5) && peak / rms > 5) this.lastSpikeAt = performance.now();
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
