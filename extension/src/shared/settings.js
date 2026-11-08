// Settings shared by the content script, popup and options page.
// - chrome.storage.sync  'settings'     small prefs, synced across the user's browsers
// - chrome.storage.local 'customMemes'  memes the user added (definitions only)
// - chrome.storage.local 'asset:<id>'   uploaded image bytes ({ mime, name, data: base64 })

export const SETTINGS_VERSION = 2;
export const MODES = ['off', 'meme', 'draw', 'spell'];

export const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  activeMode: 'meme', // off | meme | draw | spell
  lastMode: 'meme', // the mode Alt+Shift+0 returns to
  audience: 'everyone', // 'everyone' = effects go out to the call, 'local' = only you see them in the preview
  mirror: false, // others see you flipped, like your selfie view
  soundVolume: 0.7,
  hearSoundsLocally: false,
  showPreview: false,
  debug: false,
  snapUsesMic: true,
  detectFps: 15,
  memes: {}, // per meme id: { enabled?: boolean, asset?: '<assetId>' }
};

// Upgrades stored settings from any earlier version. Pure; safe to call repeatedly.
export function migrateSettings(raw) {
  const src = { ...(raw || {}) };
  if ((src.settingsVersion || 1) < 2) {
    if (src.mode === 'local' || src.mode === 'everyone') src.audience = src.mode;
    src.activeMode = src.enabled === false ? 'off' : 'meme';
    src.lastMode = 'meme';
    delete src.mode;
    delete src.enabled;
  }
  const out = { ...DEFAULT_SETTINGS, ...src, settingsVersion: SETTINGS_VERSION, memes: { ...src.memes } };
  if (!MODES.includes(out.activeMode)) out.activeMode = 'meme';
  if (!MODES.includes(out.lastMode) || out.lastMode === 'off') out.lastMode = 'meme';
  return out;
}

export const isOn = (s) => s.activeMode !== 'off';

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return migrateSettings(settings);
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.sync.set({ settings: next });
  return next;
}

export async function setMemeSetting(id, patch) {
  const s = await getSettings();
  s.memes[id] = { ...s.memes[id], ...patch };
  await chrome.storage.sync.set({ settings: s });
  return s;
}

export function isMemeEnabled(settings, def) {
  const own = settings.memes[def.id];
  if (own && typeof own.enabled === 'boolean') return own.enabled;
  return def.enabledByDefault !== false;
}

export async function getCustomMemes() {
  const { customMemes } = await chrome.storage.local.get('customMemes');
  return Array.isArray(customMemes) ? customMemes : [];
}

export async function saveCustomMemes(list) {
  await chrome.storage.local.set({ customMemes: list });
}

export async function saveAsset(file) {
  const id = crypto.randomUUID();
  const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  await chrome.storage.local.set({ ['asset:' + id]: { mime: file.type, name: file.name, data } });
  return id;
}

export async function getAsset(id) {
  const key = 'asset:' + id;
  const { [key]: rec } = await chrome.storage.local.get(key);
  return rec || null;
}

export async function deleteAsset(id) {
  if (id) await chrome.storage.local.remove('asset:' + id);
}

export function onStorageChanged(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) cb('settings');
    if (area === 'local' && Object.keys(changes).some((k) => k === 'customMemes' || k.startsWith('asset:'))) cb('custom');
  });
}

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Loads bundled meme definitions (memes/index.json + each memes/<id>/meme.json)
// using whatever fetchText the caller has (extension pages fetch directly,
// the content script goes through the engine iframe).
export async function loadBundledMemes(fetchText) {
  const index = JSON.parse(await fetchText('memes/index.json'));
  const defs = await Promise.all(index.memes.map(async (id) => {
    try {
      const def = JSON.parse(await fetchText(`memes/${id}/meme.json`));
      return { ...def, id, bundled: true, base: `memes/${id}/` };
    } catch (err) {
      console.warn('[meet-memes] bad meme', id, err);
      return null;
    }
  }));
  return defs.filter(Boolean);
}

// Applies the user's per-meme asset override (an uploaded image replacing the bundled one).
export function applyOverrides(defs, settings) {
  return defs.map((def) => {
    const own = settings.memes[def.id];
    if (!own || !own.asset) return def;
    return { ...def, render: { ...def.render, asset: 'custom:' + own.asset } };
  });
}
