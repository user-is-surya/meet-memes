# Meet Memes v0.2: Foundation + Memes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Effects that survive Meet's blur and virtual backgrounds and reach others with sound. A GPU compositor, mirror mode, three modes, reliable tuned triggers, eight faithful memes, and an in-extension Guide with Practice.

**Architecture:** The MAIN-world scripts hook `RTCPeerConnection`/`RTCRtpSender` so we wrap Meet's *final* outgoing video and audio tracks. Each video frame is handed synchronously, via a DOM event as in v0.1, to the isolated-world content script. The content script composes it with a WebGL2 compositor into `#meet-memes-fx` and returns. Audio: the content script plays meme sounds into a `MediaStream` exposed on a hidden `<audio>` element, and the MAIN world mixes it into the outgoing mic track. Detection stays in the engine iframe. Triggers gain a stability layer, and are tuned on recorded landmark traces replayed in Node tests.

**Tech Stack:** Chrome MV3, plain ES modules (no build step), MediaPipe Tasks Vision (vendored), WebGL2, WebAudio, insertable streams (`MediaStreamTrackProcessor`/`Generator`), Node `node:test`, Playwright (dev only, E2E harness), yt-dlp + ffmpeg via pip (asset script only).

**Spec:** `docs/superpowers/specs/2026-11-08-foundation-and-memes-design.md`

## Global Constraints

- No build step. MAIN-world files are classic scripts; everything else is ES modules.
- **Fail open.** Any exception in our pipeline passes the untouched frame or audio through. The camera and mic must never break.
- Never draw effects or send meme sound while Meet's camera or mic for that track is disabled or muted.
- Compositing budget: ≤ 8 ms per frame at 720p. Over budget, particle counts drop first, never frames.
- Detection: 20–30 fps while a hand is visible, ~8 fps when none is visible.
- Trigger stability: the pose must match in ≥ 70% of detections in its hold window. Exclusive firing by priority. 1.5 s global quiet period after any fire.
- Hotkeys:
  - `Alt+Shift+0` panic/off; `M` Meme; `D` Draw; `S` Spell; `R` mirror;
  - `1` Thanos; `2` Cinema; `3` Noice; `4` Michael Scott; `5` Broccoli; `6` Aura; `7` Emotional Damage; `8` Laser eyes.
- Settings defaults: `activeMode: 'meme'`, `audience: 'everyone'`, `mirror: false`, `soundVolume: 0.7`, `hearSoundsLocally: false`.
- Clips: WebM VP9 + Opus, ≤ 480p, target < 1 MB each, stored in each meme folder. Credit the sources in README.
- Draw and Spell modes are selectable but show "coming soon" until phases 4–5.
- No blur fill anywhere in the Thanos plate.

## Review Focus

1. **Camera turned off/on in Meet mid-effect** (track disabled, or `replaceTrack(null)` then back): nothing is drawn on black frames, and effects resume on the new track. Pinned in Task 2 (harness test `camera-off-no-overlay`).
2. **Muted mic while a meme sound plays:** zero meme audio goes out. Pinned in Task 10 (`sfx gated when source disabled`).
3. **Rejoin, multiple peer connections, or Meet re-adding the same track:** one wrapper per source track, never wrapping our own generator, no leaked processors. Pinned in Task 1 (`reuses wrapper`, `does not wrap own output`, `stops wrapper when sender drops track`).
4. **Camera resolution changes mid-call** (Meet renegotiates on layout or bandwidth): the compositor resizes in the same frame, with no blank or stretched frames. Pinned in Task 5 (harness `resolution-change`).
5. **WebGL2 missing or context lost:** the Canvas2D fallback keeps producing frames with effects. Pinned in Task 5 (harness `context-loss-fallback`).

---

### Task 1: MAIN-world sender hook

Replace v0.1's `getUserMedia`-only wrapping with sender-level wrapping. The `getUserMedia` wrap is kept only as a fallback.

**Files:**
- Create: `extension/main/track-wrap.js`: `MM.wrapVideo(track, onFrame) -> Wrapper`, `MM.wrapAudio(track, mixer) -> Wrapper`
- Create: `extension/main/sender-hook.js`: patches `RTCPeerConnection.prototype.addTrack`, `addTransceiver`, `RTCRtpSender.prototype.replaceTrack`, and the `RTCRtpSender.prototype.track` getter
- Create: `extension/main/bridge.js`: the v0.1 DOM-event frame handoff, extracted from `inject.js`
- Modify: `extension/inject.js`: becomes the bootstrap, plus the `getUserMedia` fallback (used only if no sender track is wrapped within 5 s of a camera track starting)
- Modify: `extension/manifest.json`: MAIN-world content script `js` becomes `["main/bridge.js","main/track-wrap.js","main/sender-hook.js","inject.js"]`
- Test: `tests/sender-hook.test.mjs`: loads the four files with `node:vm` into a sandbox with fake `RTCPeerConnection`, `RTCRtpSender`, `MediaStreamTrackProcessor`, `MediaStreamTrackGenerator`, `MediaStream`

**Interfaces:**
- Produces: global `window.__meetMemes` (`MM`) with:
  - `MM.wrappers: Map<sourceTrack, Wrapper>`;
  - `Wrapper = { source, output, kind, stop() }`;
  - `MM.stats = { videoWrapped: number, audioWrapped: number, path: 'sender'|'gum'|'none', framesOut: number, lastFrameAt: number }`.
