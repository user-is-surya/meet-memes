// Learns what your room looks like behind you while Meet Memes is on: every detection,
// pixels the person mask says are background (with a safety margin around you) update
// a low-res "plate". Used to show the empty room when you turn to dust.
export class BackgroundModel {
  // minSeen: sightings in a row before a pixel is trusted as background (rejects spots
  // the segmentation misses only now and then). A sudden big change resets trust.
  constructor(w, h, { dilate = 3, alpha = 0.15, minSeen = 1, jump = 120 } = {}) {
    this.minSeen = minSeen;
    this.jump = jump;
    this.seen = new Uint8Array(w * h);
    this.w = w; this.h = h;
    this.dilate = dilate;
    this.alpha = alpha;
    this.rgba = new Uint8ClampedArray(w * h * 4);
    this.known = new Uint8Array(w * h);
    this.person = new Uint8Array(w * h);
    this.tmp = new Uint8Array(w * h);
  }

  // frame: RGBA (w*h*4); mask: RGBA where alpha = person confidence, same size.
  learn(frame, mask) {
    const { w, h, person, tmp, rgba, known } = this;
    const n = w * h;
    for (let i = 0; i < n; i++) person[i] = mask[i * 4 + 3] > 50 ? 1 : 0;
    // Grow the person area by `dilate` px (separable max) so edges never leak in.
    const r = this.dilate;
    if (r > 0) {
      for (let y = 0; y < h; y++) {
        let run = -1e9;
        for (let x = 0; x < w; x++) { if (person[y * w + x]) run = x; tmp[y * w + x] = x - run <= r ? 1 : 0; }
        run = 1e9;
        for (let x = w - 1; x >= 0; x--) { if (person[y * w + x]) run = x; if (run - x <= r) tmp[y * w + x] = 1; }
      }
      for (let x = 0; x < w; x++) {
        let run = -1e9;
        for (let y = 0; y < h; y++) { if (tmp[y * w + x]) run = y; person[y * w + x] = y - run <= r ? 1 : 0; }
        run = 1e9;
        for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) run = y; if (run - y <= r) person[y * w + x] = 1; }
      }
    }
    const a = this.alpha, seen = this.seen, minSeen = this.minSeen;
    for (let i = 0; i < n; i++) {
      if (person[i]) continue;
      const p = i * 4;
      if (seen[i] === 0) {
        rgba[p] = frame[p]; rgba[p + 1] = frame[p + 1]; rgba[p + 2] = frame[p + 2]; rgba[p + 3] = 255;
        seen[i] = 1;
      } else {
        const diff = Math.abs(frame[p] - rgba[p]) + Math.abs(frame[p + 1] - rgba[p + 1]) + Math.abs(frame[p + 2] - rgba[p + 2]);
        if (diff > this.jump && seen[i] < 250) {
          // Outlier: keep the old value, lose trust until it settles again.
          seen[i] = 0;
          known[i] = 0;
          continue;
        }
        rgba[p] += (frame[p] - rgba[p]) * a;
        rgba[p + 1] += (frame[p + 1] - rgba[p + 1]) * a;
        rgba[p + 2] += (frame[p + 2] - rgba[p + 2]) * a;
        if (seen[i] < 255) seen[i]++;
      }
      if (seen[i] >= minSeen) known[i] = 1;
    }
  }

  snapshot() {
    return { rgba: new Uint8ClampedArray(this.rgba), known: new Uint8Array(this.known), w: this.w, h: this.h };
  }

  coverage() {
    let k = 0; for (let i = 0; i < this.known.length; i++) k += this.known[i];
    return k / this.known.length;
  }
}
