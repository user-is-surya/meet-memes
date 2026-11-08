// Plays a bundled animated-WebP clip by decoding frames on demand with ImageDecoder
// (no <video> element, so Meet's page policies and hidden-video throttling don't matter,
// and memory stays at a couple of frames). The clip's audio is a separate sound file.
export class ClipPlayer {
  // fetchBytes(path) -> { bytes, mime } | null
  constructor(fetchBytes) {
    this.fetchBytes = fetchBytes;
    this.ready = false;
  }

  async load(path) {
    const res = await this.fetchBytes(path);
    if (!res || typeof ImageDecoder !== 'function') return false;
    this.decoder = new ImageDecoder({ data: res.bytes, type: 'image/webp' });
    await this.decoder.tracks.ready;
    this.count = this.decoder.tracks.selectedTrack.frameCount || 1;
    const { image } = await this.decoder.decode({ frameIndex: 0 });
    this.first = image;
    this.frameMs = Math.max(16, (image.duration || 41667) / 1000);
    this.width = image.displayWidth;
    this.height = image.displayHeight;
    this.cur = image;
    this.curIdx = 0;
    this.ready = true;
    return true;
  }

  get duration() { return this.ready ? this.count * this.frameMs : 0; }

  start(now) {
    this.t0 = now;
    this.setFrame(this.first, 0);
  }

  setFrame(img, idx) {
    if (this.cur && this.cur !== this.first && this.cur !== img) this.cur.close();
    this.cur = img;
    this.curIdx = idx;
  }

  // The frame to show at `now` (decodes ahead asynchronously; returns the latest ready frame).
  frameAt(now) {
    if (!this.ready) return null;
    const idx = Math.max(0, Math.min(this.count - 1, Math.floor((now - this.t0) / this.frameMs)));
    if (idx !== this.curIdx && !this.busy) {
      this.busy = true;
      const token = this.t0;
      this.decoder.decode({ frameIndex: idx })
        .then(({ image }) => {
          if (token !== this.t0) { image.close(); return; }
          this.setFrame(image, idx);
        })
        .catch(() => {})
        .finally(() => { this.busy = false; });
    }
    return this.cur;
  }

  close() {
    try { if (this.cur && this.cur !== this.first) this.cur.close(); if (this.first) this.first.close(); } catch { /* ignore */ }
    try { if (this.decoder) this.decoder.close(); } catch { /* ignore */ }
    this.ready = false;
  }
}
