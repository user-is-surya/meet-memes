# Gesture traces

Recorded in the extension's Guide → Practice → "Record trace". Each file is what the
gesture engine saw (hand/face landmarks, expression scores, mic snap/click times). No
video or audio is stored.

| File | What to do while recording | Test expectation |
|---|---|---|
| `gesture-<memeId>.json` | Do that meme's gesture **5 times**, relaxing in between | fires `<memeId>` exactly 5 times, nothing else |
| `normal-<n>.json` | ~2 minutes of normal meeting behaviour: talk, nod, laugh, drink, wave, thumbs up, touch your face | fires nothing |

`tests/traces.test.mjs` replays every file here through the real trigger code.
