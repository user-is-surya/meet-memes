// On-page UI that only you see: the floating preview (with an optional debug overlay) and toasts.
import { L } from '../lib/hands.js';

const CSS = `
#meet-memes-preview{position:fixed;left:16px;bottom:96px;z-index:2147483646;width:300px;
  background:#111;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.45);overflow:hidden;
  font:12px/1.3 system-ui,sans-serif;color:#eee;user-select:none}
#meet-memes-preview header{display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:move;background:#1d1d22}
#meet-memes-preview header b{flex:1;font-weight:600}
#meet-memes-preview header button{all:unset;cursor:pointer;padding:0 4px;font-size:14px;opacity:.7}
#meet-memes-preview header button:hover{opacity:1}
#meet-memes-preview canvas{display:block;width:100%}
#meet-memes-preview .mm-note{padding:4px 8px;color:#aaa}
.meet-memes-toast{position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:2147483647;
  background:#1d1d22;color:#fff;padding:8px 14px;border-radius:999px;font:13px system-ui,sans-serif;
  box-shadow:0 6px 20px rgba(0,0,0,.4);transition:opacity .3s}
`;

function whenBody(fn) {
  if (document.body) fn();
  else document.addEventListener('DOMContentLoaded', fn, { once: true });
}

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  (document.head || document.documentElement).appendChild(s);
}

export function toast(text, ms = 2200) {
  whenBody(() => {
    style();
    const el = document.createElement('div');
    el.className = 'meet-memes-toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, ms);
    setTimeout(() => el.remove(), ms + 400);
  });
}

export class Preview {
  constructor(onClose) {
    this.onClose = onClose;
    this.el = null;
  }

  show(note) {
    if (this.el) { this.noteEl.textContent = note; return; }
    whenBody(() => {
      if (this.el) return;
      style();
      const make = (tag, props = {}) => Object.assign(document.createElement(tag), props);
      const el = make('div', { id: 'meet-memes-preview' });
      const header = make('header');
      const close = make('button', { title: 'Hide', textContent: '✕' });
      header.append(make('b', { textContent: 'Meet Memes preview' }), close);
      this.canvas = make('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.noteEl = make('div', { className: 'mm-note', textContent: note });
      el.append(header, this.canvas, this.noteEl);
      close.addEventListener('click', () => this.onClose());
      this.drag(el, header);
      document.body.appendChild(el);
      this.el = el;
    });
  }

  hide() {
    if (this.el) this.el.remove();
    this.el = null;
  }

  drag(el, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = (ev) => {
        el.style.left = `${ev.clientX - ox}px`;
        el.style.top = `${ev.clientY - oy}px`;
        el.style.bottom = 'auto';
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  // Draws the frame exactly as others in the call see it (not mirrored), plus debug info.
  draw(source, det, debug, lines) {
    if (!this.el || !source.width) return;
    const w = 300, h = Math.round(300 * source.height / source.width);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const c = this.ctx;
    c.save();
    c.drawImage(source, 0, 0, w, h);
    if (debug && det) {
      if (det.face) {
        const b = det.face.box;
        c.strokeStyle = '#4ade80';
        c.lineWidth = 1.5;
        c.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
      }
      for (const hand of det.hands) {
        c.fillStyle = '#facc15';
        for (const p of hand.landmarks) c.fillRect(p.x * w - 1.5, p.y * h - 1.5, 3, 3);
        c.fillStyle = '#f43f5e';
        for (const i of [L.THUMB_TIP, L.INDEX_TIP, L.MIDDLE_TIP]) {
          const p = hand.landmarks[i];
          c.fillRect(p.x * w - 2.5, p.y * h - 2.5, 5, 5);
        }
      }
    }
    c.restore();
    if (debug && lines.length) {
      c.fillStyle = 'rgba(0,0,0,.6)';
      c.fillRect(0, 0, w, 14 * lines.length + 6);
      c.fillStyle = '#fff';
      c.font = '11px ui-monospace, monospace';
      lines.forEach((l, i) => c.fillText(l, 6, 14 + i * 14));
    }
  }
}
