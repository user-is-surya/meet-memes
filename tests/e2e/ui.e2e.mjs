import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from './run.mjs';

const stored = (h) => h.sw.evaluate(async () => (await chrome.storage.sync.get('settings')).settings || {});

test('in-page pill switches modes; Alt+Shift+M switches back', async () => {
  const h = await open();
  try {
    await h.wait(1500);
    const pill = h.page.locator('#meet-memes-pill');
    await pill.hover();
    await h.page.locator('#meet-memes-pill [data-mode="draw"]').click();
    await h.wait(300);
    assert.equal((await stored(h)).activeMode, 'draw');
    await h.press('Alt+Shift+KeyM');
    await h.wait(300);
    assert.equal((await stored(h)).activeMode, 'meme');
  } finally { await h.close(); }
});

test('pill mirror button toggles mirror', async () => {
  const h = await open();
  try {
    await h.wait(1500);
    await h.page.locator('#meet-memes-pill').hover();
    await h.page.locator('#meet-memes-pill [data-action="mirror"]').click();
    await h.wait(300);
    assert.equal((await stored(h)).mirror, true);
  } finally { await h.close(); }
});

test('popup mode buttons save the mode', async () => {
  const h = await open();
  try {
    const popup = await h.ctx.newPage();
    await popup.goto(`chrome-extension://${h.extId}/popup/popup.html`);
    await popup.locator('label[for="activeMode-spell"]').click();
    await popup.waitForTimeout(300);
    assert.equal((await stored(h)).activeMode, 'spell');
    await popup.locator('label[for="activeMode-meme"]').click();
    await popup.waitForTimeout(300);
    assert.equal((await stored(h)).activeMode, 'meme');
  } finally { await h.close(); }
});
