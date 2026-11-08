// Adaptive quality: effects scale particle counts etc. by `quality` (0.25..1).
// Sustained overruns (10 frames in a row over target) drop it by 0.1; 60 frames in a row
// under 70% of target raise it by 0.05. A single fast or slow frame resets the streak.
export class FrameBudget {
  constructor(targetMs = 8) {
    this.target = targetMs;
    this.quality = 1;
    this.over = 0;
    this.under = 0;
  }

  record(ms) {
    if (ms > this.target) {
      this.under = 0;
      if (++this.over >= 10) { this.over = 0; this.set(this.quality - 0.1); }
    } else if (ms < this.target * 0.7) {
      this.over = 0;
      if (++this.under >= 60) { this.under = 0; this.set(this.quality + 0.05); }
    } else {
      this.over = 0;
      this.under = 0;
    }
  }

  set(q) { this.quality = Math.round(Math.min(1, Math.max(0.25, q)) * 1000) / 1000; }
}