- The `RTCRtpSender.track` getter returns the *source* track for wrapped senders, so Meet's own `sender.track` comparisons keep working.
- Each frame: the bridge dispatches `meet-memes-frame` on `#meet-memes-src` after drawing the frame. It sets `root.dataset.sourceEnabled = String(source.enabled)`. It only uses `#meet-memes-fx` when `root.dataset.used === '1'` *and* `source.enabled`.
- Audio: `MM.mixer` (Task 10) is optional. Without it, audio tracks pass through unwrapped.

- [ ] **Step 1: Write the failing tests:**
  - `wraps video on addTrack`: the sender receives the generator; `sender.track` returns the source.
  - `wraps on replaceTrack`.
  - `reuses wrapper` for the same source on two PCs.
  - `does not wrap own output` (`replaceTrack(wrapper.output)` passes through).
  - `stops wrapper when sender drops track`: `replaceTrack(null)` stops the old wrapper once no sender uses it.
  - `passes through when insertable streams missing`.
  - `fails open when processor constructor throws`.
- [ ] **Step 2:** Run `npm test`. Expect FAIL (files missing).
- [ ] **Step 3:** Implement the four files. Ref-count wrappers per source track across senders. Make `generator.stop()` stop the processor pipe but **not** the source (Meet owns the source now). Mirror `source` `ended` onto the output.
- [ ] **Step 4:** Run `npm test`. Expect PASS, including the existing trigger tests.
- [ ] **Step 5:** Run `npm run check`. Expect `✓ all checks passed`. Commit: `feat: wrap Meet's outgoing tracks at the RTCRtpSender`.

### Task 2: E2E harness (fake Meet with fake blur)

**Files:**
- Create: `tests/e2e/fake-meet.html`, which simulates Meet:
  1. `getUserMedia` (camera + mic);
  2. its own "background effect": canvas blur of the whole frame, then `canvas.captureStream()`, then that track;
  3. `pc1.addTrack` → loopback → `pc2`;
  4. the received video shown in `<video id="remote">`;
  5. buttons and window hooks for `camOff()`, `camOn()`, `mute()`, `setRes(w,h)`.
- Create: `tests/e2e/run.mjs`: Playwright persistent Chromium with `--load-extension=extension`, `--use-fake-device-for-media-stream`, `--use-file-for-fake-video-capture=tests/e2e/person.y4m`. It routes `https://meet.google.com/harness` to `fake-meet.html` and exports helpers: `open()`, `remoteFrame() -> ImageData`, `press(keys)`, `stats()` (reads `__meetMemes.stats`).
- Create: `tests/e2e/pipeline.e2e.mjs`
- Create: `scripts/make-y4m.mjs`: converts a short public-domain or self-recorded clip to a 640×360 15 fps `person.y4m` (gitignored, generated by `npm run e2e:setup`)
- Modify: `package.json` scripts: `"e2e:setup"`, `"e2e": "node --test tests/e2e/*.e2e.mjs"`. Add devDependency `playwright`.

**Interfaces:**
- Consumes: `__meetMemes.stats` (Task 1).
- Produces: `tests/e2e/run.mjs` helpers used by later tasks' E2E tests.

- [ ] **Step 1:** Write the E2E tests:
  - `sender-path-active`: `stats.path === 'sender'`, `framesOut > 30`.
  - `effect-drawn-after-blur`: press `Alt+Shift+2`, wait 500 ms. A remote-frame region has high-contrast white text pixels: Laplacian variance in the lower-third box > 3× the same box before the press, proving it's drawn after the blur.
  - `camera-off-no-overlay`: call `camOff()`, press `Alt+Shift+2`; the remote frame mean luminance stays < 10.
- [ ] **Step 2:** Run `npm run e2e:setup && npm run e2e`. Expect `sender-path-active` and `camera-off-no-overlay` PASS. `effect-drawn-after-blur` may PASS on the v0.1 overlay renderer; it must not FAIL because of blur.
- [ ] **Step 3:** Fix whatever fails in Task 1 code.
- [ ] **Step 4:** Add a popup status line "Effects path: after Meet effects ✓ / before Meet effects (fallback) ⚠", from `stats.path` relayed via the content script `status()`. Commit: `test: e2e harness with fake Meet background effect`.
- [ ] **Step 5: USER CHECKPOINT (go/no-go).** Ask the user to load the unpacked extension, join a real Meet call (a second device or a friend), and check three cases: blur on, virtual background on, no effect. In each, press `Alt+Shift+2` and confirm the popup shows "after Meet effects ✓" and the other side sees crisp text. If any case fails, stop and bring options to the user (spec §1.1).

### Task 3: Settings v2 + modes + shortcuts

