import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyAction, modePatch, panicPatch, MODE_LABELS } from '../extension/src/content/modes.js';

const key = (code, mods = {}) => ({ code, altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, ...mods });

test('Alt+Shift+M/D/S pick modes, R toggles mirror, 0 is panic', () => {
  assert.deepEqual(keyAction(key('KeyM')), { mode: 'meme' });
  assert.deepEqual(keyAction(key('KeyD')), { mode: 'draw' });
  assert.deepEqual(keyAction(key('KeyS')), { mode: 'spell' });
  assert.deepEqual(keyAction(key('KeyR')), { mirror: true });
  assert.deepEqual(keyAction(key('Digit0')), { panic: true });
  assert.deepEqual(keyAction(key('Digit3')), { hotkey: 'Alt+Shift+3' });
});

test('other modifier combos are ignored', () => {
  assert.equal(keyAction(key('KeyM', { ctrlKey: true })), null);
  assert.equal(keyAction(key('KeyM', { shiftKey: false })), null);
  assert.equal(keyAction(key('KeyQ')), null);
});

test('switching to a mode remembers it for the panic key', () => {
  assert.deepEqual(modePatch({ activeMode: 'meme', lastMode: 'meme' }, 'draw'), { activeMode: 'draw', lastMode: 'draw' });
  assert.deepEqual(modePatch({ activeMode: 'draw', lastMode: 'draw' }, 'off'), { activeMode: 'off' });
});

test('panic toggles between off and the last mode', () => {
  assert.deepEqual(panicPatch({ activeMode: 'spell', lastMode: 'spell' }), { activeMode: 'off' });
  assert.deepEqual(panicPatch({ activeMode: 'off', lastMode: 'draw' }), { activeMode: 'draw' });
});

test('every mode has a label', () => {
  for (const m of ['off', 'meme', 'draw', 'spell']) assert.ok(MODE_LABELS[m]);
});
