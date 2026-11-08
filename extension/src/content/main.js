// Content script entry (isolated world). Owns the meme list, runs detection,
// fires triggers, and composes active effects into the fx canvas each frame.
import {
  getSettings, saveSettings, getCustomMemes, loadBundledMemes, applyOverrides, isMemeEnabled, onStorageChanged, isOn,
} from '../shared/settings.js';
import { ModeController } from './modes.js';
import { Pill } from './pill.js';
import { Compositor } from '../gfx/compositor.js';
import { SelfViewOverlay } from './charge-ring.js';
import { SfxBus } from './sfx.js';
import { EngineClient } from './engine-client.js';
import { AssetStore } from './assets.js';
import { SnapListener } from './audio.js';
import { Preview, toast } from './preview.js';
import { createTrigger, TriggerArbiter } from '../triggers/index.js';
import { createEffect } from '../renderers/index.js';

const RECENT_FACE_MS = 1500;
const DETECT_WIDTH = 640;

function ensureRoot() {
  let root = document.getElementById('meet-memes-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'meet-memes-root';
    document.documentElement.appendChild(root);
  }
  // Kept in the viewport (but invisible) so Chrome doesn't throttle the engine iframe.
  root.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;';
  for (const id of ['meet-memes-src']) {
    if (document.getElementById(id)) continue;
    const c = document.createElement('canvas');
    c.id = id;
    c.width = c.height = 2;
    root.appendChild(c);
  }
  return root;
}

const MIC_TRIGGERS = new Set(['snap', 'thumb-by-face']);
const usesSnap = (trigger) => [].concat(trigger || []).some((t) => t && MIC_TRIGGERS.has(t.type));

class App {
  constructor() {
    this.root = ensureRoot();
    this.src = document.getElementById('meet-memes-src');
    this.compositor = new Compositor(this.root);
    this.frame = this.src; // the (possibly mirrored) frame effects and detection use
    this.memes = [];
    this.enabledMemes = [];
    this.det = { hands: [], face: null, mask: null, aspect: 16 / 9, t: 0 };
    this.lastFace = null;
    this.lastFaceAt = -Infinity;
    this.detecting = false;
    this.lastDetectAt = 0;
    this.previewDismissed = false;
    this.greeted = false;
  }

