# Meet Memes v0.2: Foundation, Memes and Guide (design)

Status: draft for approval. Phases 1 and 2 of 5. Bad connection (3), Air drawing (4) and Spells (5) get their own design docs later; this doc only reserves room for them (modes, guide sections, hotkeys).

## Why

Meet Memes v0.1 works in principle but falls short in three ways the user hit:

1. **Effects break with Meet's background blur or virtual background.** We draw on the raw camera frame, then Meet's segmenter treats our graphics as "background" and blurs or replaces them.
2. **Visible blur in the Thanos empty room.** Never-seen background pixels are filled with a `blur(24px)` copy of the first frame (`extension/src/renderers/thanos.js:38`), leaving a smeared person-shaped ghost.
3. **Memes are not faithful to the originals**, and triggers have never been tested on a real person. The user wants every meme to fire when intended, never at random, and to look "top-notch".

The user also wants a mirror option, three switchable modes (Meme / Draw / Spell) and a guide inside the extension.

## Goals

- Every effect looks the same to others whether Meet's blur, virtual background or no effect is on.
- Effects are smooth: our compositing never drops frames below the camera rate, and animation timing is unaffected by network quality.
- Each meme is recognisably the real meme, and has its own trigger that cannot be confused with another meme's.
- Triggers are tuned on recordings of the user's real hands and face. A test suite proves zero false fires on "normal meeting" recordings.
- Meme sounds reach other participants.
- A mode system (Meme / Draw / Spell) switchable by a button and a keyboard shortcut.
- Mirror mode: others see the user's video flipped, matching the selfie view.
- A built-in Guide explains every meme, mode and utility: what it is, what happens, how to trigger it. Its practice tab lets the user rehearse each gesture with a live meter.

## Non-goals (this phase)

- Bad connection, air drawing and spells: their own docs. This phase only builds the mode switch and guide structure they plug into.
- Browsers other than Chrome/Edge (we rely on insertable streams).
- Controlling what Meet shows on *other* people's screens beyond our video and audio track.

## Anti-goals (failure even if it technically works)

- A meme fires during normal talking, nodding, drinking or a casual thumbs up.
- Any visible blur or smear patch in the Thanos empty room.
- Stutter, frozen frames or audio glitches caused by us, including on slow internet.
- Meme text arriving mirrored or unreadable for other people.
- If anything in our pipeline throws, the user's camera or mic must keep working untouched (fail open, as v0.1 does).

## Constraints

- Manifest V3 Chrome extension, plain ES modules, no build step (matches the current repo). MediaPipe Tasks Vision is already vendored: gesture recognizer, face landmarker with blendshapes, selfie segmenter.
- The public repo bundles the meme clips. This was the user's explicit decision; credit the sources in README.
- Existing user settings and custom memes from v0.1 must keep working (migrate settings).

---

## 1. Foundation

### 1.1 Move the effects to the outgoing stream ("sender hook")

Today `inject.js` wraps `getUserMedia`, so Meet's blur and replacement run *after* our drawing. Instead, hook the point where Meet hands its final, already-processed track to WebRTC:

- In the MAIN world at `document_start`, patch `RTCPeerConnection.prototype.addTrack`, `addTransceiver` and `RTCRtpSender.prototype.replaceTrack`. When the track is video (and, separately, audio), wrap it with `MediaStreamTrackProcessor` → our transform → `MediaStreamTrackGenerator`, and pass the generator on instead.
- Cache the wrapper per source track. `replaceTrack` toggles (camera off/on, effect changes) must reuse or tear down wrappers cleanly, so the number of wrappers never grows.
- Keep a `getUserMedia` wrap only to (a) obtain the **raw mic** for snap and click detection and (b) fall back to the v0.1 path if the sender hook never sees a track within a few seconds of the camera starting.
- **Spike first.** Before anything else, verify on a live Meet call that the sender hook sees Meet's post-effect track with blur on, with a virtual background on, and with no effect, and that frames we draw arrive at the other side. If Meet's architecture prevents this, stop and return to the user with options. Do not silently ship the v0.1 behaviour.

**Self-view must show exactly what others see.** Because our output no longer feeds Meet's own self tile, find the self-view `<video>` (the one whose stream holds the track we wrapped) and attach our output stream to it, displayed mirrored as Meet does. Keep the floating preview from v0.1 as an optional second view. If self-view replacement turns out fragile, it may fall back to a DOM overlay canvas over the self tile; builder's call.

### 1.2 GPU compositor

Replace Canvas2D compositing with a WebGL2 compositor:

