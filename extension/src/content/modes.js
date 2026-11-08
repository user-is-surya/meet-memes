// Modes (Off / Meme / Draw / Spell), mirror and meme hotkeys from the keyboard.
// All shortcuts are Alt+Shift+<key>. Pure helpers are exported for tests.
export const MODE_LABELS = {
  off: 'Off: your camera is untouched',
  meme: '🎭 Meme mode',
  draw: '✏️ Draw mode',
  spell: '✨ Spell mode',
};
export const COMING_SOON = new Set(['draw', 'spell']);

const MODE_KEYS = { KeyM: 'meme', KeyD: 'draw', KeyS: 'spell' };

// KeyboardEvent -> { mode } | { mirror: true } | { panic: true } | { hotkey } | null
export function keyAction(e) {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return null;
  if (MODE_KEYS[e.code]) return { mode: MODE_KEYS[e.code] };
  if (e.code === 'KeyR') return { mirror: true };
  if (e.code === 'Digit0') return { panic: true };
  const m = /^Digit([1-9])$/.exec(e.code);
  return m ? { hotkey: 'Alt+Shift+' + m[1] } : null;
}

export function modePatch(settings, mode) {
  return mode === 'off' ? { activeMode: 'off' } : { activeMode: mode, lastMode: mode };
}

export function panicPatch(settings) {
  return settings.activeMode === 'off' ? { activeMode: settings.lastMode || 'meme' } : { activeMode: 'off' };
}

export class ModeController {
  // getSettings() -> current settings; save(patch) persists; toast(text) shows a private message.
  constructor({ getSettings, save, toast, onHotkey }) {
    Object.assign(this, { getSettings, save, toast, onHotkey });
  }

  get active() { return this.getSettings().activeMode; }

  set(mode) {
    this.save(modePatch(this.getSettings(), mode));
    this.toast(MODE_LABELS[mode] + (COMING_SOON.has(mode) ? ' (coming soon)' : ''));
  }

  toggleMirror() {
    const mirror = !this.getSettings().mirror;
    this.save({ mirror });
    this.toast(mirror ? '🪞 Mirror on: others see your selfie view' : 'Mirror off');
  }

  panic() {
    const patch = panicPatch(this.getSettings());
    this.save(patch);
    this.toast(MODE_LABELS[patch.activeMode]);
  }

  // Returns true when the key was ours (caller stops propagation).
  handleKey(e) {
    const a = keyAction(e);
    if (!a) return false;
    if (a.mode) this.set(a.mode);
    else if (a.mirror) this.toggleMirror();
    else if (a.panic) this.panic();
    else if (a.hotkey) return this.onHotkey(a.hotkey);
    return true;
  }
}
