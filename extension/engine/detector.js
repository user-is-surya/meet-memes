// MediaPipe detection, shared by the engine iframe (on Meet) and the Guide's Practice tab.
// createDetector() -> { ready: Promise, detect(bitmap, { mask, ts }) -> { hands, face, mask } }
import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker,
  ImageSegmenter,
} from '../vendor/mediapipe/vision_bundle.mjs';

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
import { faceInfo, handsInfo } from './detector-core.js';

export { faceInfo, handsInfo };
const url = (p) => new URL(p, import.meta.url).href;

async function create(fileset, Task, options) {
  try {
    return await Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
  } catch (err) {
    console.warn('[meet-memes engine] GPU init failed, using CPU', err);
    return Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
  }
}

export async function maskBitmap(result) {
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

export function createDetector() {
  let gesture = null, face = null, segmenter = null, lastTs = 0;
  const ready = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(url('../vendor/mediapipe/wasm'));
    [gesture, face, segmenter] = await Promise.all([
      create(fileset, GestureRecognizer, {
        baseOptions: { modelAssetPath: url('../vendor/models/gesture_recognizer.task') },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
      create(fileset, FaceLandmarker, {
        baseOptions: { modelAssetPath: url('../vendor/models/face_landmarker.task') },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }),
      create(fileset, ImageSegmenter, {
        baseOptions: { modelAssetPath: url('../vendor/models/selfie_segmenter.tflite') },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }),
    ]);
  })();

  // Never closes `bitmap`; the caller owns it.
  async function detect(bitmap, { mask: wantMask = false, ts } = {}) {
    if (!gesture) return { hands: [], face: null, mask: null };
    const t = lastTs = Math.max(ts ?? performance.now(), lastTs + 1);
    let hands = [], faceRes = null, mask = null;
    hands = handsInfo(gesture.recognizeForVideo(bitmap, t));
    faceRes = faceInfo(face.detectForVideo(bitmap, t));
    if (wantMask) {
      const seg = segmenter.segmentForVideo(bitmap, t);
      mask = await maskBitmap(seg);
      seg.close();
    }
    return { hands, face: faceRes, mask };
  }

  return { ready, detect };
}
