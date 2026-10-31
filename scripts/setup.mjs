// Copies MediaPipe into extension/vendor and downloads the models.
// Chrome MV3 forbids loading code from the network, so everything ships inside the extension.
import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const vendor = join(root, 'extension', 'vendor');

const MODELS = {
  'gesture_recognizer.task': 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'selfie_segmenter.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
};

const exists = (p) => access(p).then(() => true, () => false);

async function copyMediapipe() {
  await mkdir(join(vendor, 'mediapipe', 'wasm'), { recursive: true });
  await copyFile(join(pkg, 'vision_bundle.mjs'), join(vendor, 'mediapipe', 'vision_bundle.mjs'));
  for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
    await copyFile(join(pkg, 'wasm', f), join(vendor, 'mediapipe', 'wasm', f));
  }
  console.log('✓ MediaPipe copied');
}

async function downloadModels(force) {
  await mkdir(join(vendor, 'models'), { recursive: true });
  for (const [name, url] of Object.entries(MODELS)) {
    const dest = join(vendor, 'models', name);
    if (!force && await exists(dest)) { console.log(`✓ ${name} (cached)`); continue; }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed for ${name}: ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`✓ ${name} downloaded`);
  }
}

if (!await exists(pkg)) {
  console.error('Run `npm install` first.');
  process.exit(1);
}
await copyMediapipe();
await downloadModels(process.argv.includes('--force'));
console.log('\nDone. Load the "extension" folder in chrome://extensions (Developer mode → Load unpacked).');
