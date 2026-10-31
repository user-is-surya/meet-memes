// Hand landmark helpers. Landmarks are normalized (0..1) to the camera frame;
// pass the frame aspect (w / h) so distances are measured in frame-height units.
export const L = {
  WRIST: 0, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_TIP: 12,
  RING_TIP: 16, PINKY_MCP: 17, PINKY_TIP: 20,
};

export function dist(a, b, aspect) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

export function handSize(lm, aspect) {
  return dist(lm[L.WRIST], lm[L.MIDDLE_MCP], aspect) || 1e-3;
}

export function palm(lm) {
  const a = lm[L.WRIST], b = lm[L.INDEX_MCP], c = lm[L.PINKY_MCP];
  return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
}

// Fingertip distance from the wrist, in hand sizes. ~1.9 extended, ~1.0 curled.
export function reach(lm, tip, aspect) {
  return dist(lm[tip], lm[L.WRIST], aspect) / handSize(lm, aspect);
}

export function isFist(lm, aspect) {
  const tips = [L.INDEX_TIP, L.MIDDLE_TIP, L.RING_TIP, L.PINKY_TIP];
  return tips.reduce((s, t) => s + reach(lm, t, aspect), 0) / tips.length < 1.3;
}

export function isOpen(lm, aspect) {
  const tips = [L.INDEX_TIP, L.MIDDLE_TIP, L.RING_TIP, L.PINKY_TIP];
  return tips.reduce((s, t) => s + reach(lm, t, aspect), 0) / tips.length > 1.6;
}

export function isPointing(lm, aspect) {
  return reach(lm, L.INDEX_TIP, aspect) > 1.55 && reach(lm, L.MIDDLE_TIP, aspect) < 1.45 && reach(lm, L.RING_TIP, aspect) < 1.45;
}

export function inBox(p, box, padX = 0, padY = padX) {
  return p.x >= box.x - box.w * padX && p.x <= box.x + box.w * (1 + padX)
    && p.y >= box.y - box.h * padY && p.y <= box.y + box.h * (1 + padY);
}
