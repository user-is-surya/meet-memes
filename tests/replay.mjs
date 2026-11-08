// Replays a detection trace through the real trigger code exactly as the content script
// runs it (createTrigger per meme + TriggerArbiter), and reports which memes fired when.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTrigger, TriggerArbiter } from '../extension/src/triggers/index.js';

const memesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'memes');

export async function loadBundledDefs() {
  const index = JSON.parse(await readFile(join(memesDir, 'index.json'), 'utf8'));
  return Promise.all(index.memes.map(async (id) => ({ id, ...JSON.parse(await readFile(join(memesDir, id, 'meme.json'), 'utf8')) })));
}

const RECENT_FACE_MS = 1500;

const flipX = (p) => (p ? { ...p, x: 1 - p.x } : p);
const swapLR = (name) => name.replace(/Left|Right/, (m) => (m === 'Left' ? 'Right' : 'Left'));

// Practice records in selfie (mirrored) view; Meet's default is camera view. Convert back.
export function unmirrorFrame(f) {
  return {
    ...f,
    hands: f.hands.map((h) => ({ ...h, handedness: swapLR(h.handedness), landmarks: h.landmarks.map(flipX) })),
    face: f.face && {
      ...f.face,
      box: { ...f.face.box, x: 1 - f.face.box.x - f.face.box.w },
      nose: flipX(f.face.nose),
      blendshapes: Object.fromEntries(Object.entries(f.face.blendshapes || {}).map(([k, v]) => [swapLR(k), v])),
      ...(f.face.eyes ? { eyes: { left: flipX(f.face.eyes.right), right: flipX(f.face.eyes.left) } } : {}),
      ...(f.face.pose ? { pose: { ...f.face.pose, yaw: -f.face.pose.yaw, roll: -(f.face.pose.roll || 0) } } : {}),
    },
  };
}

export function replay(trace, defs, { quietMs = 1500 } = {}) {
  const transients = [...(trace.transients || [])].sort((a, b) => a - b);
  const audio = {
    running: !!trace.mic,
    lastSpikeAt: -Infinity,
    spikeSince(t) { return this.lastSpikeAt >= t; },
  };
  const ctx = { audio: () => (audio.running ? audio : null) };
  const memes = defs.map((def) => ({ def, trigger: createTrigger(def.trigger, ctx), cooldownUntil: 0 })).filter((m) => m.trigger);
  const arbiter = new TriggerArbiter({ quietMs });
  const fires = [];
  let lastFace = null, lastFaceAt = -Infinity, ti = 0;

  for (const raw of trace.frames) {
    const f = trace.mirrored ? unmirrorFrame(raw) : raw;
    const now = f.t;
    while (ti < transients.length && transients[ti] <= now) audio.lastSpikeAt = transients[ti++];
    if (f.face) { lastFace = f.face; lastFaceAt = now; }
    const det = {
      hands: f.hands,
      face: f.face || (now - lastFaceAt < RECENT_FACE_MS ? lastFace : null),
      aspect: trace.aspect || 16 / 9,
      t: now,
    };
    const cands = memes.map((m) => {
      const r = m.trigger.update(det, now);
      return { id: m.def.id, priority: m.def.priority ?? 50, active: r.active, progress: r.progress, cooldownUntil: m.cooldownUntil, m };
    });
    const { fire } = arbiter.decide(cands, now);
    if (fire) {
      const m = cands.find((c) => c.id === fire).m;
      m.cooldownUntil = now + (m.def.cooldownMs ?? 2500);
      fires.push({ id: fire, t: now });
    }
  }
  return { fires };
}