- The camera frame is uploaded once per frame as a texture.
- Each effect renders into the frame with shaders and instanced particles.
- Read back via `new VideoFrame(canvas)` as today.

Requirements:
- At 720p on an integrated GPU, our per-frame work stays under ~8 ms.
- Quality scales automatically when the budget is exceeded: particle counts drop first, never the frame rate.
- If WebGL2 is unavailable or the context is lost, degrade to Canvas2D versions of the effects (simpler is fine) rather than nothing.

The frame never waits on detection: detection stays asynchronous on its own clock. Effects animate on `performance.now()`, so a late detection never makes an animation jump.

### 1.3 Mirror mode

- A toggle (popup, in-page pill, hotkey). When on, the outgoing frame is flipped horizontally *before* effects are drawn.
- Effect positions are computed in the flipped space, so overlays still line up with the user's face and hands.
- All text and images are drawn unflipped on top, so they read correctly.
- The self-view shows the same output.
- Draw mode (phase 4) forces mirror on while active and restores the previous state on exit.

### 1.4 Sound to other participants

- Wrap the **outgoing** audio track the same way as video (the sender hook) and mix meme audio into it with WebAudio: `MediaStreamTrackProcessor` on audio → mix → generator, or a `MediaStreamAudioDestinationNode` graph, builder's call.
- Mixing after Meet's noise cancellation is deliberate, so the noise cancellation can't strip the meme sounds.
- When the user is muted in Meet, sounds must not be sent. Respect the sender track's `enabled` state.
- Volume is a setting (default 70%). Ducking is not needed.
- Optional "hear meme sounds yourself" toggle, off by default because it can echo without headphones.
- Snap and click detection keep using the raw mic.

### 1.5 Modes

- Modes: **Off**, **Meme** (default), **Draw**, **Spell**.
- Only the active mode's gesture triggers run. Meme hotkeys work in every mode except Off.
- Switch via:
  - the popup (segmented buttons);
  - an in-page **pill**: a small draggable floating control on the Meet page showing the current mode, with buttons for mode, mirror, guide, and later the lag button;
  - keyboard: `Alt+Shift+M` Meme, `Alt+Shift+D` Draw, `Alt+Shift+S` Spell, `Alt+Shift+0` Off (the existing panic key keeps its meaning), `Alt+Shift+R` mirror.
- The builder verifies no clash with Meet's or Chrome's own shortcuts and picks alternatives if needed.
- Draw and Spell show a "coming soon" state in the UI until their phases ship.
- Switching mode shows a short toast visible only to the user (DOM, never in the video).

### 1.6 Trigger reliability

Rules for every gesture trigger:

1. **Stable recognition.** The pose must match in at least 70% of detections over its hold window (not one lucky frame). A few dropped detections in the middle don't reset it.
2. **Exclusivity.** If two memes match at once, the higher-priority one wins and the other is suppressed. After any meme fires, there is a 1.5 s global quiet period for gesture triggers.
3. **Disarm while talking normally**, where relevant. Face-only triggers (laser eyes) require no hand near the face.
4. **Detection rate.** Raise detection to 20–30 fps while hands are visible. Drop to ~8 fps when nothing is in view, to save CPU.
5. **Charge-up ring.** As a pose is recognised, a small ring fills next to the hand. It shows only on the user's side (DOM overlay on the self tile and preview), never in the video. Releasing early cancels.

**Tuning on real data.** The Guide's Practice tab (section 3) can record detection *traces*: per-frame landmarks, gesture labels, blendshapes and mic transient timestamps as JSON, not video. The user records:
- each gesture done five times;
- about two minutes of normal meeting behaviour (talking, nodding, laughing, drinking, waving, thumbs up, touching face).

Traces go into `tests/fixtures/` (they are small and hold no images). Tests replay them through the real trigger code and assert:
- each gesture trace fires its meme exactly 5 times and fires nothing else;
- the normal-behaviour trace fires **nothing**.

Thresholds are tuned until these pass. The synthetic-landmark tests from v0.1 stay as unit tests.

### 1.7 Low bandwidth and weak CPU

- Detection and effects are local, so network quality cannot delay triggers or break animations.
- Only the sharpness of our video at the receiver depends on bandwidth. Design effects to survive heavy compression: bold shapes, glow and large particles rather than full-frame high-frequency noise.
- Don't touch Meet's bitrate or degradation settings in this phase.
- Weak CPU: handled by the adaptive quality from 1.2 and the adaptive detection rate from 1.6.

### 1.8 Assets

