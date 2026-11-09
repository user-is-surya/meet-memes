# Changelog

Each `## x.y.z` section becomes the notes of that GitHub release.

## 0.2.0

- Memes are drawn on the track Meet actually sends, after its background blur or virtual background, so they stay sharp. Your self-view shows exactly what others see.
- Meme sounds are mixed into your mic for everyone to hear (never while you're muted).
- New WebGL2 compositor with automatic quality scaling and a Canvas2D fallback.
- Modes (Meme, Draw, Spell) with a floating 🎭 button on the Meet page, the popup, and Alt+Shift+M / D / S.
- Draw mode: write in the air with your index finger in glowing neon ink. Two fingers to move without drawing, open palm to erase, both palms to clear, an air colour palette along the top, Alt+Shift+Z undo. Your video is mirrored while drawing so writing reads correctly.
- Spell mode: five moves (shield, orb, blast, portal, channel) in three styles: Strange, Wanda and Doom (Alt+Shift+1/2/3). Alt+Shift+4 / 5 cast a blast / portal without a gesture.
- Bad connection (Alt+Shift+B, the 📶 button or the popup): blocky, stuttering, freezing video and a choppy, robotic voice; video only, audio only or both; optionally leaves the call after 15 s / 30 s / 1 min. Never stays on after a reload.
- Mirror mode (Alt+Shift+R): others see your selfie view, meme text stays readable.
- Steadier gestures: poses must hold through most detections, one meme at a time, a quiet period after each, and a charge ring only you see. Tuned against a real-person recording of normal talking.
- Rebuilt Thanos snap (ash, dust cloud, your learned empty room with content-aware fill, never blurred; golden return), Absolute Cinema (you become the poster), Noice (real clip, tongue-click trigger, punch zoom), Fanum broccoli (plate fling, explosion behind you), Michael Scott (real clip), Feel the aura (GPU glow).
- New memes: Emotional Damage (Alt+Shift+7) and Laser eyes (Alt+Shift+8).
- A Guide inside the extension, with a Practice tab and a gesture-trace recorder.

## 0.1.1

- New **Status in this tab** panel in the popup: shows whether the camera is hooked, gesture detection is ready, and what it sees (face, hands, last meme fired).
- Silenced MediaPipe startup logs that showed up as dozens of fake errors in chrome://extensions.

## 0.1.0

First release.

- Six gesture-triggered memes: Thanos snap, Absolute Cinema, Noice, Michael Scott, Fanum broccoli throw, Feel the aura.
- Effects go out to everyone in the call, or use "Only me" mode to preview them privately.
- Add your own image or GIF to any action from the options page (saved only in your browser).
- Swap any built-in meme's image for your own.
- Hotkeys for every meme (Alt+Shift+1–9) and a panic key (Alt+Shift+0).
- Update check against GitHub Releases.
