// Detection traces: what the gesture engine saw, frame by frame (landmarks, gesture labels,
// face box / blendshapes / eyes / head pose) plus mic transient times. No images, no audio.
// Recorded in the Guide's Practice tab; replayed in tests to tune triggers on real people.
export const TRACE_VERSION = 1;

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const pt = (p) => (p ? { x: r4(p.x), y: r4(p.y), ...(p.z !== undefined ? { z: r4(p.z) } : {}), ...(p.r !== undefined ? { r: r4(p.r) } : {}) } : p);

function slimFace(f) {
  if (!f) return null;
  const out = {
    box: { x: r4(f.box.x), y: r4(f.box.y), w: r4(f.box.w), h: r4(f.box.h) },
    nose: pt(f.nose),
    blendshapes: Object.fromEntries(Object.entries(f.blendshapes || {}).map(([k, v]) => [k, r4(v)])),
  };
  if (f.eyes) out.eyes = { left: pt(f.eyes.left), right: pt(f.eyes.right) };
  if (f.pose) out.pose = { yaw: r4(f.pose.yaw), pitch: r4(f.pose.pitch), roll: r4(f.pose.roll || 0) };
  return out;
}

export class TraceRecorder {
  start(label, aspect, { mic = false } = {}) {
    this.trace = { version: TRACE_VERSION, label, aspect: r4(aspect), mic, frames: [], transients: [] };
    this.t0 = null;
  }

  // det: { hands, face }; now: ms; transients: mic spike times (ms, same clock) since the last push
  push(det, now, transients = []) {
    if (!this.trace) return;
    if (this.t0 === null) this.t0 = now;
    const t = Math.round(now - this.t0);
    this.trace.frames.push({
      t,
      hands: (det.hands || []).map((h) => ({
        landmarks: h.landmarks.map(pt),
        handedness: h.handedness,
        gesture: { name: h.gesture.name, score: r4(h.gesture.score) },
      })),
      face: slimFace(det.face),
    });
    for (const s of transients) this.trace.transients.push(Math.round(s - this.t0));
  }

  stop() {
    const tr = this.trace;
    this.trace = null;
    return tr;
  }
}
