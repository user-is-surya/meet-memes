import {
  getSettings, saveSettings, setMemeSetting, isMemeEnabled, loadBundledMemes, getCustomMemes,
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

async function main() {
  const settings = await getSettings();
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  const enabled = $('enabled');
  enabled.checked = settings.enabled;
  document.body.classList.toggle('off', !settings.enabled);
  enabled.addEventListener('change', () => {
    document.body.classList.toggle('off', !enabled.checked);
    saveSettings({ enabled: enabled.checked });
  });

  $('mode-' + settings.mode).checked = true;
  for (const r of document.querySelectorAll('input[name=mode]')) {
    r.addEventListener('change', () => saveSettings({ mode: r.value }));
  }
  for (const key of ['showPreview', 'snapUsesMic', 'debug']) {
    $(key).checked = settings[key];
    $(key).addEventListener('change', () => saveSettings({ [key]: $(key).checked }));
  }

  $('manage').addEventListener('click', () => chrome.runtime.openOptionsPage());
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
