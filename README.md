# Meet Memes ✨

A Chrome extension that turns your gestures into meme effects in Google Meet, and everyone in the call sees them.
Snap your fingers and you turn to dust like Thanos. Raise both hands and you're in the Absolute Cinema poster.

| Meme | Do this | Hotkey |
|---|---|---|
| **Thanos snap**: you crumble into dust and blow away | Snap your fingers (snap again to come back) | `Alt+Shift+1` |
| **Absolute Cinema**: your face inside the poster | Raise both open hands beside your head | `Alt+Shift+2` |
| **Noice** | Thumbs up 👍 | `Alt+Shift+3` |
| **Michael Scott**: "No, God, please no" | Cover your face with both hands | `Alt+Shift+4` |
| **Fanum broccoli throw** 🥦 | Make a fist and throw | `Alt+Shift+5` |
| **Feel the aura**: purple glow and +1000 aura | Point both index fingers at your head | `Alt+Shift+6` |

`Alt+Shift+0` is the **panic key**. It turns everything off instantly and your camera goes back to normal.

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
Meet ──getUserMedia──▶ inject.js (Meet's page)
                        │ wraps the camera track with insertable streams;
                        │ each frame is drawn into a hidden canvas
                        ▼
                 content script (src/content)
                        │ sends ~15 fps snapshots to ──▶ engine iframe (MediaPipe:
                        │                                hands, face, segmentation)
                        │ ◀── landmarks + person mask ───┘
                        │ triggers (src/triggers) decide what fired
                        │ renderers (src/renderers) compose the frame
                        ▼
              processed frame goes back to Meet, and the call sees the meme
```

- `extension/inject.js` swaps Meet's camera track for a processed one. If anything fails, the raw camera is used.
- `extension/engine/` runs MediaPipe inside an extension-origin iframe, because Meet's own security policy blocks it in the page.
- `extension/memes/` holds the built-in memes. Each is a `meme.json` plus images. See [docs/ADDING_MEMES.md](docs/ADDING_MEMES.md).

## Development

```sh
npm install
npm run setup      # copies MediaPipe into extension/vendor and downloads the models
npm test           # trigger unit tests
npm run check      # syntax, manifest and meme.json validation
```

Load the `extension/` folder with **Load unpacked**. After editing code, click **Reload** on the extension and refresh the Meet tab.

The built-in meme images go in `extension/memes/<meme>/`. [extension/memes/README.md](extension/memes/README.md) lists the expected filenames.

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