**Files:**
- Modify: `extension/src/shared/settings.js`: add `SETTINGS_VERSION = 2`, `migrateSettings(raw) -> settings`, new defaults (Global Constraints). Rename `mode` to `audience`.
- Create: `extension/src/content/modes.js`: `class ModeController { constructor(app); get active(); set(mode); handleKey(e) -> boolean }`. Handles `Alt+Shift+M/D/S/R/0`, saves via `saveSettings`, and toasts "Meme mode" and so on. Draw and Spell toast "coming soon" but still switch.
- Modify: `extension/src/content/main.js`: gesture triggers run only when `activeMode === 'meme'`. Meme hotkeys work in any mode except `off`. `enabled` becomes derived (`activeMode !== 'off'`). Keep `Alt+Shift+0` as a toggle between `off` and the last non-off mode.
- Test: `tests/settings.test.mjs`

- [ ] **Step 1:** Write tests:
  - `migrates v1 mode→audience`: `{mode:'local'}` → `{audience:'local', activeMode:'meme', settingsVersion:2}`.
  - `migrates disabled`: `{enabled:false}` → `activeMode:'off'`, `lastMode:'meme'`.
  - `keeps memes overrides`.
  - `idempotent on v2`.
- [ ] **Step 2:** Run `npm test`. Expect FAIL.
- [ ] **Step 3:** Implement `migrateSettings`, and call it inside `getSettings`.
- [ ] **Step 4:** Run `npm test`. Expect PASS. Update `popup.js`, `options.js` and `popup.html` for the `audience` rename.
- [ ] **Step 5:** Commit: `feat: settings v2 with modes and mode shortcuts`.

### Task 4: Mode UI (popup + in-page pill)

**Files:**
- Modify: `extension/popup/popup.html` and `popup.js`. Add a segmented control Off/Meme/Draw/Spell (Draw and Spell show a "soon" tag), a Mirror switch, a "Sound volume" slider, a "Hear meme sounds myself" switch, and an "Open guide" button.
- Create: `extension/src/content/pill.js`: `class Pill { constructor({getState, onMode, onMirror, onGuide}); mount(); update(state); }`
  - A shadow-DOM floating control, draggable, with its position saved in `chrome.storage.local.pillPos`. Default bottom-left above Meet's toolbar.
  - Shows mode icons (🎭 ✏️ ✨), a mirror toggle and a ❔ guide button. It collapses to a 32 px dot when idle for 4 s.
  - Never captured into video (DOM only).
- Modify: `extension/src/content/main.js`: mount the pill and wire it to `ModeController`.
- Test: E2E `pill-switches-mode` in `tests/e2e/ui.e2e.mjs`: click the ✏️ button, and `stats()` plus storage show `activeMode === 'draw'`. Press `Alt+Shift+M` and it is back to meme.

- [ ] **Step 1:** Write the E2E test. **Step 2:** Run it; expect FAIL. **Step 3:** Implement. **Step 4:** Run it; expect PASS. **Step 5:** Commit: `feat: mode switcher in popup and in-page pill`.

### Task 5: WebGL2 compositor, mirror, adaptive quality

**Files:**
- Create: `extension/src/gfx/gl.js`: `createGL(canvas) -> {gl, program(vs,fs), texture(), uploadFrame(tex, source), fullscreenPass(program, uniforms, target)}`
- Create: `extension/src/gfx/compositor.js`: `class Compositor { constructor(fxCanvas); resize(w,h); beginFrame(src: HTMLCanvasElement, {mirror}) ; get frameTex(); drawLayer(fn); endFrame(); lost: boolean }`
  - `beginFrame` uploads `src` into `frameTex`, flipped when mirror is on. All effects and detection work in this (possibly mirrored) space.
- Create: `extension/src/gfx/graphics.js`: the effect-facing API, implemented twice: `GLGraphics` and `Canvas2DGraphics` (the fallback):
  - `drawFrame({tint?, mono?, contrast?, zoom?:{cx,cy,scale}, shake?:{x,y}})`
  - `drawImage(img, x, y, w, h, {alpha=1, rotate=0, blend='normal'|'add'})`
  - `drawText(text, x, y, {size, font, fill, stroke, strokeWidth, align, glow})`: renders via a 2D scratch canvas, then a texture
  - `drawPerson(maskTex, {alphaScale})`
  - `particles(ps: ParticleSystem)`
  - `pass(name, uniforms)`: named shader passes, registered via `registerPass(name, fs)`
  - All coordinates are normalized 0..1 of frame width and height.
- Create: `extension/src/gfx/particles.js`: `class ParticleSystem { constructor(max); spawn(n, init(i, out)); step(dt, forces); count }`. Uses typed arrays (x, y, vx, vy, life, size, rgba); CPU step; instanced draw in GL, rect fill in Canvas2D.
- Create: `extension/src/gfx/budget.js`: `class FrameBudget { constructor(targetMs=8); record(ms); get quality() /* 0.25..1 */ }`. Lower by 0.1 after 10 consecutive frames over budget; raise by 0.05 after 60 under 70% of budget.
- Modify: `extension/src/content/main.js`. `onFrame` uses the Compositor.
  - When `mirror` is on, output is always produced (`used = '1'`) even with no active effect.
  - Detection uses `createImageBitmap(compositor.baseCanvas)`, the mirrored base, so landmarks match render space.
