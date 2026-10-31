// Hidden iframe (extension origin) embedded in the Meet page.
// Runs MediaPipe here because Meet's page CSP / Trusted Types block it in content scripts,
// and serves bundled meme files as raw bytes so the page canvas never gets tainted.
import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker,
  ImageSegmenter,
} from '../vendor/mediapipe/vision_bundle.mjs';

const PARENT_ORIGIN = 'https://meet.google.com';

// MediaPipe's WASM prints routine startup logs ("I1031 …", "W1031 …", "INFO: Created
// TensorFlow Lite …", "Graph successfully started") through console.error/warn, which
// fills chrome://extensions with fake errors. Drop those; keep everything else.
const MEDIAPIPE_NOISE = /^([IWE]\d{4} |INFO: |Graph successfully|Using NORM_RECT|Feedback manager)/;
for (const level of ['log', 'info', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    if (typeof args[0] === 'string' && MEDIAPIPE_NOISE.test(args[0])) return;
    original(...args);
  };
}
const url = (p) => new URL(p, location.href).href;

let gesture = null, face = null, segmenter = null;
let lastTs = 0;

function post(msg, transfer = []) {
  parent.postMessage(msg, PARENT_ORIGIN, transfer);
}

async function create(Task, options) {
  try {
    return await Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
  } catch (err) {
    console.warn('[meet-memes engine] GPU init failed, using CPU', err);
    return Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
  }
}

let fileset;
async function init() {
  post({ type: 'status', state: 'loading' });
  try {
    fileset = await FilesetResolver.forVisionTasks(url('../vendor/mediapipe/wasm'));
    [gesture, face, segmenter] = await Promise.all([
      create(GestureRecognizer, {
        baseOptions: { modelAssetPath: url('../vendor/models/gesture_recognizer.task') },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
      create(FaceLandmarker, {
        baseOptions: { modelAssetPath: url('../vendor/models/face_landmarker.task') },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      }),
      create(ImageSegmenter, {
        baseOptions: { modelAssetPath: url('../vendor/models/selfie_segmenter.tflite') },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }),
    ]);
    post({ type: 'status', state: 'ready' });
  } catch (err) {
    console.error('[meet-memes engine] init failed', err);
    post({ type: 'status', state: 'error', message: String(err && err.message || err) });
  }
}

function faceInfo(result) {
  const lm = result.faceLandmarks && result.faceLandmarks[0];
  if (!lm) return null;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of lm) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  const blendshapes = {};
  const cats = result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories;
  if (cats) for (const c of cats) blendshapes[c.categoryName] = c.score;
  return {
    box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    nose: { x: lm[1].x, y: lm[1].y },
    blendshapes,
  };
}

function handsInfo(result) {
  const out = [];
  const lms = result.landmarks || [];
  for (let i = 0; i < lms.length; i++) {
    const g = result.gestures && result.gestures[i] && result.gestures[i][0];
    const hd = result.handedness && result.handedness[i] && result.handedness[i][0];
    out.push({
      landmarks: lms[i].map((p) => ({ x: p.x, y: p.y, z: p.z })),
      handedness: hd ? hd.categoryName : 'Unknown',
      gesture: g ? { name: g.categoryName, score: g.score } : { name: 'None', score: 0 },
    });
  }
  return out;
}

async function maskBitmap(result) {
  const m = result.confidenceMasks && result.confidenceMasks[0];
  if (!m) return null;
  const conf = m.getAsFloat32Array();
  const img = new ImageData(m.width, m.height);
  const d = img.data;
  for (let i = 0, j = 0; i < conf.length; i++, j += 4) {
    d[j] = d[j + 1] = d[j + 2] = 255;
    d[j + 3] = conf[i] * 255;
  }
  return createImageBitmap(img);
}

async function detect({ id, bitmap, wantMask }) {
  if (!gesture) { bitmap.close(); return post({ type: 'result', id, hands: [], face: null, mask: null }); }
  const ts = lastTs = Math.max(performance.now(), lastTs + 1);
  let hands = [], faceRes = null, mask = null;
  try {
    hands = handsInfo(gesture.recognizeForVideo(bitmap, ts));
    faceRes = faceInfo(face.detectForVideo(bitmap, ts));
    if (wantMask) {
      const seg = segmenter.segmentForVideo(bitmap, ts);
      mask = await maskBitmap(seg);
      seg.close();
    }
  } catch (err) {
    console.warn('[meet-memes engine] detect failed', err);
  } finally {
    bitmap.close();
  }
  post({ type: 'result', id, hands, face: faceRes, mask }, mask ? [mask] : []);
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
});

post({ type: 'hello' });
init();
