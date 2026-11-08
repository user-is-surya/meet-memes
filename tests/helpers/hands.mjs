// Synthetic MediaPipe-style landmarks for tests.
// Builds 21 hand landmarks. Fingers point along `dir` from the wrist; `s` is the
// wrist→knuckle length. Each finger is 'ext' (extended) or 'curl' (folded into the palm).
export function hand({ x, y, s = 0.06, dir = { x: 0, y: -1 }, fingers = {}, thumbTip, gesture = 'None', handedness = 'Right' }) {
  const side = { x: -dir.y, y: dir.x };
  const at = (a, b) => ({ x: x + (dir.x * a + side.x * b) * s, y: y + (dir.y * a + side.y * b) * s, z: 0 });
  const lm = new Array(21);
  lm[0] = at(0, 0);
  lm[1] = at(0.3, -0.3); lm[2] = at(0.6, -0.5); lm[3] = at(0.9, -0.6);
  lm[4] = thumbTip ? { ...thumbTip, z: 0 } : at(1.2, -0.6);
  const cols = { index: [5, -0.3], middle: [9, -0.1], ring: [13, 0.1], pinky: [17, 0.3] };
  for (const [name, [base, b]] of Object.entries(cols)) {
    const curled = (fingers[name] || 'ext') === 'curl';
    lm[base] = at(1, b);
    lm[base + 1] = at(curled ? 1.25 : 1.3, b);
    lm[base + 2] = at(curled ? 1.1 : 1.6, b);
    lm[base + 3] = at(curled ? 0.9 : 1.9, b);
  }
  return { landmarks: lm, handedness, gesture: { name: gesture, score: 0.9 } };
}


export const FACE = { box: { x: 0.4, y: 0.3, w: 0.2, h: 0.3 }, nose: { x: 0.5, y: 0.45 }, blendshapes: {} };
