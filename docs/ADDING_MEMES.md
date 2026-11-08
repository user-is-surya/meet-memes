# Adding memes

There are two ways to add a meme.

- **Just for yourself:** open the extension's options page (popup → *Add your own memes*), upload an image or GIF, and pick the action that triggers it. It's stored only in your browser, so nobody else gets it. You need no code for this.
- **For everyone (built in):** add a folder to `extension/memes/`, as described below, and ship it in a release.

## A built-in meme in 3 steps

1. Create `extension/memes/<your-meme-id>/` with a `meme.json` and your image(s).
2. Add `<your-meme-id>` to `extension/memes/index.json`.
3. Run `npm run check`, reload the extension in `chrome://extensions`, and try it in Meet.

### Example: surprised Pikachu when your mouth drops open

`extension/memes/surprised-pikachu/meme.json`:

```json
{
  "name": "Surprised Pikachu",
  "description": "Pikachu pops up when you're shocked.",
  "how": "Open your mouth wide in shock.",
  "hotkey": "Alt+Shift+7",
  "cooldownMs": 3000,
  "trigger": { "type": "expression", "blendshapes": { "jawOpen": 0.65 }, "holdMs": 500 },
  "render": {
    "type": "overlay",
    "asset": "pikachu.png",
    "position": "bottom-right",
    "size": 0.45,
    "durationMs": 2500,
    "fallbackText": "😮"
  }
}
```

## `meme.json` reference

| Field | Meaning |
|---|---|
| `name`, `description`, `how` | Shown in the popup and options page. `how` tells people the gesture. |
| `origin`, `whatHappens`, `tips`, `illustration` | Shown in the Guide. `origin` and `whatHappens` are required for bundled memes; `illustration` is an SVG in `extension/guide/illustrations/`. |
| `priority` | When two memes' gestures match at once, the lower number wins. |
| `sound`, `soundTrim` | `sound.ogg` in the meme folder (or `synth:boom`/`synth:whoosh`/`synth:click`), mixed into the call. `soundTrim` `{ from, to }` in seconds. |
| `hotkey` | Optional. `Alt+Shift+1` … `Alt+Shift+9`, each used once. `Alt+Shift+0` is the panic key. |
| `cooldownMs` | Minimum time between two triggers (default 2500). |
| `enabledByDefault` | Set to `false` to ship a meme that users opt into. |
| `trigger` | What sets it off: one trigger object, or an array (any of them). Leave it out for hotkey-only. |
| `render` | What it looks like (see below). |

### Triggers

All triggers accept `holdMs`: the pose must match in at least 70% of detections (`ratio`) for that long.
Only one meme fires at a time, followed by a 1.5 s quiet period.

| `type` | Options | Fires when |
|---|---|---|
| `gesture` | `gesture`: `Thumb_Up`, `Thumb_Down`, `Victory`, `ILoveYou`, `Open_Palm`, `Pointing_Up`, `Closed_Fist`; `minScore` (0.6); `hands` (1) | That hand gesture is seen |
| `expression` | `blendshapes`: `{ name: minScore }`, for example `jawOpen`, `mouthSmileLeft`, `browInnerUp`, `eyeBlinkLeft` ([full list](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker#models)) | All listed face scores are above their minimum |
| `both-hands-up` | | Both open hands are raised beside the head |
| `hands-over-face` | `hands` (2) | Palms cover the face |
| `hands-on-head` | `hands` (2) | Index fingers point at the head |
| `snap` | `pinchRatio` (0.45) | Thumb and middle finger snap. The mic's click confirms it when "Use mic to confirm snaps" is on. |
| `throw` | `minDistance` (0.35), `minSpeed` (1.6), `windowMs` (350), `requireFist` (true) | A fast throwing sweep of the hand |
| `thumb-by-face` | `minScore` (0.6), `holdNoMicMs` (1200) | Thumbs up beside the face plus a tongue click (or held, without mic) |
| `plate-pose` | | Both hands level at chest height, like holding a plate |
| `hand-on-chest` | `stillMs` (400), `stillness` (0.2) | One flat hand held still on the chest |
| `stare` | `eyeWide` (0.35), `browInnerUp` (0.45), `browOuterUp` (0.35) | Wide eyes and raised brows, no hand near the face |

### Render types

| `type` | Options | Looks like |
|---|---|---|
| `overlay` | `asset`, `position` (`center`, `top`, `bottom`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `face`, `hand`), `size` (fraction of frame height), `caption`, `animation` (`pop` or `fade`), `fallbackText` | An image or GIF pops up on the frame |
| `fullscreen` | `asset`, `fit` (`contain` or `cover`), `background`, `caption`, `fallbackText` | The meme takes over the whole frame |
| `face-in-frame` | `asset` (poster), `faceSlot` `{x,y,w,h}`, `faceShape` (`ellipse` or `rect`), `faceFilter` (CSS filter), `facePadding` | Your live face inside the image |
| `aura` | `color` (`#rrggbb`), `caption`, `asset`, `position`, `size` | A glowing aura around you with rising sparkles |
| `throw` | `projectile`, `projectileEmoji`, `count`, `asset`, `position`, `size` | Projectiles fly from your hand at the camera |
| `thanos` | `wind`, `autoReturnMs` | You turn to ash and drift away; your learned room is left behind |
| `clip-pop` | `clip` (animated WebP), `position`, `size`, `caption`, `caption2`, `punchAt`, `punchScale` | A meme clip pops up in a corner; optional face punch-zoom |
| `cinema` | `title`, `subtitle` | You become a black-and-white movie poster |
| `broccoli` | `holdPlateMs`, `boomMs` | Plate on your hands; fling it and it explodes behind you |
| `damage` | `durationMs`, `zoom`, `text` | Crash zoom, shake, red flash, slammed title |
| `laser` | | Laser flares on your eyes, beams where you look |

`fullscreen` also accepts `clip` (plays it full-screen; `minMs`, `releaseMs` end it early once the pose is dropped).
New effects should override `renderGL(g, env)` and draw with the graphics API in `extension/src/gfx/graphics.js`.

Common render options:
- `durationMs`: how long it shows (default 3000).
- `fadeMs`: fade in and out time.
- `captionSize`: fraction of frame height.
- `hold: true`: stays while the pose is held. It also takes `lingerMs` (how long it stays after you drop the pose) and `minMs` (the shortest time it shows).

If an `asset` file is missing, the meme still works with its fallback look.

## A brand-new trigger or effect

- **Trigger:** add a function to `conditions` in `extension/src/triggers/index.js`. Add a unit test in `tests/triggers.test.mjs`, and add the name to `TRIGGERS` in `scripts/check.mjs`.
- **Effect:** add a class extending `Effect` (from `extension/src/renderers/base.js`) and register it in `extension/src/renderers/index.js`. Then add the name to `RENDERS` in `scripts/check.mjs`.
