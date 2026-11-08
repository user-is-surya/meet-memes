// Detects the broccoli fling: a hand moving fast up and back past the shoulder line.
// hist: [{ t, x, y }] palm positions (frame-normalized), oldest first.
// Returns 'left' | 'right' (direction in the frame) or null.
export function detectSweep(hist, face, now, { windowMs = 350, minRise = 0.9 } = {}) {
  const box = face && face.box;
  const faceH = box ? box.h : 0.25;
  const shoulder = box ? box.y + box.h : 0.5;
  const pts = hist.filter((p) => now - p.t <= windowMs);
  if (pts.length < 2) return null;
  const start = pts[0], end = pts[pts.length - 1];
  const rise = start.y - end.y;
  if (rise < minRise * faceH || end.y > shoulder) return null;
  return end.x < start.x ? 'left' : 'right';
}