- Clips are trimmed and re-encoded to WebM (VP9 + Opus, ≤ 480p, typically < 1 MB each).
- Stored in each meme's folder and listed in `meme.json` (`clip`, `sound`, with in/out points).
- Loaded once per session and cached. A missing asset falls back to the meme's procedural effect without its clip.
- Source clips (downloaded with yt-dlp, already reviewed):

| Asset | Source | Use |
|---|---|---|
| Fanum exploding broccoli | youtube.com/shorts/mq-evz4bpZ4 (0.0–5.5 s) | explosion sound; optional corner clip |
| Michael Rosen "Noice" | youtube.com/shorts/RmTNdjd2nQQ (≈0.6–2.0 s) | corner clip + sound |
| Steven He "Emotional Damage" | youtube.com/shorts/InaAKIjzXuE (≈0.5–4.4 s) | shout sound; optional corner clip |
| Michael Scott "No, God, please no" | youtube.com/watch?v=umDr0mPuyQc (≈3.2–12.6 s, trim to best ~4–5 s) | full-screen clip + sound |
| Thanos snap | youtube.com/watch?v=AaZs5xsvu7A (≈0.8–2.0 s) | snap sound |
| Laser hum | youtube.com/watch?v=Utyfma7bBlc (≈0.1–3.0 s, looped) | laser eyes sound |

Exact in/out points are confirmed by the user listening in the Guide preview before release. Reference-only material (not bundled): Infinity War disintegration (youtube.com/watch?v=DIY89wmiUqk, 13.5–18 s), the red-eyes flare look (youtube.com/watch?v=o5rW2jhFcb4), and the Absolute Cinema template (youtube.com/watch?v=OUnNZUXO-aI).

---

## 2. Memes

Every meme has a hotkey (`Alt+Shift+1…8`, unchanged where they exist), a cooldown, and the gesture below. Gestures are chosen so that no two share a hand shape *and* position.

| # | Meme | Gesture | Hold | Priority |
|---|---|---|---|---|
| 1 | Thanos snap | finger snap: thumb–middle pinch then release, confirmed by a mic transient within 250 ms | pulse | 1 |
| 2 | Absolute Cinema | both open hands raised beside the head, palms to camera, fingers spread | 500 ms | 2 |
| 3 | Noice | thumb up held *beside the face*, plus a tongue click (mic). Without mic: same pose held 1.2 s | click / 1.2 s | 4 |
| 4 | Fanum broccoli | both palms up at chest height ("holding a plate"), then a fast sweep of either hand up and back over the shoulder | 400 ms + sweep | 3 |
| 5 | Emotional Damage | one flat hand pressed on the chest, below the face | 350 ms | 5 |
| 6 | Laser eyes | no hands near the face; eyes wide and both brows raised (blendshapes `eyeWide*`, `browInnerUp`, `browOuterUp*`) | 900 ms | 7 |
| 7 | Michael Scott | both palms covering the face | 700 ms | 6 |
| 8 | Feel the aura | both index fingers pointing at the head | 500 ms | 8 |

### 2.1 Thanos snap (rebuilt)

Reference observed frame by frame in the Infinity War clip:
- The dissolve starts at the extremities on one side and spreads across the body in about 3 s.
- The not-yet-dissolved body first **darkens and desaturates to ash brown**, then breaks into a **dense cloud of small dark-brown flakes**.
- The cloud drifts sideways and upward with turbulence, some flakes fall, and it lingers and thins for 2–3 s.
- The remaining body keeps moving normally until it goes.

Our version:
1. **Snap.** Snap sound plays. Hold for 0.8 s with nothing visible: the movie's beat of silence. The content-aware fill (below) is computed during this pause.
2. **Dissolve (~3 s).** A noisy front sweeps across the person mask from the side opposite the snapping hand.
   - Ahead of the front: a 15–25% band where the live video is tinted toward ash (desaturate, darken, brown).
   - At the front: pixels convert to particles, 20–60k instanced on the GPU, scaled with the quality budget. Each particle starts with its source pixel colour and lerps to ash within ~300 ms. Mixed sizes: mostly 1.5–3 px at 720p, some larger chunks.
   - Particle motion: drag, curl-noise turbulence, wind drift (direction configurable), mild gravity on heavier chunks.
   - Behind the front: the background plate.
   - Anything not yet dissolved is still the **live** video, masked by the current segmentation.
3. **Gone.** Empty room. The cloud thins over 2–3 s. The user stays gone until they snap again, press the hotkey, or `autoReturnMs` (20 s) passes.
4. **Return.** Reverse, Endgame style: warm orange-gold shimmer particles converge and the person fades in from the edges, ~1.5 s.

