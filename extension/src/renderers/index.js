// render.type in meme.json -> effect class. Add new renderer types here.
import { OverlayEffect } from './overlay.js';
import { FullscreenEffect } from './fullscreen.js';
import { FaceInFrameEffect } from './face-in-frame.js';
import { AuraEffect } from './aura.js';
import { ThrowEffect } from './throw.js';
import { ThanosEffect } from './thanos.js';
import { ClipPopEffect } from './clip-pop.js';
import { CinemaEffect } from './cinema.js';
import { BroccoliEffect } from './broccoli.js';
import { DamageEffect } from './damage.js';
import { LaserEffect } from './laser.js';

const TYPES = {
  overlay: OverlayEffect,
  fullscreen: FullscreenEffect,
  'face-in-frame': FaceInFrameEffect,
  aura: AuraEffect,
  throw: ThrowEffect,
  thanos: ThanosEffect,
  'clip-pop': ClipPopEffect,
  cinema: CinemaEffect,
  broccoli: BroccoliEffect,
  damage: DamageEffect,
  laser: LaserEffect,
};

export function createEffect(def, deps) {
  const Type = TYPES[def.render && def.render.type];
  if (!Type) {
    console.warn('[meet-memes] unknown render type', def.render && def.render.type, 'in', def.id);
    return null;
  }
  return new Type(def, deps);
}
