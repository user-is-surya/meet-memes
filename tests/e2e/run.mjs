// Playwright helpers for end-to-end tests: real Chromium with the unpacked extension,
// a fake camera (tests/e2e/person.y4m, made by `npm run e2e:setup`), and a fake Meet page
// served at https://meet.google.com/harness so the content scripts inject as on Meet.
import { chromium } from 'playwright';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
export const EXT = join(here, '..', '..', 'extension');
const Y4M = join(here, 'person.y4m');
const WEBCAM = join(here, 'webcam.y4m');
const HTML = readFileSync(join(here, 'fake-meet.html'), 'utf8');

export async function open({ effect = 'blur', settings = null, harness = true, audio = '', cam = '', video = 'person' } = {}) {
  if (!video.endsWith('.y4m') && !existsSync(Y4M)) throw new Error('tests/e2e/person.y4m missing: run `npm run e2e:setup`');
  const profile = join(tmpdir(), 'meet-memes-e2e-' + process.pid + '-' + Math.random().toString(36).slice(2));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: !process.env.HEADED,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${video.endsWith('.y4m') ? video : video === 'webcam' ? WEBCAM : Y4M}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  ctx.setDefaultTimeout(20000);
  await ctx.route('https://meet.google.com/harness**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  if (settings) await sw.evaluate((s) => chrome.storage.sync.set({ settings: s }), settings);

  const page = await ctx.newPage();
  page.on('console', (m) => { if (process.env.E2E_LOG) console.log('[page]', m.text()); });
  if (harness) {
    await page.goto(`https://meet.google.com/harness?effect=${effect}&audio=${audio}&cam=${cam}`);
    await page.waitForFunction(() => window.harness && (window.harness.ready || window.harness.error));
    const err = await page.evaluate(() => window.harness.error);
    if (err) throw new Error('harness failed: ' + err);
  }

  const api = {
    ctx, page, sw, extId,
    stats: () => page.evaluate(() => window.harness.stats()),
    eval: (fn, arg) => page.evaluate(fn, arg),
    press: async (keys) => { await page.mouse.click(2, 2); await page.keyboard.press(keys); },
    async remoteFrame() {
      const f = await page.evaluate(() => window.harness.remoteFrameB64());
      return f && { w: f.w, h: f.h, data: Buffer.from(f.b64, 'base64') };
    },
    remoteRms: () => page.evaluate(() => window.harness.remoteRms()),
    wait: (ms) => page.waitForTimeout(ms),
    async waitForEngine(ms = 30000) {
      await page.waitForFunction(() => {
        const r = document.getElementById('meet-memes-root');
        return r && r.dataset.engine === 'ready' && !!r.dataset.memesLoaded;
      }, null, { timeout: ms }).catch(() => {});
    },
    // Waits until person masks are flowing (needed by Thanos / aura / explosions).
    async waitForFaces(n = 5, ms = 60000) {
      await page.waitForFunction((k) => Number(document.getElementById('meet-memes-root')?.dataset.faces) >= k, n, { timeout: ms }).catch(() => {});
    },
    async waitForMasks(n = 8, ms = 60000) {
      await page.waitForFunction((k) => Number(document.getElementById('meet-memes-root')?.dataset.masks) >= k, n, { timeout: ms }).catch(() => {});
    },
    async close() { await ctx.close(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } },
  };
  return api;
}

// --- image metrics on {w,h,data} frames ---
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export function region(f, box) {
  const x0 = Math.round(box.x * f.w), y0 = Math.round(box.y * f.h);
  const x1 = Math.round((box.x + box.w) * f.w), y1 = Math.round((box.y + box.h) * f.h);
  return { f, x0, y0, x1, y1 };
}

export function meanLuma(f, box = { x: 0, y: 0, w: 1, h: 1 }) {
  const { x0, y0, x1, y1 } = region(f, box);
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += lum(f.data, (y * f.w + x) * 4); n++; }
  return s / Math.max(1, n);
}

// Variance of the Laplacian: a standard sharpness score (blur => low).
export function sharpness(f, box = { x: 0, y: 0, w: 1, h: 1 }) {
  const { x0, y0, x1, y1 } = region(f, box);
  const L = (x, y) => lum(f.data, (y * f.w + x) * 4);
  let s = 0, s2 = 0, n = 0;
  for (let y = Math.max(1, y0); y < Math.min(f.h - 1, y1); y++) {
    for (let x = Math.max(1, x0); x < Math.min(f.w - 1, x1); x++) {
      const v = 4 * L(x, y) - L(x - 1, y) - L(x + 1, y) - L(x, y - 1) - L(x, y + 1);
      s += v; s2 += v * v; n++;
    }
  }
  const m = s / Math.max(1, n);
  return s2 / Math.max(1, n) - m * m;
}