**Background plate, zero setup:**
- Continuously learn background pixels from every frame where segmentation says "not person". Use a dilated mask so edges never leak in. Per-pixel confidence is kept.
- Learning runs whenever Meme mode is on, not only after the snap, so by the time the user snaps, most of the room has usually been seen.
- At snap time, fill the never-seen region with **content-aware fill** (patch-based inpainting, PatchMatch-style, at half resolution, in a worker) seeded from surrounding background. Upscale and feather the seam.
- **Never** use a blur fill. If the fill isn't ready when the dissolve front reaches a pixel, use the nearest finished fill, never blur.
- With Meet's blur or virtual background on, the plate is learned from Meet's processed frames (sender hook). It therefore matches what others see, and is easy to fill because those backgrounds are smooth or static.

### 2.2 Absolute Cinema (rebuilt): "you become the poster"

- On trigger: a hard cut (1 frame of white), then the user's live video in black and white:
  - high contrast, crushed blacks, slight lift of the face;
  - dark radial vignette;
  - subtle film grain and gate flicker;
  - a slow 6% push-in centred on the face.
- Text over the lower third, centred:
  - "ABSOLUTE" small, white, bold;
  - "CINEMA" very large, bold condensed sans, matching the poster's look;
  - a gentle glow behind the text.
- The effect holds while the pose is held (minimum 2 s), then linger 1 s and a 300 ms fade back to colour.
- Sound: a deep cinematic boom synthesised with WebAudio (no bundled clip needed).
- The user's poster image may optionally appear as a 1 s intro card; off by default.

### 2.3 Noice

The sequence:
1. The Rosen clip pops in at bottom-right, ~35% of frame height, with a 150 ms scale-in and slight overshoot. The clip's own audio carries the click and "noice".
2. At the moment the clip says "noice", a quick 1.15× punch-zoom on the user's face (150 ms in, 400 ms out).
3. A "*click*" caption, styled as in the meme (white italic with dark outline), appears at the bottom-centre of the clip.
4. The clip dismisses with a 200 ms scale-out.

The total is ~2.6 s.

### 2.4 Fanum broccoli (redesigned)

The reference edit, observed: Fanum holds the plate, flings it back over his shoulder, then a white flash and a huge fire-and-debris explosion erupts **behind** him while he sits there calmly. The flash repeats once.

Our version:
1. **Plate pose recognised.** A plate of broccoli appears resting on the user's palms: rendered sprite, tracked to the midpoint of both palms, scaled to hand span. It stays while the pose is held, up to 4 s.
2. **Throw.** A fast up-and-back sweep of either hand. The plate flies along an arc over that shoulder, rotating and shrinking (moving away), with broccoli florets scattering.
3. **Boom.** About 250 ms after leaving frame, or after reaching its apex behind the user: a white flash, then an explosion composited **behind the person** using the segmentation mask, filling the background.
   - The explosion has a fireball with an expanding core, rolling smoke, embers, debris and a heat shimmer.
   - The user stays crisp in front, with a warm rim light on their edges.
   - Explosion audio comes from the clip.
4. The explosion holds and churns for ~3 s, then smoke clears over 1 s.

- If the plate pose was skipped, the sweep alone does not fire. This prevents accidental fires from waving.
- Option (off by default): the original clip in a corner.

### 2.5 Emotional Damage

1. Steven He's shout plays.
2. A crash zoom to the user's face, 1.0 → 1.6× in 120 ms, handheld shake for 1.5 s, then an ease back out over 400 ms.
3. A red flash vignette on impact.
4. "EMOTIONAL DAMAGE" in heavy white impact text with a red outline. It slams in from 1.4× scale and shakes with the camera.

The total is ~2.5 s. Option (off by default): the original clip in a corner.

### 2.6 Laser eyes

Reference: the red-eyes meme uses a bright white-red core on each eye, a strong horizontal anamorphic streak and a red glow.

1. **Charge.** Glowing red flares grow on both irises over 300 ms. They are tracked to the eye landmarks every frame and interpolated between detections, so they stick to the eyes.
2. **Fire.** After 0.6 s of flares, beams fire.
   - Two red-white beams leave each eye in the direction the head faces (yaw and pitch from the face landmarks), extending to the frame edge.
   - They have additive glow, slight flicker, and scorch sparks where they exit the frame.
   - Beams follow head movement while the pose holds.