- Modify: `extension/src/renderers/*.js`: port the v0.1 renderers (overlay, fullscreen, face-in-frame, aura, throw) to the `graphics` API so nothing regresses before Tasks 12–18 replace them.
- Test: `tests/budget.test.mjs`. Test: `tests/e2e/gfx.e2e.mjs`:
  - `mirror-flips-frame`: a fake-camera frame with a left-side marker shows the marker on the right in the remote view.
  - `mirror-text-readable`: Alt+Shift+2 with mirror on; template-match "CINEMA" against the unflipped glyph raster scores better than flipped.
  - `resolution-change`: `setRes(1280,720)` then `(640,360)`; no remote frame with mean luminance < 10 in the next 30 frames.
  - `context-loss-fallback`: `WEBGL_lose_context.loseContext()` via a debug hook `__meetMemesDebug.loseGL()`; effects keep rendering (same check as `effect-drawn-after-blur`).
- [ ] **Step 1:** Write the tests (unit `budget`: `drops after sustained overrun`, `recovers slowly`, `clamps 0.25..1`). **Step 2:** Run them; expect FAIL. **Step 3:** Implement. **Step 4:** Run `npm test && npm run e2e`; expect PASS. **Step 5:** Commit: `feat: WebGL2 compositor with mirror and Canvas2D fallback`.

### Task 6: Self-view replacement + charge ring

**Files:**
- Create: `extension/main/self-view.js` (MAIN world, added to the manifest list before `inject.js`). It watches `HTMLMediaElement.prototype.srcObject` assignments and a `MutationObserver` for `<video>` elements whose `srcObject` contains a wrapped *source* track. For those, it swaps in a `MediaStream([wrapper.output])`. CSS: `transform: scaleX(-1)` when `root.dataset.mirror !== '1'`, `none` when mirror is on (spec §6 call).
- Create: `extension/src/content/charge-ring.js`: `class ChargeRing { show(memeId, progress 0..1, anchor {x,y} normalized); hide(memeId) }`. A DOM overlay positioned over the self-view element's bounding box (found via `[data-meet-memes-self]`, which `self-view.js` sets), and over the floating preview.
- Modify: `extension/src/content/preview.js`: the preview draws the ring too.
- Test: E2E `self-view-shows-output`: the harness's local `<video id="self">` gets the wrapper output (sample: the Cinema text appears in the self-view after the hotkey).
- [ ] Steps 1–5 as usual. Commit: `feat: self-view shows exactly what others see, plus charge ring`.

### Task 7: Trigger stability layer + adaptive detection rate

**Files:**
- Modify: `extension/src/triggers/index.js`.
  - Replace `single()` hold logic with `stable(test, {holdMs, ratio=0.7})`: keep a ring buffer of `{t, hit}`. Active when the window `[now-holdMs, now]` has ≥ 2 samples, ≥ 70% are hits, and the newest sample is a hit. Pulse triggers bypass it.
  - Export `class TriggerArbiter { constructor({quietMs=1500}); decide(candidates: {id, priority, active, info}[], now) -> {fireId|null, progress: Map<id, 0..1>} }`.
- Modify: `extension/src/content/main.js`: use the arbiter. `progress` feeds `ChargeRing`. Detection interval:
  - 33 ms when the last result had a hand;
  - 125 ms otherwise;
  - 33 ms while any face-only trigger is mid-hold.
- Modify: `extension/memes/*/meme.json`: add `"priority"` per spec §2 table.
- Test: `tests/triggers.test.mjs` additions:
  - `stable fires at 70% with dropouts`: 10 samples over 500 ms with 3 misses, fires.
  - `stable rejects flicker`: alternating hit/miss doesn't fire.
  - `arbiter picks higher priority`.
  - `arbiter quiet period blocks second fire within 1500 ms`.
  - `arbiter progress reports partial holds`.
- [ ] Steps 1–5. Commit: `feat: stable gesture recognition, priorities and quiet period`.

### Task 8: Trace format, recorder core, replay tests

**Files:**
- Create: `extension/src/shared/trace.js`: `TRACE_VERSION = 1`; `class TraceRecorder { start(label); push(det, now, audioEvents); stop() -> Trace }`.
  - `Trace = {version, label, aspect, frames: [{t, hands:[{landmarks, handedness, gesture}], face:{box, nose, blendshapes, eyes?, pose?}|null}], transients: number[]}`.
  - Landmarks are rounded to 4 decimals. No images.
- Create: `tests/replay.mjs`: `replay(trace, memeDefs) -> {fires: {id, t}[]}`. It drives `createTrigger` + `TriggerArbiter` exactly as `main.js` does, with a fake audio object fed from `trace.transients`.
- Create: `tests/fixtures/README.md`, describing the expected files: `gesture-<memeId>.json` (5 reps) and `normal-*.json`.
- Create: `tests/traces.test.mjs`. For every fixture:
  - `gesture-<id>`: fires `<id>` exactly 5 times and nothing else.
  - `normal-*`: fires nothing.
  - It skips with a clear message when there are no fixtures.
- Test: `tests/replay.test.mjs` with a synthetic trace built from the v0.1 `hand()` helper, proving the replay machinery works (Thumb_Up beside face × 2 → 2 Noice fires once Task 14 lands; until then use the Absolute Cinema both-hands-up trace).
- [ ] Steps 1–5. Commit: `feat: landmark traces and replay-based trigger tests`.

### Task 9: Guide page + Practice + trace export

