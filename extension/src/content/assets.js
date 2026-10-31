// Loads meme images (PNG/JPG/WebP/GIF, animated or not) into ImageBitmaps.
// Bytes come from the engine iframe (bundled files) or chrome.storage (user uploads),
// so decoding happens from raw bytes and the output canvas never gets tainted.
import { getAsset, base64ToBytes } from '../shared/settings.js';

const MAX_FRAMES = 150;
const MAX_HEIGHT = 720;

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', apng: 'image/apng' };

class AnimatedImage {
  constructor(frames) {
    this.frames = frames;
    this.width = frames[0].bitmap.width;
    this.height = frames[0].bitmap.height;
    this.total = frames.reduce((s, f) => s + f.dur, 0) || 1;
  }

  frameAt(t) {
    if (this.frames.length === 1) return this.frames[0].bitmap;
    let ms = t % this.total;
    for (const f of this.frames) { if (ms < f.dur) return f.bitmap; ms -= f.dur; }
    return this.frames[this.frames.length - 1].bitmap;
  }

  close() { for (const f of this.frames) f.bitmap.close(); }
}

async function toBitmap(source) {
  const h = source.displayHeight || source.height;
  return h > MAX_HEIGHT ? createImageBitmap(source, { resizeHeight: MAX_HEIGHT, resizeQuality: 'medium' }) : createImageBitmap(source);
}

async function decode(bytes, mime) {
  if (typeof ImageDecoder === 'function' && mime && await ImageDecoder.isTypeSupported(mime)) {
    const decoder = new ImageDecoder({ data: bytes, type: mime });
    try {
      await decoder.completed;
      const count = Math.min(decoder.tracks.selectedTrack ? decoder.tracks.selectedTrack.frameCount : 1, MAX_FRAMES);
      const frames = [];
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i });
        frames.push({ bitmap: await toBitmap(image), dur: Math.max(20, (image.duration || 100000) / 1000) });
        image.close();
      }
      return new AnimatedImage(frames);
    } finally {
      decoder.close();
    }
  }
  const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
  return new AnimatedImage([{ bitmap: await toBitmap(bmp), dur: 1 }]);
}

export class AssetStore {
  constructor(engine) {
    this.engine = engine;
    this.cache = new Map();
  }

  // ref is either a filename inside the meme's folder, or 'custom:<assetId>'.
  load(def, ref) {
    if (!ref) return Promise.resolve(null);
    const key = ref.startsWith('custom:') ? ref : (def.base || '') + ref;
    if (!this.cache.has(key)) this.cache.set(key, this.fetchAndDecode(key).catch((err) => {
      console.warn('[meet-memes] asset failed', key, err);
      return null;
    }));
    return this.cache.get(key);
  }

  async fetchAndDecode(key) {
    if (key.startsWith('custom:')) {
      const rec = await getAsset(key.slice(7));
      return rec ? decode(base64ToBytes(rec.data), rec.mime) : null;
    }
    const res = await this.engine.fetchBytes(key);
    if (!res) return null; // file not added yet: renderers fall back to built-in visuals
    const ext = key.split('.').pop().toLowerCase();
    return decode(res.bytes, MIME_BY_EXT[ext] || res.mime);
  }

  clear() {
    for (const p of this.cache.values()) p.then((img) => img && img.close());
    this.cache.clear();
  }
}
