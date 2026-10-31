// Actions a user can attach their own meme to from the options page.
// Each maps to a trigger spec understood by src/triggers/index.js.
export const ACTIONS = [
  { id: 'thumbs-up', label: 'Thumbs up 👍', trigger: { type: 'gesture', gesture: 'Thumb_Up', holdMs: 300 } },
  { id: 'thumbs-down', label: 'Thumbs down 👎', trigger: { type: 'gesture', gesture: 'Thumb_Down', holdMs: 300 } },
  { id: 'peace', label: 'Peace sign ✌️', trigger: { type: 'gesture', gesture: 'Victory', holdMs: 400 } },
  { id: 'rock-on', label: 'I love you / rock on 🤟', trigger: { type: 'gesture', gesture: 'ILoveYou', holdMs: 400 } },
  { id: 'open-palm', label: 'Open palm ✋', trigger: { type: 'gesture', gesture: 'Open_Palm', holdMs: 800 } },
  { id: 'point-up', label: 'Pointing up ☝️', trigger: { type: 'gesture', gesture: 'Pointing_Up', holdMs: 500 } },
  { id: 'fist', label: 'Closed fist ✊', trigger: { type: 'gesture', gesture: 'Closed_Fist', holdMs: 600 } },
  { id: 'both-hands-up', label: 'Both hands up 🙌', trigger: { type: 'both-hands-up', holdMs: 400 } },
  { id: 'hands-over-face', label: 'Hands over face 🤦', trigger: { type: 'hands-over-face', holdMs: 600 } },
  { id: 'hands-on-head', label: 'Fingers pointing at head 🧠', trigger: { type: 'hands-on-head', holdMs: 500 } },
  { id: 'snap', label: 'Finger snap 🫰', trigger: { type: 'snap' } },
  { id: 'throw', label: 'Throwing motion 🤾', trigger: { type: 'throw' } },
  { id: 'mouth-open', label: 'Mouth wide open 😮', trigger: { type: 'expression', blendshapes: { jawOpen: 0.65 }, holdMs: 500 } },
  { id: 'big-smile', label: 'Big smile 😁', trigger: { type: 'expression', blendshapes: { mouthSmileLeft: 0.75, mouthSmileRight: 0.75 }, holdMs: 700 } },
  { id: 'hotkey-only', label: 'Hotkey only ⌨️', trigger: null },
];

export const STYLES = [
  { id: 'overlay', label: 'Pop-up overlay' },
  { id: 'fullscreen', label: 'Full screen' },
  { id: 'face-in-frame', label: 'My face inside the image' },
];

export const POSITIONS = ['center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'face', 'hand'];