**Files:**
- Create: `extension/guide/guide.html`, `guide.css` (reuses `popup/ui.css` tokens; light and dark; usable at ≥ 360 px), `guide.js`.
  - Sections per spec §3: Start here · Meme mode (cards generated from `meme.json`) · Draw mode (soon) · Spell mode (soon) · Utilities · Practice · Troubleshooting.
- Create: `extension/guide/practice.js`: opens the camera on the guide page and runs MediaPipe directly (extension page; reuse `engine/engine.js` logic by importing a shared `engine/detector.js` split out of `engine.js`).
  - Pick a meme: live recognition meter (the `stable` window ratio) + charge ring + "Try it" (renders the effect on the camera with `Compositor`).
  - Record trace: guided "Do the gesture 5 times" (60 s max) and "Act normal for 2 minutes" with a countdown. Export downloads `gesture-<id>.json` / `normal-<n>.json`.
- Create: `extension/engine/detector.js`: `createDetector() -> {ready: Promise, detect(bitmap, {mask, ts}) -> {hands, face, mask}}`. `engine.js` becomes a thin postMessage wrapper around it.
- Modify: `extension/engine/engine.js`, `extension/manifest.json` (`web_accessible_resources` unchanged; guide is an extension page). `background.js`: open the guide `onInstalled` (`reason === 'install'`, or a minor-version bump) at `#whats-new`.
- Modify: `meme.json` schema: add `origin`, `whatHappens`, `tips` (string arrays allowed), `illustration` (SVG file name). Modify `scripts/check.mjs`: require `origin`, `whatHappens` and `how` for bundled memes, and validate new trigger and render types as they're added.
- Test: `npm run check` passes. E2E `guide-renders-cards`: open `chrome-extension://<id>/guide/guide.html`; there are 8 cards, each with non-empty "What it is / What happens / How to trigger", and a hotkey chip.
- [ ] Steps 1–5. Commit: `feat: in-extension guide with practice and trace recorder`.
- [ ] **Step 6: USER CHECKPOINT (non-blocking).** Ask the user to record traces for the gestures as each meme lands (Tasks 12–18), plus two `normal` traces, and drop the files into `tests/fixtures/`. Continue building meanwhile.

### Task 10: Meme sound to the call

**Files:**
- Create: `extension/main/audio-mix.js` (MAIN world, in the manifest list): `MM.mixer = { wrap(track) -> Wrapper }`.
  - AudioContext 48 kHz: `MediaStreamSource(source)` + `MediaStreamSource(sfxStream)` → `GainNode sfxGain` → `MediaStreamDestination`; output track → sender.
  - `sfxStream` is read from `document.getElementById('meet-memes-sfx').srcObject`.
  - Gating: `sfxGain.gain` is set to 0 whenever `!source.enabled || source.muted || source.readyState !== 'live'`. Checked on every `sfx-play` DOM event and every 100 ms.
  - Pure helper: `MM.sfxAllowed({enabled, muted, readyState}) -> boolean`.
- Create: `extension/src/content/sfx.js`: `class SfxBus { constructor(); async load(key, bytes) ; play(key, {volume, loop=false}) -> handle{stop()}; stopAll() }`.
  - Own AudioContext → `MediaStreamDestination`, exposed on hidden `<audio id="meet-memes-sfx" muted>`.
  - Optional local monitor through `ctx.destination` when `hearSoundsLocally` is on.
  - Volume = `settings.soundVolume`. Dispatches `sfx-play` on the element.
- Create: `extension/src/content/synth.js`: `cinemaBoom(ctx) -> AudioBuffer`, a synthesized low boom: 40→28 Hz sine sweep + noise burst, 1.6 s decay.
- Modify: `extension/src/content/main.js` + `renderers/base.js`: `Effect.fire` plays `def.sound` (if any) via `deps.sfx`. `Effect.stop` stops it.
- Test: `tests/audio-mix.test.mjs` (vm): `sfx gated when source disabled`, `gated when muted`, `allowed when live and enabled`, `wrap fails open without AudioContext`.
- Test: E2E `sound-reaches-remote`: Alt+Shift+2 raises remote audio RMS (pc2 `AnalyserNode`) by > 12 dB over the baseline within 300 ms. `muted-sends-no-sound`: after `mute()`, same press, RMS rises < 1 dB.
- [ ] Steps 1–5. Commit: `feat: mix meme sounds into the outgoing audio`.

### Task 11: Clip assets + clip player

**Files:**
- Create: `extension/memes/clips.json`: per meme id `{url, in, out, maxHeight:480, audioOnly?:bool}`, with the values from spec §1.8:
  - fanum-broccoli `mq-evz4bpZ4` 0.0–5.5;
  - noice `RmTNdjd2nQQ` 0.6–2.0;
  - emotional-damage `InaAKIjzXuE` 0.5–4.4;
  - michael-scott `umDr0mPuyQc` 3.2–8.0;
  - thanos-snap `AaZs5xsvu7A` 0.8–2.0 audioOnly;
  - laser-eyes `Utyfma7bBlc` 0.1–3.0 audioOnly.
