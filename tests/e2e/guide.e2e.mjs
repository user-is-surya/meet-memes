import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, EXT } from './run.mjs';

const memeCount = JSON.parse(readFileSync(join(EXT, 'memes', 'index.json'), 'utf8')).memes.length;

test('guide renders a complete card for every meme', async () => {
  const h = await open({ harness: false });
  try {
    const p = await h.ctx.newPage();
    await p.goto(`chrome-extension://${h.extId}/guide/guide.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.meme-card');
    const cards = await p.$$eval('.meme-card', (els) => els.map((el) => ({
      what: el.querySelector('[data-part="origin"]')?.textContent.trim(),
      happens: el.querySelector('[data-part="what-happens"]')?.textContent.trim(),
      how: el.querySelector('[data-part="how"]')?.textContent.trim(),
      hotkey: el.querySelector('kbd')?.textContent.trim(),
    })));
    assert.equal(cards.length, memeCount);
    for (const c of cards) {
      assert.ok(c.what && c.happens && c.how, JSON.stringify(c));
      assert.match(c.hotkey, /Alt\+Shift\+\d/);
    }
    for (const id of ['start', 'memes', 'draw', 'spell', 'utilities', 'practice', 'troubleshooting']) {
      assert.ok(await p.$(`section#${id}`), `section ${id}`);
    }
  } finally { await h.close(); }
});

test('practice: camera + engine run and a trace can be recorded and exported', async () => {
  const h = await open({ harness: false });
  try {
    const p = await h.ctx.newPage();
    await p.goto(`chrome-extension://${h.extId}/guide/guide.html?recordSeconds=3#practice`, { waitUntil: 'domcontentloaded' });
    await p.click('#practice-start');
    await p.locator('#practice-status[data-state="running"]').waitFor({ timeout: 60000 });
    await p.selectOption('#practice-meme', { index: 1 });
    await p.click('details.record summary');
    await p.click('#record-normal');
    const download = await p.waitForEvent('download', { timeout: 30000 });
    assert.match(download.suggestedFilename(), /^normal-\d+\.json$/);
    const path = await download.path();
    const trace = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(trace.version, 1);
    assert.ok(trace.frames.length > 10, `frames: ${trace.frames.length}`);
    assert.ok(trace.frames.some((f) => f.face), 'the fake camera person has a face');
  } finally { await h.close(); }
});
