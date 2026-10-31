import {
  getSettings, setMemeSetting, isMemeEnabled, loadBundledMemes, getCustomMemes, saveCustomMemes,
  saveAsset, getAsset, deleteAsset,
} from '../src/shared/settings.js';
import { ACTIONS, STYLES, POSITIONS } from '../src/shared/actions.js';

const MAX_BYTES = 8 * 1024 * 1024;
const CUSTOM_HOTKEYS = ['Alt+Shift+7', 'Alt+Shift+8', 'Alt+Shift+9'];

const $ = (id) => document.getElementById(id);
const fetchText = async (p) => (await fetch(chrome.runtime.getURL(p))).text();

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

function options(select, items) {
  select.replaceChildren(...items.map(([value, label]) => el('option', { value, textContent: label })));
}

function toggle(checked, onChange) {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'switch', title: 'On / off' }, input, el('span'));
}

async function assetUrl(id) {
  const rec = await getAsset(id);
  return rec ? `data:${rec.mime};base64,${rec.data}` : '';
}

function thumb(src, fallback) {
  if (!src) return el('div', { className: 'pic', textContent: fallback });
  const img = el('img', { className: 'pic', src, alt: '' });
  img.addEventListener('error', () => img.replaceWith(el('div', { className: 'pic', textContent: fallback })));
  return img;
}

// ---------- add form ----------

function setupForm() {
  options($('action'), ACTIONS.map((a) => [a.id, a.label]));
  options($('style'), STYLES.map((s) => [s.id, s.label]));
  options($('position'), POSITIONS.map((p) => [p, p.replace('-', ' ')]));
  options($('hotkey'), [['', 'None'], ...CUSTOM_HOTKEYS.map((k) => [k, k.replace(/\+/g, ' + ')])]);

  const syncStyle = () => {
    for (const node of document.querySelectorAll('[data-for]')) node.hidden = node.dataset.for !== $('style').value;
  };
  $('style').addEventListener('change', syncStyle);
  syncStyle();

  const syncSize = () => { $('size-out').textContent = Math.round($('size').value * 100) + '% of frame height'; };
  $('size').addEventListener('input', syncSize);
  syncSize();

  const drop = $('drop');
  drop.addEventListener('dragover', () => drop.classList.add('over'));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', () => drop.classList.remove('over'));
  $('file').addEventListener('change', () => {
    const file = $('file').files[0];
    if (!file) return;
    $('thumb').src = URL.createObjectURL(file);
    $('thumb').hidden = false;
    $('drop-text').hidden = true;
    if (!$('name').value) $('name').value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  });

  $('add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('form-msg');
    const file = $('file').files[0];
    if (!file) return void (msg.textContent = 'Choose an image first.');
    if (file.size > MAX_BYTES) return void (msg.textContent = 'That file is over 8 MB. Try a smaller GIF.');

    const list = await getCustomMemes();
    const hotkey = $('hotkey').value;
    const clash = hotkey && list.find((m) => m.hotkey === hotkey);
    if (clash) return void (msg.textContent = `${hotkey} is already used by “${clash.name}”.`);
    if ($('action').value === 'hotkey-only' && !hotkey) return void (msg.textContent = 'Pick a hotkey for a hotkey-only meme.');

    msg.textContent = 'Saving…';
    const action = ACTIONS.find((a) => a.id === $('action').value);
    const style = $('style').value;
    const assetId = await saveAsset(file);
    const render = {
      type: style,
      asset: 'custom:' + assetId,
      caption: $('caption').value.trim() || undefined,
      durationMs: Math.round(Number($('duration').value || 3) * 1000),
    };
    if (style === 'overlay') {
      render.position = $('position').value;
      render.size = Number($('size').value);
    }
    if (style === 'face-in-frame') {
      render.faceSlot = {
        x: Number($('slot-x').value) / 100, y: Number($('slot-y').value) / 100,
        w: Number($('slot-w').value) / 100, h: Number($('slot-h').value) / 100,
      };
      render.faceFilter = 'none';
    }
    list.push({
      id: 'custom-' + assetId.slice(0, 8),
      name: $('name').value.trim(),
      how: action.label,
      custom: true,
      action: action.id,
      assetId,
      hotkey: hotkey || undefined,
      cooldownMs: 3000,
      trigger: action.trigger,
      render,
    });
    await saveCustomMemes(list);

    $('add').reset();
    $('thumb').hidden = true;
    $('drop-text').hidden = false;
    syncStyle();
    syncSize();
    msg.textContent = 'Added! It works in Meet right away.';
    renderAll();
  });
}

// ---------- lists ----------

async function renderCustom(settings) {
  const list = await getCustomMemes();
  const box = $('custom');
  if (!list.length) return box.replaceChildren(el('div', { className: 'card empty', textContent: 'No custom memes yet. Add one above.' }));
  const rows = await Promise.all(list.map(async (def) => {
    const action = ACTIONS.find((a) => a.id === def.action);
    const style = STYLES.find((s) => s.id === def.render.type);
    const del = el('button', { className: 'danger', textContent: 'Delete' });
    del.addEventListener('click', async () => {
      if (!confirm(`Delete “${def.name}”?`)) return;
      await deleteAsset(def.assetId);
      await saveCustomMemes((await getCustomMemes()).filter((m) => m.id !== def.id));
      renderAll();
    });
    return el('div', { className: 'card item' },
      thumb(await assetUrl(def.assetId), '🖼️'),
      el('div', { className: 'grow' },
        el('div', { className: 'name', textContent: def.name }),
        el('div', { className: 'meta', textContent: [action && action.label, style && style.label, def.hotkey].filter(Boolean).join(' · ') })),
      el('div', { className: 'actions' }, toggle(isMemeEnabled(settings, def), (on) => setMemeSetting(def.id, { enabled: on })), del));
  }));
  box.replaceChildren(...rows);
}

async function renderBundled(settings) {
  const defs = await loadBundledMemes(fetchText);
  const rows = await Promise.all(defs.map(async (def) => {
    const override = settings.memes[def.id] && settings.memes[def.id].asset;
    const hasImage = !!def.render.asset;
    const src = override ? await assetUrl(override) : hasImage ? chrome.runtime.getURL(def.base + def.render.asset) : '';
    const actions = el('div', { className: 'actions' });

    if (hasImage) {
      const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
      const pick = el('button', { textContent: 'Use my image' });
      pick.addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        const f = file.files[0];
        if (!f) return;
        if (f.size > MAX_BYTES) return alert('That file is over 8 MB.');
        const id = await saveAsset(f);
        if (override) await deleteAsset(override);
        await setMemeSetting(def.id, { asset: id });
        renderAll();
      });
      actions.append(file, pick);
      if (override) {
        const reset = el('button', { textContent: 'Reset' });
        reset.addEventListener('click', async () => {
          await deleteAsset(override);
          await setMemeSetting(def.id, { asset: null });
          renderAll();
        });
        actions.append(reset);
      }
    }
    actions.append(toggle(isMemeEnabled(settings, def), (on) => setMemeSetting(def.id, { enabled: on })));

    return el('div', { className: 'card item' },
      thumb(src, '✨'),
      el('div', { className: 'grow' },
        el('div', { className: 'name', textContent: def.name + (override ? ' (your image)' : '') }),
        el('div', { className: 'meta', textContent: [def.how, def.hotkey].filter(Boolean).join(' · ') })),
      actions);
  }));
  $('bundled').replaceChildren(...rows);
}

async function renderAll() {
  const settings = await getSettings();
  await Promise.all([renderCustom(settings), renderBundled(settings)]);
}

setupForm();
renderAll();
