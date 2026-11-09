# Phases 3–5: Bad connection, Draw mode, Spell mode

Status: built on the builder's own judgment (the user asked to skip the design questions on 2026-11-09).
Every decision below is the builder's call unless marked **(user)**. Reserved earlier by the phase 1–2 spec: the
mode switch (Off / Meme / Draw / Spell), the guide sections, and the hotkeys `Alt+Shift+D` / `Alt+Shift+S`.

All three run in the existing pipeline: content script composes into `#meet-memes-fx`, the MAIN world sends it
after Meet's own effects. Nothing is sent while the extension is Off, and `Alt+Shift+0` stops all three.

---

## Phase 3 — Bad connection (utility)

**Why:** fake a choppy connection (an excuse to drop off, or a joke) convincingly enough that people believe it.
Options decided earlier **(user)**: video only / audio only / both, and an optional auto-leave.

**Behaviour**
- Toggle with `Alt+Shift+B`, the 📶 button in the pill, or the popup. Works in any mode except Off.
- It is **not remembered** across page loads: joining a new call never starts with a broken connection. The kind
  (video / audio / both) and auto-leave choice are saved settings (`badConnKind`, `badConnAutoLeaveSec`).
- Intensity ramps from mild to heavy over ~4 s, so it looks like the network got worse, not like a switch flipped.
- **Video**, driven by a seeded random schedule (`src/fx/bad-connection.js`, pure and unit-tested):
  - stutter: frames are held 120–700 ms instead of updating every frame;
  - long freezes: 1.5–4 s on the last frame, more often as intensity grows;
  - blockiness: the frame is downscaled and blown back up (8–40 px blocks), varying over time;
  - stale macroblocks: random 16 px-aligned regions keep showing the previous held frame (decoder smear).
  Implemented in Canvas2D on the output canvas after memes are drawn, so it degrades memes too.
- **Audio**, in the MAIN-world mic transform (`main/audio-mix.js`), after meme sounds are mixed in:
  - dropouts: silence 60–450 ms;
  - robotic packet-loss buzz: the last 10–20 ms grain repeated for 120–500 ms;
  - low-bitrate: a mild low-pass + sample-and-hold between bursts.
  When the video enters a long freeze the content script sends a `badconn-burst`, and audio drops out for that
  span too (real outages hit both). Never touches audio while the mic is muted.
- **Auto-leave** (off by default; 15 / 30 / 60 s): after that long, a 5 s private countdown toast
  ("Leaving in 5… Alt+Shift+B cancels"), a final hard freeze, then the extension clicks Meet's Leave button
  (found by `aria-label` containing "Leave call", falling back to the button with the `call_end` icon). If the
  button can't be found it says so instead of failing silently.

**Non-goals:** faking Meet's own "unstable connection" banner on other people's screens (not possible); throttling
the real network.

---

## Phase 4 — Draw mode (air drawing board)

**Why:** write or sketch in the air with a fingertip and have it appear in your video, like a whiteboard.
Decided earlier **(user)**: Draw mode mirrors your video while active, so writing reads correctly for others.

**Gestures (one hand at a time)**
- ☝️ **Index finger out, others folded → pen down.** The ink follows the index fingertip.
- ✌️ **Two fingers (index + middle) → pen up / hover.** A small cursor ring shows where the pen is.
- ✋ **Open palm → eraser.** Wipes ink under a circle at the palm (radius from hand size).
- 🙌 **Both open palms held 1 s → clear the board.**
- **Air palette:** a row of colour swatches along the top of the video. Hover the fingertip over one for 0.4 s to
  pick it. The last swatch is a brush-size toggle (thin / thick).
- Keys in Draw mode: `Alt+Shift+1..6` pick colours, `Alt+Shift+Z` undo last stroke, `Alt+Shift+C` clear.

**Look:** neon ink (bright core + soft glow) by default, round caps. Strokes are smoothed with a One-Euro filter on
the fingertip and drawn as quadratic curves through midpoints, so 30 fps detection still gives smooth lines.
Pen-down needs the pointing pose on 2 consecutive detections and lifts after 2 misses (no broken strokes from one
bad frame). Strokes live in frame coordinates (they stay where you drew them) until cleared.

**Mirroring:** effective mirror = `settings.mirror || mode === 'draw'`. The saved mirror setting is never changed, so
leaving Draw mode restores whatever you had.

**Non-goals:** saving drawings, shapes recognition, text tools.

---

## Phase 5 — Spell mode

**Why:** cinematic hand magic. Decided earlier **(user)**: three styles — Strange, Wanda, Doom — sharing one
5-gesture grammar, so learning the gestures once works for every style.

**The 5 gestures (same for every style)**
1. **Shield** — one open palm facing the camera, fingers up, held 0.3 s: a spinning magic circle on the palm,
   following the hand while held.
2. **Orb** — both hands open, palms facing each other with space between them: an energy ball between the hands,
   sized by the gap, while held.
3. **Blast** — push an open palm (or the orb) toward the camera quickly (hand grows ≥ 30 % in ≤ 300 ms): a bolt
   flies at the viewer, hits the screen with a flash and a ring.
4. **Portal** — trace a circle in the air with the index finger: a sparking ring opens where you drew it and stays
   for 6 s.
5. **Channel** — both hands raised beside the head, fingers spread and clawed: eyes glow in the style colour,
   energy wisps stream from your fingertips and particles rise around you.

**Styles** (all art procedural; no film assets)
- **Strange** — orange/gold, geometric mandalas with rotating rune rings, spark showers.
- **Wanda** — scarlet, swirling smoke-like wisps and soft hex-curl circles, mist particles.
- **Doom** — emerald green, angular rune circles, crackling lightning arcs.
Pick with `Alt+Shift+1/2/3` in Spell mode, the pill, or the popup (`spellStyle` setting, default Strange).
Sounds are synthesized (hum for shield/orb, whoosh + boom for blast, crackle for portal, rising drone for channel).

**Non-goals:** multi-person spells, combos beyond orb → blast.

---

## Shared changes
- `activeMode` drives which controller runs: Meme → memes (unchanged), Draw → `DrawBoard`, Spell → `SpellBook`.
  Detection runs in all three (no mask needed for Draw/Spell).
- "coming soon" tags removed from the popup, pill, guide and mode toasts.
- Guide: Draw and Spell sections get real content; Utilities gets the Bad connection card.
- Tests: unit tests for every pure piece (schedules, gesture recognisers, stroke smoothing, circle detection, audio
  degrade); browser tests that each mode changes the sent video.
