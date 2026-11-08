// Packed particle storage (struct of arrays). Positions are in frame-normalized units
// (x and y both 0..1); velocities in units per second. Rendered by graphics.particles().
export class ParticleSystem {
  constructor(max) {
    this.max = max;
    this.count = 0;
    for (const k of ParticleSystem.FIELDS) this[k] = new Float32Array(max);
    this.tmp = {};
    this.forceOut = { x: 0, y: 0 };
  }

  // init(i, p): set any of p.x p.y p.vx p.vy p.life p.size p.r p.g p.b p.a p.rot p.vr p.kind p.data
  spawn(n, init) {
    const room = Math.min(n, this.max - this.count);
    const p = this.tmp;
    for (let k = 0; k < room; k++) {
      for (const f of ParticleSystem.FIELDS) p[f] = 0;
      p.life = 1; p.size = 2; p.r = p.g = p.b = p.a = 1;
      init(k, p);
      const i = this.count++;
      for (const f of ParticleSystem.FIELDS) this[f][i] = p[f];
      this.age[i] = 0;
    }
    return room;
  }

  // forces: { drag (1/s), gravity (units/s^2, +y down), wind {x,y} (units/s added to motion),
  //           force(i, sys, out) per-particle acceleration }
  step(dt, forces = {}) {
    const { drag = 0, gravity = 0, wind = null, force = null } = forces;
    const out = this.forceOut;
    const damp = Math.exp(-drag * dt);
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      const age = this.age[i] + dt;
      if (age >= this.life[i]) continue;
      let ax = 0, ay = gravity * (this.kind[i] > 0 ? 1 : 0.25);
      if (force) { out.x = 0; out.y = 0; force(i, this, out); ax += out.x; ay += out.y; }
      let vx = (this.vx[i] + ax * dt) * damp, vy = (this.vy[i] + ay * dt) * damp;
      let x = this.x[i] + vx * dt, y = this.y[i] + vy * dt;
      if (wind) { x += wind.x * dt; y += wind.y * dt; }
      if (w !== i) for (const f of ParticleSystem.FIELDS) this[f][w] = this[f][i];
      this.x[w] = x; this.y[w] = y; this.vx[w] = vx; this.vy[w] = vy; this.age[w] = age;
      this.rot[w] += this.vr[w] * dt;
      w++;
    }
    this.count = w;
  }

  clear() { this.count = 0; }
}
ParticleSystem.FIELDS = ['x', 'y', 'vx', 'vy', 'life', 'age', 'size', 'r', 'g', 'b', 'a', 'rot', 'vr', 'kind', 'data'];
