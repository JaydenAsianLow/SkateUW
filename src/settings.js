// Player settings for the display: airtime, phone sensitivity, the custom spawn point and the rebindable spawn keys.
// Saved per browser in localStorage (best effort: private mode just forgets them on reload).

import { clampSensitivity } from './sensitivity.js';

const STORE_KEY = 'skate.settings.v1';

export const AIRTIME_MIN = 1;
export const AIRTIME_MAX = 2.5;

const DEFAULTS = {
  airtime: 1.7, // hang-time multiplier for popped jumps (1 = the original real-ish ollie)
  sensitivity: 0, // index into SENSITIVITY (sensitivity.js), sent to the phone
  returnKey: 'Space', // teleport back to the spawn point
  setSpawnKey: 'KeyP', // make the current spot the spawn point
  spawn: null, // { x, y, z, heading } or null for the level's default spawn
};

// Keys the fixed keyboard controls already use (Display.jsx keyMap). Spawn keys can't take these.
export const RESERVED_KEYS = {
  KeyW: 'push', ArrowUp: 'push', KeyS: 'manual', ArrowDown: 'manual',
  KeyA: 'steer left', ArrowLeft: 'steer left', KeyD: 'steer right', ArrowRight: 'steer right',
  ShiftLeft: 'ollie', ShiftRight: 'ollie', KeyF: 'kickflip', KeyG: 'varial flip', KeyT: 'tre flip',
  KeyV: 'pop shove-it', KeyE: 'frontside 180', KeyQ: 'revert', Escape: 'cancel',
};

export const settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
  if (saved && typeof saved === 'object') Object.assign(settings, saved);
} catch {
  /* unreadable or blocked storage: use defaults */
}
settings.airtime = Math.min(AIRTIME_MAX, Math.max(AIRTIME_MIN, Number(settings.airtime) || DEFAULTS.airtime));
settings.sensitivity = clampSensitivity(settings.sensitivity);
delete settings.leanBack; // old option (lean back is always a manual now)

const listeners = new Set();
export const onSettings = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export function updateSettings(patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* not saved, still applies this session */
  }
  for (const fn of listeners) fn({ ...settings });
}

// "KeyP" -> "P", "Digit1" -> "1", "Space" -> "Space", "ArrowUp" -> "↑"
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return arrows[code] ?? code.replace(/(Left|Right)$/, ' $1').trim();
}

// One-shot commands from keys / HUD buttons, consumed by the skateboard each frame.
export const commands = { toSpawn: false, setSpawn: false, clearSpawn: false, rebinding: false };
