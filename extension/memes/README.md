# Meme images

Drop the images for the built-in memes here, using these exact filenames.
Anything missing falls back to a built-in look (text captions and effects), so the extension works without them.

| Meme | File | What it should be |
|---|---|---|
| Absolute Cinema | `absolute-cinema/poster.png` | The Absolute Cinema poster. Your face goes in the oval set by `faceSlot` in `meme.json`. |
| Noice | `noice/noice.gif` | The "Noice" GIF. |
| Michael Scott | `michael-scott/michael.gif` | Michael Scott "No, God, please no" (GIF or image). |
| Fanum throw | `fanum-broccoli/fanum.gif` | Fanum throwing (GIF or image). |
| Fanum throw | `fanum-broccoli/broccoli.png` | A broccoli with a transparent background (the 🥦 emoji is used if missing). |
| Feel the aura | `feel-the-aura/aura.gif` | Optional aura meme shown in the corner. |

Supported formats: PNG, JPG, GIF and WebP (animated GIF and WebP play). Keep each file under ~5 MB.

## Fitting your face into the Absolute Cinema poster

In `absolute-cinema/meme.json`, `faceSlot` is the centre (`x`, `y`) and size (`w`, `h`) of the face area, as fractions of the poster.
For example, `{ "x": 0.5, "y": 0.4, "w": 0.28, "h": 0.36 }` is an oval centred horizontally, 40% from the top.
Open the poster in any image editor, note where the face is in pixels, and divide by the image width and height.
