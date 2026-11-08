// Hidden iframe (extension origin) embedded in the Meet page.
// Runs MediaPipe here because Meet's page CSP / Trusted Types block it in content scripts,
// and serves bundled meme files as raw bytes so the page canvas never gets tainted.
import { createDetector } from './detector.js';
import { buildPlate } from '../src/fx/inpaint.js';

const PARENT_ORIGIN = 'https://meet.google.com';

const url = (p) => new URL(p, location.href).href;

function post(msg, transfer = []) {
  parent.postMessage(msg, PARENT_ORIGIN, transfer);
}

let detector = null;
async function init() {
  post({ type: 'status', state: 'loading' });
  try {
    detector = createDetector();
    await detector.ready;
    post({ type: 'status', state: 'ready' });
  } catch (err) {
    detector = null;
    console.error('[meet-memes engine] init failed', err);
    post({ type: 'status', state: 'error', message: String(err && err.message || err) });
  }
}

async function detect({ id, bitmap, wantMask }) {
  let res = { hands: [], face: null, mask: null };
  try {
    if (detector) res = await detector.detect(bitmap, { mask: wantMask });
  } catch (err) {
    console.warn('[meet-memes engine] detect failed', err);
  } finally {
    bitmap.close();
  }
  post({ type: 'result', id, ...res }, res.mask ? [res.mask] : []);
}

async function fetchFile({ id, path }) {
  if (typeof path !== 'string' || !path.startsWith('memes/') || path.includes('..')) {
    return post({ type: 'fetched', id, ok: false });
  }
  try {
    const res = await fetch(url('../' + path));
    if (!res.ok) return post({ type: 'fetched', id, ok: false });
    const mime = res.headers.get('content-type') || '';
    if (path.endsWith('.json')) return post({ type: 'fetched', id, ok: true, text: await res.text() });
    const bytes = await res.arrayBuffer();
    post({ type: 'fetched', id, ok: true, bytes, mime }, [bytes]);
  } catch {
    post({ type: 'fetched', id, ok: false });
  }
}

window.addEventListener('message', (e) => {
  if (e.origin !== PARENT_ORIGIN || e.source !== parent) return;
  const msg = e.data || {};
  if (msg.type === 'detect') detect(msg);
  else if (msg.type === 'fetch') fetchFile(msg);
  else if (msg.type === 'inpaint') {
    let out = null;
    try { out = buildPlate(new Uint8ClampedArray(msg.rgba), new Uint8Array(msg.known), msg.w, msg.h); } catch (err) { console.warn('[meet-memes engine] plate failed', err); }
    post({ type: 'inpainted', id: msg.id, rgba: out ? out.buffer : null }, out ? [out.buffer] : []);
  }
});

post({ type: 'hello' });
init();
