import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateSettings, DEFAULT_SETTINGS, SETTINGS_VERSION } from '../extension/src/shared/settings.js';

test('fresh install gets v2 defaults', () => {
  const s = migrateSettings(undefined);
  assert.equal(s.settingsVersion, SETTINGS_VERSION);
  assert.equal(s.activeMode, 'meme');
  assert.equal(s.audience, 'everyone');
  assert.equal(s.mirror, false);
  assert.equal(s.soundVolume, 0.7);
  assert.equal(s.hearSoundsLocally, false);
});

test('migrates v1 mode → audience', () => {
  const s = migrateSettings({ mode: 'local', enabled: true });
  assert.equal(s.audience, 'local');
  assert.equal(s.activeMode, 'meme');
  assert.equal(s.settingsVersion, 2);
  assert.equal('mode' in s, false);
  assert.equal('enabled' in s, false);
});

test('migrates a disabled v1 install to off, remembering meme mode', () => {
  const s = migrateSettings({ enabled: false });
  assert.equal(s.activeMode, 'off');
  assert.equal(s.lastMode, 'meme');
});

test('keeps per-meme overrides and other prefs', () => {
  const s = migrateSettings({ memes: { noice: { enabled: false } }, detectFps: 20, debug: true });
  assert.deepEqual(s.memes, { noice: { enabled: false } });
  assert.equal(s.debug, true);
  assert.equal(s.detectFps, 20);
});

test('idempotent on v2 settings', () => {
  const v2 = { ...DEFAULT_SETTINGS, activeMode: 'draw', lastMode: 'draw', mirror: true, settingsVersion: 2, memes: {} };
  assert.deepEqual(migrateSettings(v2), v2);
});

test('unknown activeMode falls back to meme', () => {
  assert.equal(migrateSettings({ settingsVersion: 2, activeMode: 'banana' }).activeMode, 'meme');
});

test('defaults for bad connection, draw and spell prefs; bad values fall back', () => {
  const s = migrateSettings(undefined);
  assert.equal(s.badConnKind, 'both');
  assert.equal(s.badConnAutoLeaveSec, 0);
  assert.equal(s.spellStyle, 'strange');
  assert.equal(s.drawColor, 0);
  const bad = migrateSettings({ settingsVersion: 2, badConnKind: 'wifi', badConnAutoLeaveSec: 7, spellStyle: 'gandalf', drawColor: 99 });
  assert.equal(bad.badConnKind, 'both');
  assert.equal(bad.badConnAutoLeaveSec, 0);
  assert.equal(bad.spellStyle, 'strange');
  assert.equal(bad.drawColor, 0);
  const ok = migrateSettings({ settingsVersion: 2, badConnKind: 'audio', badConnAutoLeaveSec: 30, spellStyle: 'doom', drawColor: 3 });
  assert.deepEqual([ok.badConnKind, ok.badConnAutoLeaveSec, ok.spellStyle, ok.drawColor], ['audio', 30, 'doom', 3]);
});
