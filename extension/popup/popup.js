import {
  getSettings, saveSettings, setMemeSetting, isMemeEnabled, loadBundledMemes, getCustomMemes, isOn,
} from '../src/shared/settings.js';

const $ = (id) => document.getElementById(id);
const fetchText = async (p) => (await fetch(chrome.runtime.getURL(p))).text();

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

function toggle(checked, onChange) {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'switch' }, input, el('span'));
}

async function renderMemes(settings) {
  const defs = [...await loadBundledMemes(fetchText), ...await getCustomMemes()];
  const list = $('memes');
  list.replaceChildren(...defs.map((def) => el('div', { className: 'card row meme' },
    el('div', { className: 'grow' },
      el('div', { className: 'name', textContent: def.name + (def.custom ? '  ✦' : '') }),
      el('div', { className: 'how', textContent: def.how || '' })),
    def.hotkey ? el('kbd', { textContent: def.hotkey.replace(/\+/g, ' + ') }) : null,
    toggle(isMemeEnabled(settings, def), (on) => setMemeSetting(def.id, { enabled: on })),
  )));
}

function renderUpdate(update) {
  const box = $('update');
  if (!update || !update.available) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(
    el('div', { textContent: `Version ${update.latest} is out (you have ${update.current}). ` }),
    el('a', { href: update.zip, target: '_blank', textContent: 'Download the update' }),
    el('span', { className: 'small', textContent: '  then unzip over your folder and click Reload in chrome://extensions.' }),
  );
}

// Live diagnostics from the content script in the active tab.
async function renderStatus() {
  const box = $('status');
  const line = (state, text, hint) => [
    el('div', { className: 'line ' + state, textContent: ' ' + text }),
    hint ? el('div', { className: 'hint', textContent: hint }) : null,
  ].filter(Boolean);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('https://meet.google.com/')) {
    box.replaceChildren(...line('wait', 'Open a Google Meet tab to use Meet Memes.'));
    return;
  }
  let s;
  try {
    s = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
  } catch {
    s = null;
  }
  if (!s) {
    box.replaceChildren(...line('bad', 'Not running in this tab yet.', 'Refresh the Meet tab (the extension only attaches when the page loads).'));
    return;
  }
  const bt = $('badconn-toggle');
  bt.disabled = !s.enabled;
  bt.dataset.on = s.badConn && s.badConn.on ? '1' : '';
  bt.textContent = bt.dataset.on ? '⏹ Stop' : 'Start';
  bt.dataset.tab = tab.id;
  const rows = [
    ...line(s.cameraLive ? 'ok' : 'bad',
      s.cameraLive ? `Camera hooked (${s.frameSize})` : 'No camera frames',
      s.cameraLive ? '' : 'Turn your camera on in Meet. If it is on, refresh the tab so the extension loads before Meet grabs the camera.'),
    ...line(s.engine === 'ready' ? 'ok' : s.engine === 'error' ? 'bad' : 'wait',
      s.engine === 'ready' ? 'Gesture detection ready' : s.engine === 'error' ? 'Gesture detection failed' : 'Gesture detection loading…',
      s.engine === 'error' ? s.engineError : ''),
  ];
  if (s.cameraLive) rows.push(...line(s.path === 'sender' ? 'ok' : 'wait',
    s.path === 'sender' ? 'Effects path: after Meet effects ✓' : 'Effects path: before Meet effects (fallback) ⚠',
    s.path === 'sender' ? '' : 'Meet blur / backgrounds may soften the memes. Tell the developer if you see this during a call.'));
  if (s.engine === 'ready' && s.cameraLive) {
    rows.push(...line(s.face ? 'ok' : 'wait', s.face ? 'Face visible' : 'No face detected'));
    rows.push(...line(s.hands.length ? 'ok' : 'wait', s.hands.length ? `Hands: ${s.hands.join(', ')}` : 'No hands in view'));
  }
  if (s.badConn && s.badConn.on) rows.push(...line('wait', `Bad connection is on (${s.badConn.kind === 'both' ? 'video + audio' : s.badConn.kind + ' only'})`));
  if (s.lastFired) rows.push(...line('ok', `Last meme: ${s.lastFired.id}, ${Math.round(s.lastFired.agoMs / 1000)}s ago`));
  if (!s.enabled) rows.push(...line('bad', 'Turned off (switch at the top, or Alt+Shift+0)'));
  box.replaceChildren(...rows);
}