  async init() {
    this.settings = await getSettings();
    this.engine = new EngineClient(this.root);
    this.engine.onStatus = (state, err) => {
      this.root.dataset.engine = state;
      if (state === 'error') toast(`Meet Memes: gesture detection failed to load (${err})`, 6000);
    };
    this.assets = new AssetStore(this.engine);
    this.sfx = new SfxBus({ getVolume: () => this.settings.soundVolume, getLocal: () => this.settings.hearSoundsLocally });
    this.audio = new SnapListener();
    this.preview = new Preview(() => { this.previewDismissed = true; this.preview.hide(); });
    this.triggerCtx = { audio: () => this.audio };
    this.arbiter = new TriggerArbiter({ quietMs: 1500 });
    this.charging = false;
    this.modes = new ModeController({
      getSettings: () => this.settings,
      save: (patch) => { this.settings = { ...this.settings, ...patch }; this.applySettings(); return saveSettings(patch); },
      toast: (t) => toast(t),
      onHotkey: (combo) => this.fireHotkey(combo),
    });

    this.src.addEventListener('meet-memes-frame', () => this.onFrame());
    this.overlay = new SelfViewOverlay();
    this.root.addEventListener('meet-memes-debug', (e) => {
      const d = e.detail || {};
      if (d.cmd === 'loseGL') this.compositor.loseContext();
      if (d.cmd === 'ring') this.overlay.show(d.id, d.progress, { x: d.x, y: d.y });
      if (d.cmd === 'dumpPlate') {
        const t = this.memes.find((m) => m.def.id === 'thanos-snap');
        const p = t && t.effect.plate;
        if (p) p.convertToBlob().then((b) => b.arrayBuffer()).then((buf) => {
          let bin = ''; const u = new Uint8Array(buf);
          for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
          this.root.dataset.plate = btoa(bin);
        });
      }
    });
    // Keep the self-view's mirror styling right as Meet re-renders it.
    setInterval(() => this.overlay.setMirror(!!this.settings.mirror && isOn(this.settings)), 1000);
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg && msg.type === 'status') reply(this.status());
    });
    this.pill = new Pill({
      getState: () => this.settings,
      onMode: (mode) => this.modes.set(mode),
      onMirror: () => this.modes.toggleMirror(),
      onGuide: () => chrome.runtime.sendMessage({ type: 'open-guide' }).catch(() => {}),
    });
    const mountPill = () => this.pill.mount().catch((err) => console.warn('[meet-memes] pill failed', err));
    if (document.body) mountPill(); else document.addEventListener('DOMContentLoaded', mountPill, { once: true });
    onStorageChanged(async () => {
      this.settings = await getSettings();
      await this.loadMemes();
      this.applySettings();
    });

    await this.loadMemes();
    this.applySettings();
    setTimeout(() => this.compositor.warmup(), 1500);
  }

  async loadMemes() {
    if (!this.bundled) this.bundled = await loadBundledMemes((p) => this.engine.fetchText(p));
    const defs = [...applyOverrides(this.bundled, this.settings), ...await getCustomMemes()];
    for (const m of this.memes) m.effect.stop();
    const deps = { assets: this.assets, sfx: this.sfx, toast };
    this.memes = defs.map((def) => {
      const effect = createEffect(def, deps);
      if (!effect) return null;
      effect.load().catch((err) => console.warn('[meet-memes] load failed', def.id, err));
      if (def.sound) {
        const ref = def.sound.startsWith('synth:') ? def.sound : (def.base || '') + def.sound;
        this.sfx.load(effect.soundKey, ref, (p) => this.engine.fetchBytes(p), def.soundTrim || {});
      }
      return { def, effect, trigger: createTrigger(def.trigger, this.triggerCtx), cooldownUntil: 0, wasActive: false };
    }).filter(Boolean);
  }

  applySettings() {
    const s = this.settings;
    const on = isOn(s);
    this.root.dataset.mode = on ? s.audience : 'off';
    this.root.dataset.mirror = s.mirror ? '1' : '0';
    if (this.pill) this.pill.update();
    if (this.sfx) this.sfx.setVolume(s.soundVolume);
    if (this.overlay) this.overlay.setMirror(!!s.mirror && on);
    if (this.pill) this.pill.update();
    if (this.sfx) this.sfx.setVolume(s.soundVolume);
    if (this.overlay) this.overlay.setMirror(!!s.mirror && on);
    this.enabledMemes = on ? this.memes.filter((m) => isMemeEnabled(s, m.def)) : [];
    this.gesturesOn = s.activeMode === 'meme';
    this.needsDetection = this.gesturesOn && this.enabledMemes.some((m) => m.trigger);
    this.needsMask = this.enabledMemes.some((m) => m.effect.needsMask);
    this.wantMic = this.gesturesOn && s.snapUsesMic && this.enabledMemes.some((m) => usesSnap(m.def.trigger));
    if (!this.wantMic) this.audio.stop();
    if (!on) for (const m of this.memes) m.effect.stop();

    const showPreview = on && (s.audience === 'local' || s.showPreview || s.debug) && !this.previewDismissed;
    if (showPreview) {
      this.preview.show(s.audience === 'local' ? 'Local mode: only you see these effects.' : 'This is exactly what everyone in the call sees.');
    } else {
      this.preview.hide();
    }
  }

  onFrame() {
    const now = performance.now();
    const { src } = this;
    this.lastFrameAt = now;

    if (!this.greeted && this.engine.status === 'ready') {
      this.greeted = true;
      toast('Meet Memes is ready ✨  (Alt+Shift+0 turns it off)');
    }
    if (this.wantMic && !this.audio.running) this.audio.start();

    const mirror = !!this.settings.mirror && isOn(this.settings);
    const frame = this.frame = this.compositor.frameFor(src, mirror);
    this.maybeDetect(now);

    const active = [];
    for (const m of this.enabledMemes) {
      const on = m.effect.isActive(now);
      if (on) active.push(m);
      else if (m.showing) m.effect.onEnd();
      m.showing = on;
    }
    active.sort((a, b) => a.effect.layer - b.effect.layer);

    if (active.length || mirror) {
      const g = this.compositor.begin(frame, { now, mask: this.det.mask });
      const env = { w: frame.width, h: frame.height, now, src: frame, det: this.det, g, quality: this.compositor.quality, mirror };
      g.drawFrame();
      for (const m of active) {
        try {
          m.effect.renderGL(g, env);
        } catch (err) {
          console.warn('[meet-memes] render failed', m.def.id, err);
          m.effect.stop();
        }
      }
      this.compositor.end();
      this.root.dataset.used = '1';
    }

    const ft = performance.now() - now;
    this.ftMax = Math.max(this.ftMax || 0, ft);
    if (now - (this.ftAt || 0) > 1000) { this.root.dataset.frameMs = this.ftMax.toFixed(1); this.ftMax = 0; this.ftAt = now; }
    if (this.preview.el) {
      this.preview.draw(active.length || mirror ? this.compositor.fx : src, this.det, this.settings.debug, this.settings.debug ? this.debugLines(active) : []);
    }
  }

  maybeDetect(now) {
    if (this.detecting || !this.needsDetection || this.engine.status !== 'ready') return;
    // Fast while hands are in view or a pose is charging; slow when nothing is happening.
    const interval = this.det.hands.length || this.charging ? 33 : 125;
    if (now - this.lastDetectAt < interval) return;
    this.detecting = true;
    this.lastDetectAt = now;
    const frame = this.frame;
    const w = DETECT_WIDTH, h = Math.round(DETECT_WIDTH * frame.height / frame.width);
    createImageBitmap(frame, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' })
      .then((bmp) => this.engine.detect(bmp, this.needsMask))
      .then((res) => this.onDetections(res))
      .catch((err) => console.warn('[meet-memes] detect failed', err))
      .finally(() => { this.detecting = false; });
  }

  onDetections(res) {
    const now = performance.now();
    this.detGapMax = Math.max(this.detGapMax || 0, now - (this.lastDetAt || now));
    this.lastDetAt = now;
    if (now - (this.detGapAt || 0) > 1000) { this.root.dataset.detGap = Math.round(this.detGapMax); this.detGapMax = 0; this.detGapAt = now; }
    if (res.mask) this.root.dataset.masks = String((Number(this.root.dataset.masks) || 0) + 1);
    if (res.face) { this.lastFace = res.face; this.lastFaceAt = now; }
    if (this.det.mask && this.det.mask !== res.mask) this.det.mask.close();
    this.det = {
      hands: res.hands || [],
      face: res.face || (now - this.lastFaceAt < RECENT_FACE_MS ? this.lastFace : null),
      mask: res.mask || null,
      aspect: this.src.width / this.src.height,
      t: now,
    };

    const cands = [];
    for (const m of this.enabledMemes) {
      m.effect.onDetect(this.det, this.frame);
      if (!m.trigger || !this.gesturesOn) continue;
      const r = m.trigger.update(this.det, now);
      cands.push({ id: m.def.id, priority: m.def.priority ?? 50, active: r.active, progress: r.progress, cooldownUntil: m.cooldownUntil, m, info: r.info });
    }
    const { fire, progress } = this.arbiter.decide(cands, now);
    this.charging = progress.size > 0;
    for (const c of cands) {
      const { m } = c;
      if (c.id === fire) {
        m.effect.fire(c.info, now);
        this.lastFired = { id: m.def.name, at: now };
        this.root.dataset.lastFired = m.def.id + '@' + Math.round(now);
        m.cooldownUntil = now + (m.def.cooldownMs ?? 2500);
      }
      m.effect.setHeld(c.active, now);
      const p = progress.get(c.id);
      if (p !== undefined && !m.effect.isActive(now)) {
        const at = (c.info && c.info.hand) || (this.det.face && this.det.face.nose) || { x: 0.5, y: 0.5 };
        this.overlay.show(c.id, p, { x: at.x, y: Math.max(0.08, at.y - 0.12) });
      } else {
        this.overlay.hide(c.id);
      }
    }
  }

  onKey(e) {
    if (this.modes.handleKey(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  fireHotkey(combo) {
    if (!isOn(this.settings)) return false;
    const meme = this.enabledMemes.find((m) => m.def.hotkey === combo);
    if (!meme) return false;
    meme.effect.fire({ hand: { x: 0.5, y: 0.6 } }, performance.now(), { hotkey: true });
    this.lastFired = { id: meme.def.name + ' (hotkey)', at: performance.now() };
    return true;
  }

  // Snapshot for the popup's status panel.
  status() {
    const now = performance.now();
    return {
      enabled: isOn(this.settings),
      mode: this.settings.activeMode,
      audience: this.settings.audience,
      mirror: this.settings.mirror,
      cameraLive: now - (this.lastFrameAt || -Infinity) < 2000,
      path: this.root.dataset.path || 'none',
      frameSize: `${this.src.width}x${this.src.height}`,
      engine: this.engine.status,
      engineError: this.engine.error,
      memes: this.memes.length,
      hands: this.det.hands.map((h) => h.gesture.name),
      face: !!this.det.face,
      mic: this.audio.running,
      lastFired: this.lastFired && { id: this.lastFired.id, agoMs: Math.round(now - this.lastFired.at) },
    };
  }

  debugLines(active) {
    const d = this.det;
    return [
      `engine: ${this.engine.status}  mic: ${this.audio.running ? 'on' : 'off'}`,
      `hands: ${d.hands.map((h) => `${h.handedness[0]}:${h.gesture.name}`).join(' ') || '-'}`,
      `face: ${d.face ? 'yes' : 'no'}  mask: ${d.mask ? 'yes' : 'no'}`,
      `active: ${active.map((m) => m.def.id).join(', ') || '-'}`,
    ];
  }
}

export async function start() {
  if (window.top !== window) return;
  const app = new App();
  await app.init();
}
