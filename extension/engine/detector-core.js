// Pure parsing of MediaPipe results (no MediaPipe import, so it can be unit-tested).

export function faceInfo(result) {
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
  const out = {
    box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    nose: { x: lm[1].x, y: lm[1].y },
    blendshapes,
  };
  // Irises (refined landmarks 468-472 and 473-477): centre + radius.
  if (lm.length >= 478) {
    const iris = (b) => {
      const c = lm[b];
      let r = 0;
      for (let i = 1; i <= 4; i++) r += Math.hypot(lm[b + i].x - c.x, lm[b + i].y - c.y);
      return { x: c.x, y: c.y, r: r / 4 };
    };
    const a = iris(468), b = iris(473);
    out.eyes = a.x < b.x ? { left: a, right: b } : { left: b, right: a }; // left/right on screen
  }
  // Head direction from the facial transformation matrix (column-major 4x4).
  const mat = result.facialTransformationMatrixes && result.facialTransformationMatrixes[0];
  const m = mat && (mat.data || mat);
  if (m && m.length >= 16) {
    const fx = m[8], fy = m[9], fz = m[10]; // face forward axis
    out.pose = { yaw: Math.atan2(fx, fz), pitch: Math.atan2(-fy, Math.hypot(fx, fz)), roll: Math.atan2(m[1], m[0]) };
  }
  return out;
}

export function handsInfo(result) {
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

