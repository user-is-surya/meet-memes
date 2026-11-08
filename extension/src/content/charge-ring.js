// Things drawn over Meet's self-view that only you see (DOM, never in the video):
//  - the charge-up ring that fills while a gesture is being recognised
//  - keeping the self-view a natural mirror: with Mirror mode on, our output is already
//    a selfie view, so Meet's own CSS flip is cancelled; with it off, Meet's flip is kept.
const RING = 46; // px

function flipSign(el) {
  let sign = 1;
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    const t = getComputedStyle(e).transform;
    if (t && t !== 'none') {
      const m = /matrix(3d)?\(([^)]+)\)/.exec(t);
      if (m) { const a = parseFloat(m[2].split(',')[0]); if (a < 0) sign = -sign; }
    }
  }
  return sign;
}

// Where the video's picture actually is on screen (object-fit aware).
function contentRect(video) {
  const r = video.getBoundingClientRect();
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const fit = getComputedStyle(video).objectFit;
  const s = fit === 'cover' ? Math.max(r.width / vw, r.height / vh) : fit === 'fill' ? null : Math.min(r.width / vw, r.height / vh);
  if (!s) return r;
  const w = vw * s, h = vh * s;
  return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, clip: r };
}

export class SelfViewOverlay {
  constructor() {
    this.rings = new Map();
    this.mirror = false;
    this.layer = null;
  }

  targets() {
    return [...document.querySelectorAll('video[data-meet-memes-self="1"], #meet-memes-preview canvas')]
      .filter((el) => el.getBoundingClientRect().width > 40);
  }

  setMirror(mirror) {
    this.mirror = mirror;
    for (const v of document.querySelectorAll('video[data-meet-memes-self="1"]')) {
      if (!('mmOrigTransform' in v.dataset)) v.dataset.mmOrigTransform = v.style.transform || '';
      if (mirror) {
        v.style.transform = 'none';
        const parentFlip = flipSign(v.parentElement);
        v.style.transform = parentFlip < 0 ? 'scaleX(-1)' : 'none';
      } else {
        v.style.transform = v.dataset.mmOrigTransform;
      }
    }
  }

  ensureLayer() {
    if (this.layer && this.layer.isConnected) return this.layer;
    const l = this.layer = document.createElement('div');
    l.id = 'meet-memes-rings';
    l.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483001;';
    (document.body || document.documentElement).appendChild(l);
    return l;
  }

  // progress 0..1; anchor {x,y} normalized in output-video space.
  show(id, progress, anchor = { x: 0.5, y: 0.5 }) {
    const target = this.targets()[0];
    let el = this.rings.get(id);
    if (!target) { if (el) el.style.opacity = '0'; return; }
    if (!el) {
      el = document.createElement('div');
      el.dataset.meetMemesRing = id;
      el.style.cssText = `position:fixed;width:${RING}px;height:${RING}px;margin:-${RING / 2}px 0 0 -${RING / 2}px;transition:opacity .15s;`;
      el.innerHTML = `<svg viewBox="0 0 46 46" width="${RING}" height="${RING}">
        <circle cx="23" cy="23" r="19" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.25)" stroke-width="4"/>
        <circle class="arc" cx="23" cy="23" r="19" fill="none" stroke="#a78bfa" stroke-width="4" stroke-linecap="round"
          transform="rotate(-90 23 23)" stroke-dasharray="119.4" stroke-dashoffset="119.4"/></svg>`;
      this.ensureLayer().appendChild(el);
      this.rings.set(id, el);
    }
    const r = target.tagName === 'VIDEO' ? contentRect(target) : target.getBoundingClientRect();
    const flipped = flipSign(target) < 0;
    const x = flipped ? 1 - anchor.x : anchor.x;
    el.style.left = (r.left + x * r.width) + 'px';
    el.style.top = (r.top + anchor.y * r.height) + 'px';
    el.style.opacity = '1';
    const p = Math.max(0, Math.min(1, progress));
    el.querySelector('.arc').setAttribute('stroke-dashoffset', String(119.4 * (1 - p)));
    el.querySelector('.arc').setAttribute('stroke', p >= 1 ? '#4ade80' : '#a78bfa');
  }

  hide(id) {
    const el = this.rings.get(id);
    if (el) el.style.opacity = '0';
  }

  hideAll() { for (const id of this.rings.keys()) this.hide(id); }
}
