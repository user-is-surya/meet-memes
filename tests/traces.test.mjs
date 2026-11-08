// Replays recorded real-person traces (tests/fixtures) through the trigger code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { replay, loadBundledDefs } from './replay.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
const defs = await loadBundledDefs();

if (!files.length) {
  test('real-person traces', { skip: 'no traces in tests/fixtures yet (record them in Guide → Practice)' }, () => {});
}

for (const file of files) {
  const trace = JSON.parse(await readFile(join(dir, file), 'utf8'));
  const g = /^gesture-(.+)\.json$/.exec(file);
  if (g) {
    test(`${file}: fires ${g[1]} exactly 5 times and nothing else`, () => {
      const ids = replay(trace, defs).fires.map((f) => f.id);
      assert.deepEqual(ids, Array(5).fill(g[1]), `fired: ${ids.join(', ') || 'nothing'}`);
    });
  } else if (file.startsWith('normal-')) {
    test(`${file}: normal behaviour fires nothing`, () => {
      const fires = replay(trace, defs).fires;
      assert.deepEqual(fires, [], `false fires: ${fires.map((f) => `${f.id}@${(f.t / 1000).toFixed(1)}s`).join(', ')}`);
    });
  }
}