- Create: `scripts/clips.mjs` (`npm run clips`): runs `python -m yt_dlp` + imageio-ffmpeg to produce `memes/<id>/clip.webm` (VP9 crf 36, Opus 96k) or `sound.ogg`. Prints sizes and fails if any is > 1.5 MB.
- Create: `extension/src/content/clip-player.js`: `class ClipPlayer { constructor(engine); async load(def) ; start(now) ; frameAt(now) -> ImageBitmap|null ; get duration ; stop() }`.
  - Video decoding happens in the engine iframe: a `<video>` from the extension URL; frames are posted as transferred `ImageBitmap` via `requestVideoFrameCallback` while playing; the newest is kept, the older closed.
  - Audio is decoded in the content script from the clip bytes (`decodeAudioData`) and played through `SfxBus`, so it reaches the call.
- Modify: `extension/engine/engine.js`: message types `clip-load`, `clip-play`, `clip-stop`.
- Test: E2E `clip-plays`: firing Noice via hotkey, the remote frame bottom-right region changes over 1 s (frame difference > threshold at two times), and remote audio RMS rises.
- [ ] Steps 1–5 (run `npm run clips`, commit the assets with a README credits section). Commit: `feat: bundled meme clips with in-call playback`.

### Task 12: Thanos snap rebuild

**Files:**
- Create: `extension/src/fx/bg-model.js`: `class BackgroundModel { constructor(w,h) /* half-res */; learn(frameRGBA, personMask, w, h); confidence(i) ; snapshot() -> {rgba, known: Uint8Array} }`.
  - A pixel is learned only where the mask, dilated by `max(3, w/90)` px, < 0.2.
  - Exponential update α = 0.15 for already-known pixels; first sight copies.
- Create: `extension/src/fx/inpaint.js` (pure, worker-safe): `inpaint(rgba, known, w, h, {patch=7, iters=4}) -> rgba`. PatchMatch-style: nearest-neighbour field from unknown patches to fully-known source patches, random init, propagation + random search, then a vote. Coarse-to-fine over 3 pyramid levels.
- Create: `extension/src/fx/inpaint-worker.js`, loaded as `new Worker(chrome.runtime.getURL(...))`. If the worker is blocked by page CSP, run it inside the engine iframe instead (message `inpaint`). Builder's call based on what works in the harness.
- Rewrite: `extension/src/renderers/thanos.js`, a state machine:
  - `idle → pause(800 ms) → dissolving(3000 ms) → gone → returning(1500 ms) → idle`; `autoReturnMs` 20000.
  - Dissolve front: noise threshold field `f(x,y) = dirDist(x,y) + 0.25*fbm(x,y)` swept from the side opposite the snapping hand.
  - Ash band = the 20% of the sweep ahead of the front: lerp toward ash `#3b2e25`, desaturate 80%, darken 35%.
  - Particles spawn from mask pixels crossed by the front each frame, ≤ `60000*quality` alive. Colour starts as the source pixel and lerps to ash over 300 ms. Size 1.5–3 px (10% chunks 4–6 px). Forces: drag 1.2/s, curl-noise turbulence, wind `(+0.35, -0.12)` frame/s × `render.wind` direction-signed, gravity 0.15 on chunks. Life 2–3.5 s with fade.
  - Behind the front: the plate (inpainted snapshot taken at snap time; the fill starts at snap and must finish within 800 ms at half-res. If late, the region shows the known-plate nearest-fill from a fast distance-transform fill, never blur).
  - Return: orange-gold shimmer particles `#ffb347` converge onto the current person mask; person alpha ramps from the mask edges inward.
- Modify: `extension/memes/thanos-snap/meme.json`: `sound: "sound.ogg"`, plus guide fields.
- Test: `tests/inpaint.test.mjs`:
  - `fills hole with source texture`: a 64×64 checkerboard (8 px squares) with a 20×20 hole. Filled pixels are all within 10 of {0,255} per channel (no blur greys), and ≥ 80% of the hole's 8×8 blocks are uniform.
  - `no unknown pixels remain`.
  - `respects known pixels`.
- Test: `tests/thanos-schedule.test.mjs`: pure `dissolveProgress(t)` and the state machine (`snap→pause→dissolving at 800ms`, `second snap while gone → returning`, `autoReturn at 20 s`).
- Test: E2E `thanos-no-blur`: after Alt+Shift+1 + 5 s, the remote frame's person region (from the harness's known person box in `person.y4m`) has Laplacian variance ≥ 50% of the background region's variance. A blur fill would score ≪.
- [ ] Steps 1–5. Commit: `feat: cinematic Thanos snap with content-aware empty room`.

### Task 13: Absolute Cinema rebuild

**Files:**
- Modify: `extension/src/triggers/index.js` `both-hands-up`: add a finger-spread requirement (mean angle between adjacent fingertip vectors from the MCPs > 8°), palm facing camera (`Open_Palm` gesture label score ≥ 0.5, or `isOpen`).
- Create: `extension/src/renderers/cinema.js` (`render.type: "cinema"`):
  - a 1-frame white cut;
  - `drawFrame({mono:true, contrast:1.35, zoom:{face centre, scale: 1→1.06 over the hold}})`;
  - passes `vignette` (strength 0.55), `grain` (0.06) and `flicker` (±3% luminance at 12 Hz noise);
  - text: "ABSOLUTE" at y = 0.80, size 0.055h, weight 800; "CINEMA" at y = 0.90, size 0.15h, condensed bold (`"Arial Narrow", "Roboto Condensed", Impact, sans-serif`), white, glow 0.4;
  - hold min 2000 ms, linger 1000 ms, colour fade-back 300 ms;
  - sound: `synth.cinemaBoom`.