async function main() {
  renderStatus();
  setInterval(renderStatus, 1000);
  const settings = await getSettings();
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  const enabled = $('enabled');
  enabled.checked = isOn(settings);
  document.body.classList.toggle('off', !enabled.checked);
  enabled.addEventListener('change', async () => {
    document.body.classList.toggle('off', !enabled.checked);
    const s = await getSettings();
    const mode = enabled.checked ? s.lastMode : 'off';
    $('activeMode-' + mode).checked = true;
    saveSettings({ activeMode: mode });
  });

  $('activeMode-' + settings.activeMode).checked = true;
  for (const r of document.querySelectorAll('input[name=activeMode]')) {
    r.addEventListener('change', () => {
      const patch = r.value === 'off' ? { activeMode: 'off' } : { activeMode: r.value, lastMode: r.value };
      enabled.checked = r.value !== 'off';
      document.body.classList.toggle('off', r.value === 'off');
      saveSettings(patch);
    });
  }
  for (const key of ['mirror', 'hearSoundsLocally']) {
    $(key).checked = !!settings[key];
    $(key).addEventListener('change', () => saveSettings({ [key]: $(key).checked }));
  }
  $('spellStyle').value = settings.spellStyle;
  $('spellStyle').addEventListener('change', () => saveSettings({ spellStyle: $('spellStyle').value }));
  $('badConnKind').value = settings.badConnKind;
  $('badConnKind').addEventListener('change', () => saveSettings({ badConnKind: $('badConnKind').value }));
  $('badConnAutoLeaveSec').value = String(settings.badConnAutoLeaveSec);
  $('badConnAutoLeaveSec').addEventListener('change', () => saveSettings({ badConnAutoLeaveSec: Number($('badConnAutoLeaveSec').value) }));
  $('badconn-toggle').addEventListener('click', async () => {
    const bt = $('badconn-toggle');
    if (!bt.dataset.tab) return;
    await chrome.tabs.sendMessage(Number(bt.dataset.tab), { type: 'badconn', on: !bt.dataset.on }).catch(() => {});
    renderStatus();
  });
  $('soundVolume').value = settings.soundVolume;
  $('soundVolume').addEventListener('change', () => saveSettings({ soundVolume: Number($('soundVolume').value) }));
  $('guide').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('guide/guide.html') }));

  $('audience-' + settings.audience).checked = true;
  for (const r of document.querySelectorAll('input[name=audience]')) {
    r.addEventListener('change', () => saveSettings({ audience: r.value }));
  }
  for (const key of ['showPreview', 'snapUsesMic', 'debug']) {
    $(key).checked = settings[key];
    $(key).addEventListener('change', () => saveSettings({ [key]: $(key).checked }));
  }

  $('manage').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('diag').addEventListener('click', async () => {
    let report = { error: 'Open the popup while on the Meet tab.' };
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && /^https:\/\/meet\.google\.com\//.test(tab.url || '')) {
        report = await chrome.tabs.sendMessage(tab.id, { type: 'diagnostics' }).catch((e) => ({ error: 'Extension not running in this tab (refresh Meet): ' + e.message }));
      }
    } catch (e) { report = { error: String(e) }; }
    await navigator.clipboard.writeText(JSON.stringify(report, null, 1));
    $('diag').textContent = '✓ Copied';
    setTimeout(() => { $('diag').textContent = '📋 Copy diagnostics'; }, 2000);
  });
  $('check').addEventListener('click', async () => {
    $('check').textContent = 'Checking…';
    const update = await chrome.runtime.sendMessage({ type: 'check-update' });
    renderUpdate(update);
    $('check').textContent = update && update.available ? 'Update found!' : update && update.error ? 'Check failed' : 'Up to date ✓';
  });

  const { update } = await chrome.storage.local.get('update');
  renderUpdate(update);
  await renderMemes(settings);
}

main();
