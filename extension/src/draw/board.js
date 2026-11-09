// The ink on the Draw mode board: strokes in normalized frame coordinates.
// `version` bumps on every change except appending to the current stroke (which renders
// incrementally); `pending` holds points appended since the renderer last caught up.
export class Board {
  constructor() {
    this.strokes = [];
    this.current = null;
    this.version = 0;
  }

  begin(p, color, size) {
    this.end();
    this.current = { color, size, points: [{ x: p.x, y: p.y }] };
    this.strokes.push(this.current);
  }

  add(p) {
    if (!this.current) return;
    const pts = this.current.points, last = pts[pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.0015) return;
    pts.push({ x: p.x, y: p.y });
  }

  end() {
    if (this.current && this.current.points.length < 2) {
      // A single dot: give it a second point so it renders as a round blob.
      const p = this.current.points[0];
      this.current.points.push({ x: p.x + 0.0005, y: p.y });
    }
    this.current = null;
  }

  // Removes ink within radius r (frame-height units) of c, splitting strokes where cut.
  erase(c, r, aspect) {
    const out = [];
    let changed = false;
    for (const s of this.strokes) {
      let run = [];
      for (const p of s.points) {
        if (Math.hypot((p.x - c.x) * aspect, p.y - c.y) < r) {
          changed = true;
          if (run.length > 1) out.push({ ...s, points: run });
          run = [];
        } else run.push(p);
      }
      if (run.length > 1) out.push(run.length === s.points.length ? s : { ...s, points: run });
      else if (run.length) changed = true;
    }
    if (!changed) return false;
    this.strokes = out;
    if (this.current && !out.includes(this.current)) this.current = null;
    this.version++;
    return true;
  }

  undo() {
    this.end();
    if (!this.strokes.length) return false;
    this.strokes.pop();
    this.version++;
    return true;
  }

  clear() {
    this.current = null;
    if (!this.strokes.length) return false;
    this.strokes = [];
    this.version++;
    return true;
  }
}
