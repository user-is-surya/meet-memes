# Meet Memes ✨

A Chrome extension that turns your gestures into meme effects in Google Meet, and everyone in the call sees and hears them.
It works with Meet's background blur and virtual backgrounds.

| Meme | Do this | Hotkey |
|---|---|---|
| **Thanos snap**: a beat of silence, then you crumble to ash and drift away, leaving your empty room. Snap again to re-form | Snap your fingers | `Alt+Shift+1` |
| **Absolute Cinema**: you become the black-and-white poster | Both open hands beside your head, fingers spread | `Alt+Shift+2` |
| **Noice**: the clip pops up, your face punch-zooms | Thumbs up beside your face + tongue click | `Alt+Shift+3` |
| **Michael Scott**: "No, God, please no" full-screen | Cover your face with both hands | `Alt+Shift+4` |
| **Fanum broccoli**: fling the plate, it explodes behind you | Hands like holding a plate, then fling over your shoulder | `Alt+Shift+5` |
| **Feel the aura**: purple glow and +1000 AURA | Point both index fingers at your head | `Alt+Shift+6` |
| **Emotional Damage**: crash zoom, red flash, the shout | One flat hand held on your chest | `Alt+Shift+7` |
| **Laser eyes**: red flares; beams where you look | Stare wide-eyed, brows up (no hands) | `Alt+Shift+8` |

**Modes:** 🎭 Meme (`Alt+Shift+M`), ✏️ Draw (`Alt+Shift+D`, coming soon), ✨ Spell (`Alt+Shift+S`, coming soon).
Switch from the floating 🎭 button on the Meet page or the toolbar popup.
**Mirror** (`Alt+Shift+R`): others see your selfie view; meme text stays readable.
`Alt+Shift+0` is the **panic key**: everything off instantly, camera back to normal.

The extension has a full **Guide** (popup → 📖 Guide) with every meme, its gesture, a Practice tab that
rehearses gestures on your camera, and troubleshooting.

You can also attach **your own image or GIF to any action** (thumbs down, peace sign, big smile, mouth open, and more). It's saved only in your browser.

## Install

1. Download the latest `meet-memes-vX.Y.Z.zip` from [Releases](https://github.com/user-is-surya/meet-memes/releases/latest) and unzip it somewhere permanent.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder.
4. Join a Meet call. A toast says *"Meet Memes is ready ✨"* once gesture detection has loaded.

Works in Chrome, Edge, Brave and other Chromium browsers.

### Updating

When a new version is out, the toolbar icon shows **NEW**. Open the popup and click **Download the update**.
Then unzip it over your existing folder and click **Reload** on the extension in `chrome://extensions`.
Your settings and custom memes are kept.

## Using it

Click the toolbar icon to:
- Turn the whole thing on or off, or individual memes.
- Choose **who sees the effects**:
  - **Everyone in the call** (default): effects go out in your video.
  - **Only me (preview)**: your video goes out untouched, and the effects show only in a floating preview, so you can practise gestures.
- Show the **preview window**, which shows exactly what others see.
- Turn on the **debug overlay**, which draws hand landmarks and detected gestures and helps when a gesture won't trigger.
- **Add your own memes** in the options page: upload an image or GIF, pick the action, style, position, caption and hotkey. You can also swap the image of any built-in meme.

Tips:
- Keep your hands in view of the camera, with decent lighting.
- Meet mirrors your *own* self-view, so captions look backwards **to you only**. Everyone else sees them the right way round, and the preview window shows the real thing.
- The snap is easiest with "Use mic to confirm snaps" on: pinch thumb and middle finger, then snap so it clicks. The mic is used only for detecting the click and never leaves your computer.

## Privacy

Everything runs on your computer. Hand, face and body tracking use [MediaPipe](https://ai.google.dev/edge/mediapipe), bundled inside the extension. No video, audio or images are sent anywhere.
The only network request is a check of this repo's GitHub Releases for updates.

## How it works

```
Meet's camera -> Meet's own blur / virtual background -> RTCRtpSender
                                                          | main/sender-hook.js swaps in our track
                                                          v
              main/track-wrap.js + bridge.js: each frame -> hidden canvas -> content script
                        | WebGL2 compositor (src/gfx) draws the active memes on top
                        | engine iframe (MediaPipe hands, face, segmentation) -> triggers (src/triggers)
                        v
              processed frame goes to the call; main/self-view.js shows the same in your self-view
              meme sounds are mixed into the outgoing mic chunks (main/audio-mix.js), never while muted
```

- Effects are drawn on the track Meet actually sends, after its background effects, so they stay sharp.
  If that hook can't see Meet's track, a `getUserMedia` wrap takes over (the popup shows which path is active).
- Anything failing falls back to your untouched camera and mic.
- `extension/memes/` holds the memes: a `meme.json` each, plus clips (`npm run clips`). See [docs/ADDING_MEMES.md](docs/ADDING_MEMES.md).

## Development

```sh
npm install
npm run setup      # copies MediaPipe into extension/vendor and downloads the models
npm test           # unit tests (triggers, replayed gesture traces, mixer, sender hook, effects)
npm run check      # syntax, manifest and meme.json validation
npm run e2e:setup  # one-time: fake camera files for the browser tests (needs yt-dlp + imageio-ffmpeg)
npm run e2e        # browser tests: real Chromium + the extension on a fake Meet page
npm run clips      # rebuild bundled meme clips/sounds from extension/memes/clips.json
```

Load the `extension/` folder with **Load unpacked**. After editing code, click **Reload** on the extension and refresh the Meet tab.

Gesture tuning uses real recordings: Guide → Practice → "Record a trace" saves landmarks only (no video).
Put them in `tests/fixtures/` and `npm test` replays them (see [tests/fixtures/README.md](tests/fixtures/README.md)).

### Releasing

```sh
npm run bump -- minor            # or patch / major / 1.2.3; updates manifest + package.json
# add a "## x.y.z" section to CHANGELOG.md
git commit -am "Release vX.Y.Z"
git tag vX.Y.Z && git push && git push --tags
```

GitHub Actions then:
1. Validates the code.
2. Runs the tests.
3. Bundles MediaPipe and the models.
4. Zips the extension.
5. Publishes the release with that changelog section as the notes.

Installed copies see the update within a few hours.

## License

The code is MIT. Meme images belong to their respective owners and are included for personal, non-commercial fun.

## Credits

Meme clips and sounds bundled with the extension are short excerpts of the original
memes, used for parody and commentary. All rights belong to their owners:

- Fanum broccoli: Fanum / Kai Cenat stream, exploding edit (youtube.com/shorts/mq-evz4bpZ4)
- Noice: Michael Rosen (youtube.com/shorts/RmTNdjd2nQQ)
- Emotional Damage: Steven He (youtube.com/shorts/InaAKIjzXuE)
- "No, God, please no": The Office, NBC (youtube.com/watch?v=umDr0mPuyQc)
- Thanos snap sound: Avengers: Infinity War, Marvel Studios (youtube.com/watch?v=AaZs5xsvu7A)
- Laser sound effect (youtube.com/watch?v=Utyfma7bBlc)

Rebuild them with `npm run clips` (see `extension/memes/clips.json`).