- Modify: `memes/absolute-cinema/meme.json`, `scripts/check.mjs` RENDERS, renderer index.
- Test: unit `both-hands-up rejects closed fingers` and `accepts spread palms`. E2E covered by `effect-drawn-after-blur`.
- [ ] Steps 1–5. Commit: `feat: Absolute Cinema turns you into the poster`.

### Task 14: Noice

**Files:**
- Modify: `extension/src/content/audio.js`: rename to `TransientListener`, with `lastSpikeAt` plus `kind` ('snap' | 'click'). A click is a transient with peak > `max(0.08, floor*4)`, crest > 6, duration < 25 ms (energy back under 30% within 2 ticks). Keep the `SnapListener` export alias.
- Modify: `extension/src/triggers/index.js`: new `thumb-by-face` condition. A `Thumb_Up` (score ≥ 0.6) whose palm is within 0.6 face-widths horizontally of the face box edge and vertically within the face box ±20%. With a mic: fires on a click within 400 ms while the pose is held ≥ 200 ms. Without a mic: hold 1200 ms.
- Create: `extension/src/renderers/clip-pop.js` (`render.type: "clip-pop"`), used by Noice:
  - clip box bottom-right, height 0.35h, 150 ms scale-in with overshoot `easeOutBack`, 200 ms scale-out;
  - a `punchAt` ms (from meme.json, the "noice" moment) triggers a face punch-zoom 1.15× (150 ms in, 400 ms out);
  - caption "*click*" in white italic with a dark outline at the clip's bottom centre;
  - clip audio via `ClipPlayer`.
- Modify: `memes/noice/meme.json`: trigger `thumb-by-face`, `punchAt`, guide fields.
- Test: unit `thumb by face needs click with mic`, `thumb at chest never fires`, `no-mic fallback holds 1200ms`, `click detector ignores speech-like envelope` (feed synthetic buffers to a pure `classifyTransient(samples)`).
- [ ] Steps 1–5. Commit: `feat: Noice with tongue-click trigger and punch zoom`.

### Task 15: Fanum broccoli

