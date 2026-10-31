// Sanity checks run locally (`npm run check`) and in CI before a release:
// every JS file parses, the manifest is valid, and every meme.json is well-formed.
import { readFile, readdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'extension');
const errors = [];
const exists = (p) => access(p).then(() => true, () => false);

const TRIGGERS = ['gesture', 'expression', 'both-hands-up', 'hands-over-face', 'hands-on-head', 'snap', 'throw'];
const RENDERS = ['overlay', 'fullscreen', 'face-in-frame', 'aura', 'throw', 'thanos'];
const GESTURES = ['Thumb_Up', 'Thumb_Down', 'Victory', 'ILoveYou', 'Open_Palm', 'Pointing_Up', 'Closed_Fist'];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

// 1. JS syntax
for (const file of (await walk(ext)).filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    errors.push(`${relative(root, file)}: ${err.stderr.toString().split('\n').slice(0, 5).join('\n')}`);
  }
}

// 2. Manifest
const manifest = JSON.parse(await readFile(join(ext, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push(`manifest version "${manifest.version}" is not x.y.z`);
if (manifest.version !== pkg.version) errors.push(`manifest (${manifest.version}) and package.json (${pkg.version}) versions differ`);
const tag = process.env.RELEASE_TAG;
if (tag && tag.replace(/^v/, '') !== manifest.version) errors.push(`tag ${tag} does not match manifest version ${manifest.version}`);

// 3. Memes
const hotkeys = new Map();
const index = JSON.parse(await readFile(join(ext, 'memes', 'index.json'), 'utf8'));
for (const id of index.memes) {
  const file = join(ext, 'memes', id, 'meme.json');
  if (!await exists(file)) { errors.push(`memes/${id}/meme.json is missing`); continue; }
  let def;
  try { def = JSON.parse(await readFile(file, 'utf8')); } catch (err) { errors.push(`memes/${id}/meme.json: ${err.message}`); continue; }
  const where = `memes/${id}`;
  if (!def.name) errors.push(`${where}: missing "name"`);
  for (const t of [].concat(def.trigger || [])) {
    if (!TRIGGERS.includes(t.type)) errors.push(`${where}: unknown trigger type "${t.type}"`);
    if (t.type === 'gesture' && !GESTURES.includes(t.gesture)) errors.push(`${where}: unknown gesture "${t.gesture}" (use one of ${GESTURES.join(', ')})`);
  }
  if (!def.render || !RENDERS.includes(def.render.type)) errors.push(`${where}: render.type must be one of ${RENDERS.join(', ')}`);
  if (def.hotkey) {
    if (!/^Alt\+Shift\+[1-9]$/.test(def.hotkey)) errors.push(`${where}: hotkey must look like "Alt+Shift+1" (0 is the panic key)`);
    if (hotkeys.has(def.hotkey)) errors.push(`${where}: hotkey ${def.hotkey} already used by ${hotkeys.get(def.hotkey)}`);
    hotkeys.set(def.hotkey, id);
  }
  for (const key of ['asset', 'projectile']) {
    const f = def.render && def.render[key];
    if (f && !await exists(join(ext, 'memes', id, f))) console.warn(`  note: ${where}/${f} not added yet (a built-in fallback is used)`);
  }
}

if (errors.length) {
  console.error('✗ ' + errors.join('\n✗ '));
  process.exit(1);
}
console.log(`✓ all checks passed (${index.memes.length} memes, v${manifest.version})`);