3. Sound: laser hum loop while active.
4. **End.** Release the pose and the beams cut, with flares fading over 300 ms.

### 2.7 Michael Scott: "No, God, please no"

- The clip plays full-screen ("contain" fit over a blurred, darkened copy of the user's frame), with sound, trimmed to the best ~4–5 s.
- The user can end it early by lowering their hands for 1 s.

### 2.8 Feel the aura (kept, polished)

- Same trigger as v0.1.
- The aura is re-rendered on the GPU: a person-mask-hugging purple glow with rising wisps, and the "+1000 AURA" caption.
- No sound unless the user later supplies a reference.

---

## 3. Guide (inside the extension)

A full extension page, `guide/guide.html`. It opens from the popup, the in-page pill, the options page, and automatically once on first install and after each major update ("What's new"). Sections:

1. **Start here.** How Meet Memes works in one paragraph. What others see vs what only you see. The panic key. Modes, and how to switch (buttons + shortcuts).
2. **Meme mode.** One card per meme. Content comes from `meme.json` fields (`name`, `origin`, `whatHappens`, `how`, `tips`, `hotkey`), so the guide never drifts from the code. Each card shows:
   - **What it is:** one line on the meme's origin.
   - **What happens:** the sequence others will see, with a short looping preview of the effect rendered on a sample frame.
   - **How to trigger:** a drawn illustration of the gesture (SVG hand diagram), hold time, the hotkey, and common mistakes ("hold your thumb beside your face, not in front of your chest").
3. **Draw mode / Spell mode.** Sections exist with a "coming soon" note until phases 4–5 fill them in.
4. **Utilities.** Mirror (and later Bad connection).
5. **Practice.** Uses the camera on the guide page itself, with the same detection engine:
   - Pick a meme to see a live meter of how well the pose is recognised, plus the charge ring.
   - Hit "Try it" to see the full effect locally.
   - The "Record trace" tool (section 1.6): guided steps "do the gesture 5 times" and "act normal for 2 minutes", then **Export** a JSON file the user can send to the developer (me).
6. **Troubleshooting.** Effects not visible to others, camera permission, a meme that won't fire, performance tips.

The guide follows the existing popup and options visual style (`popup/ui.css`), has a light and dark theme, and works at small window widths.

---

## 4. Settings migration

`settings.mode` currently means "local / everyone" (whether others see effects). Rename it to `audience` and add `activeMode` (`off|meme|draw|spell`) plus `mirror`, `soundVolume`, `hearSoundsLocally`. Migrate on first load. Keep per-meme enable/disable and overrides.

## 5. Order of work

1. Spike: sender hook on a live Meet call (blur / virtual background / none). Go or no-go back to the user.
2. Sender-hook pipeline + self-view, the WebGL2 compositor skeleton, mirror, settings migration, modes + pill + hotkeys.
3. Trigger-reliability layer + Guide with the Practice and trace recorder. The user then records traces.
4. Memes, one at a time in this order: Thanos, Absolute Cinema, Noice, Broccoli, Emotional Damage, Laser eyes, Michael Scott, Aura. Each is verified in a live call.
5. Audio mixing, asset trimming, guide cards and previews.
6. Tune on the user's traces, run the full test suite, release v0.2.0.

## 6. Calls made while writing this (user to check)

- **Self-view orientation.** With mirror on, the self-view shows the output as is (it is already a selfie). With mirror off, the self-view shows the output flipped, as Meet does today, so meme text looks backwards *in the self-view only*.
- **Hotkeys.** The existing ones are unchanged (1 Thanos, 2 Cinema, 3 Noice, 4 Michael Scott, 5 Broccoli, 6 Aura). New: `Alt+Shift+7` Emotional Damage, `Alt+Shift+8` Laser eyes.
- **Snap without a mic** (mic blocked, or the track stopped while Meet-muted): fall back to the visual-only snap detection from v0.1.
- **Broccoli plate and the explosion** are procedural or SVG art made by us. No third-party image is needed.
- **Guide previews.** A card shows the meme's clip or still and the gesture illustration. "Preview on my camera" opens Practice with the real effect. No sample person footage is bundled.
- **Feel the aura** has no sound, because no definitive reference was found.

## 7. Left to the builder

- Internal module layout, the shader structure, and the particle system implementation.
- The exact patch-based inpainting algorithm, as long as the result has no blur and finishes inside the 0.8 s pause at half resolution.
- Exact trims of the clips (the user confirms by ear).
- Whether self-view uses stream replacement or a DOM overlay.
- Fallback visuals when WebGL2 is unavailable.