**Files:**
- Modify: `extension/src/triggers/index.js`: new `plate-throw` condition, a state machine:
  - **plate:** both hands, palms up (wrist below the MCPs is *not* required; use: both `isOpen`, both palms at y between face-box bottom and face-box bottom + 2 face heights, the hands' horizontal gap < 3 face widths). Hold ≥ 400 ms (stable 70%). Emits `info.phase = 'plate'` with the plate centre and span. It is the meme's `hold` signal.
  - **throw:** within 4 s of the plate state, either palm moves up and outward by ≥ 0.9 face heights within 350 ms and ends above shoulder height (face-box bottom). Fires with `info.side = 'left'|'right'`.
  - A sweep without a prior plate state never fires.
- Create: `extension/src/renderers/broccoli.js` (`render.type: "broccoli"`):
  - `onPlate(info)` shows the plate sprite (procedural: white ellipse plate with a soft shadow + 7 broccoli florets drawn from cached 2D canvas paths) tracked to the palms;
  - on fire: an arc tween over the shoulder, 600 ms, scale 1→0.35, rotation 540°, florets scattering;
  - at 250 ms after the apex: a 1-frame white flash (repeated at +2.2 s like the edit);
  - explosion **behind the person**: draw the explosion layer, then `drawPerson(mask)` on top with a warm rim (`pass('rim', {color:#ff9a3c, width: 0.006})`);
  - explosion = shader pass `explosion` (fbm fireball, radius 0→0.6h over 500 ms, colour ramp white→yellow→orange→dark smoke) + ember particles (≤ 3000·quality) + debris chunks (≤ 60) + smoke billows;
  - duration 3000 ms + 1000 ms clear;
  - sound: clip audio from 0.75 s (the boom).
- Modify: `memes/fanum-broccoli/meme.json` (render type, `showClip:false`, guide fields).
- Test: unit `plate then sweep fires`, `sweep alone never fires`, `plate expires after 4 s`, `casual wave with open hands does not fire`.
- [ ] Steps 1–5. Commit: `feat: Fanum broccoli plate fling with explosion behind you`.

### Task 16: Emotional Damage

**Files:**
- Modify: `extension/src/triggers/index.js`: new `hand-on-chest` condition. One hand `isOpen` or flat (mean reach > 1.45); palm centre below the face box bottom by 0.3–1.6 face heights; horizontally within ±0.9 face widths of the nose; the hand's facing normal roughly toward the camera (|palm z-spread| small: landmark z std < 0.04). Hold 350 ms.
- Create: `extension/src/renderers/damage.js` (`render.type: "damage"`):
  - crash zoom 1.0→1.6× on the face in 120 ms; handheld shake 1500 ms (fbm offsets ±1.5% frame, rotation ±1.2°); ease out 400 ms;
  - red vignette flash (`pass('vignette', {color:#ff1a1a, strength 0.8→0 over 600 ms})`);
  - text "EMOTIONAL DAMAGE", impact font stack (`Impact, "Anton", "Arial Black", sans-serif`), white fill, red `#d10000` stroke, slam-in 1.4→1.0 scale over 160 ms, shaking with the camera;
  - total 2500 ms;
  - sound: clip audio.
- Modify: `memes/emotional-damage/` (new folder, `index.json`, hotkey `Alt+Shift+7`, priority 5).
- Test: unit `hand on chest fires after 350ms`, `hand on chin does not fire`, `hands-over-face does not fire damage`.
- [ ] Steps 1–5. Commit: `feat: Emotional Damage meme`.

### Task 17: Laser eyes

**Files:**
- Modify: `extension/engine/detector.js` face info: add `eyes: {left:{x,y,r}, right:{x,y,r}}` from iris landmarks 468–472 / 473–477 (`r` = iris radius), and `pose: {yaw, pitch}` from `outputFacialTransformationMatrixes: true` (radians).
- Modify: `extension/src/triggers/index.js`: new `stare` condition: `eyeWideLeft` and `eyeWideRight` ≥ 0.35, `browInnerUp` ≥ 0.45, `(browOuterUpLeft+browOuterUpRight)/2` ≥ 0.35, and no hand palm within 1.2 face boxes of the face. Hold 900 ms.
- Modify: `extension/src/content/main.js`: the face position used by effects is interpolated between detections (linear extrapolation over ≤ 100 ms from the last two samples, clamped) so flares stick to the eyes.
- Create: `extension/src/renderers/laser.js` (`render.type: "laser"`, `hold: true`):
  - flares: additive radial core (white→`#ff2a2a`), r grows 0→6·irisR over 300 ms, horizontal anamorphic streak width 0.5 frame, slight 20 Hz flicker;
  - after 600 ms, beams: from each eye along the direction `(sin yaw, -sin pitch)`, projected to the frame edge, core 0.004h white + glow 0.02h red, additive; sparks at the frame-edge exit (≤ 400·quality particles);
  - release: beams cut, flares fade 300 ms;
  - sound: looped hum via `SfxBus` while active.
- Modify: `memes/laser-eyes/` (new; hotkey `Alt+Shift+8`, priority 7).
- Test: unit `stare fires after 900ms`, `brief surprise (400ms) does not fire`, `stare with hand on face does not fire`.
- [ ] Steps 1–5. Commit: `feat: laser eyes`.

### Task 18: Michael Scott + Feel the aura polish

**Files:**
- Modify: `extension/src/renderers/fullscreen.js`: supports `clip`, plays via `ClipPlayer` in "contain" fit over `drawFrame({blur?})`. The background is a darkened copy of the frame (`contrast 0.6, brightness 0.35`, **no blur**, consistent with the no-blur anti-goal). Early end: if the trigger has been inactive for 1000 ms after the first 1500 ms, fade out 250 ms.
- Modify: `extension/src/renderers/aura.js`: GPU version. Person-mask-hugging glow (`pass('maskGlow', {color:#b26bff, radius 0.03h, pulse 1.2 Hz})`) + rising wisps (≤ 1500·quality particles spawned on mask edges, upward 0.12 h/s, curl noise) + caption "+1000 AURA".
- Modify: both `meme.json` files (clip, guide fields).
- Test: unit `fullscreen early end after release`. E2E `clip-plays` covers playback.
- [ ] Steps 1–5. Commit: `feat: Michael Scott clip and GPU aura`.

### Task 19: Guide content, illustrations, What's new

**Files:**
- Create: `extension/guide/illustrations/<memeId>.svg`, 8 simple line drawings of the pose (head outline + hands), 240×180, `currentColor` strokes so they theme.
- Modify: each `meme.json`: final `origin`, `whatHappens`, `how`, `tips` copy. Plain words; each "how" names the pose, the hold time and the hotkey.
- Modify: `extension/guide/guide.js`: the `#whats-new` section lists v0.2 changes. Each card has "Preview on my camera" → Practice with that meme selected. A clip-trim confirm control is shown only when `debug` is on, so the user can nudge in/out points; it saves overrides to `chrome.storage.local.clipTrim` and prints the JSON to copy back into `clips.json`.
- Modify: `README.md` (v0.2 features, credits for the clips), `docs/ADDING_MEMES.md` (new render and trigger types, guide fields), `CHANGELOG.md`.
- Test: `npm run check`; E2E `guide-renders-cards` (Task 9) now also checks that the illustrations load.
- [ ] Steps 1–5. Commit: `docs: guide content and illustrations for all memes`.

### Task 20: Tune on real traces + release

- [ ] **Step 1:** Ensure the user's fixtures are in `tests/fixtures/` (Task 9 checkpoint). If missing, ask and wait. Don't release untuned.
- [ ] **Step 2:** Run `npm test`. For each failing `traces` test, adjust only that meme's thresholds in its `meme.json` trigger spec (not code defaults) until gestures fire 5/5 and the normal traces fire 0.
- [ ] **Step 3:** Run `npm test && npm run check && npm run e2e`. Expect all PASS.
- [ ] **Step 4: USER CHECKPOINT.** The user tries every meme in a real call (the guide's checklist in Troubleshooting) and confirms the clip trims by ear.
- [ ] **Step 5:** Run `npm run bump -- 0.2.0`, update the changelog, commit `release: v0.2.0`. Tag and push only after the user says so.
