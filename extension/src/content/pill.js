// Small floating control on the Meet page: switch mode, toggle mirror, open the guide.
// DOM only, so it is never part of the video. Collapses to a dot when idle; drag the dot
// to move it (position is remembered).
const MODES = [
  { id: 'meme', icon: '🎭', label: 'Meme mode (Alt+Shift+M)' },
  { id: 'draw', icon: '✏️', label: 'Draw mode (Alt+Shift+D)' },
  { id: 'spell', icon: '✨', label: 'Spell mode (Alt+Shift+S)' },
  { id: 'off', icon: '⏻', label: 'Off (Alt+Shift+0)' },
];

const CSS = `
:host { all: initial; position: fixed; z-index: 2147483000; font: 13px/1 system-ui, sans-serif; user-select: none; }
.wrap { display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 999px;
  background: rgba(32, 33, 36, .88); box-shadow: 0 4px 16px rgba(0,0,0,.35); backdrop-filter: blur(6px);
  color: #e8eaed; transition: padding .15s; }
.dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; cursor: grab;
  background: linear-gradient(135deg, #8b5cf6, #ec4899); font-size: 15px; flex: none; }
.dot:active { cursor: grabbing; }
.items { display: flex; gap: 2px; overflow: hidden; max-width: 320px; transition: max-width .2s, opacity .2s; }
.collapsed .items { max-width: 0; opacity: 0; }
button { all: unset; cursor: pointer; width: 30px; height: 28px; border-radius: 999px; display: grid; place-items: center;
  font-size: 15px; position: relative; }
button:hover { background: rgba(255,255,255,.12); }
button.on { background: rgba(139, 92, 246, .55); }
.sep { width: 1px; height: 18px; background: rgba(255,255,255,.2); margin: 0 3px; }
`;

export class Pill {
  constructor({ getState, onMode, onMirror, onGuide, onBadConn = () => {} }) {
    Object.assign(this, { getState, onMode, onMirror, onGuide, onBadConn });
    this.idleTimer = 0;
  }

  async mount() {
    if (document.getElementById('meet-memes-pill')) return;
    const host = this.host = document.createElement('div');
    host.id = 'meet-memes-pill';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style><div class="wrap collapsed">
      <div class="dot" title="Meet Memes (drag to move)">🎭</div>
      <div class="items">
        ${MODES.map((m) => `<button data-mode="${m.id}" title="${m.label}">${m.icon}</button>`).join('')}
        <span class="sep"></span>
        <button data-action="mirror" title="Mirror: others see your selfie view (Alt+Shift+R)">🪞</button>
        <button data-action="badconn" title="Fake a bad connection (Alt+Shift+B)">📶</button>
        <button data-action="guide" title="Open the guide">❔</button>
      </div></div>`;
    this.wrap = shadow.querySelector('.wrap');
    this.dot = shadow.querySelector('.dot');

    shadow.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) this.onMode(b.dataset.mode);
      else if (b.dataset.action === 'mirror') this.onMirror();
      else if (b.dataset.action === 'badconn') this.onBadConn();
      else if (b.dataset.action === 'guide') this.onGuide();
    });
    host.addEventListener('mouseenter', () => this.expand());
    host.addEventListener('mouseleave', () => this.scheduleCollapse());
    this.enableDrag();

    let pos = null;
    try { ({ pillPos: pos } = await chrome.storage.local.get('pillPos')); } catch { /* ignore */ }
    this.place(pos || { left: 16, bottom: 96 });
    (document.body || document.documentElement).appendChild(host);
    this.update();
  }

  place({ left, bottom }) {
    const maxL = Math.max(0, innerWidth - 60), maxB = Math.max(0, innerHeight - 40);
    this.pos = { left: Math.min(Math.max(0, left), maxL), bottom: Math.min(Math.max(0, bottom), maxB) };
    this.host.style.left = this.pos.left + 'px';
    this.host.style.bottom = this.pos.bottom + 'px';
  }

  enableDrag() {
    let start = null;
    this.dot.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, ...this.pos, moved: false };
      this.dot.setPointerCapture(e.pointerId);
    });
    this.dot.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
      this.place({ left: start.left + dx, bottom: start.bottom - dy });
    });
    this.dot.addEventListener('pointerup', () => {
      if (start && start.moved) chrome.storage.local.set({ pillPos: this.pos }).catch(() => {});
      else this.wrap.classList.toggle('collapsed');
      start = null;
    });
  }

  expand() { clearTimeout(this.idleTimer); this.wrap.classList.remove('collapsed'); }
  scheduleCollapse() { clearTimeout(this.idleTimer); this.idleTimer = setTimeout(() => this.wrap.classList.add('collapsed'), 4000); }

  update() {
    if (!this.wrap) return;
    const s = this.getState();
    for (const b of this.wrap.querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === s.activeMode);
    this.wrap.querySelector('[data-action="mirror"]').classList.toggle('on', !!s.mirror || s.activeMode === 'draw');
    this.wrap.querySelector('[data-action="badconn"]').classList.toggle('on', !!s.badConn);
    this.dot.textContent = { off: '⏻', meme: '🎭', draw: '✏️', spell: '✨' }[s.activeMode] || '🎭';
  }
}
