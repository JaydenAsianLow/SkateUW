// Player settings for the display: airtime, the custom spawn point (set from the phone; keyboard P / Space), and the shared ones
// (shared.js: stance, camera, ragdoll, truck sensitivity).
// Saved per browser in localStorage (best effort: private mode just forgets them on reload).

import { SHARED_DEFAULTS, sharedOnly } from './shared.js';

const STORE_KEY = 'skate.settings.v1';

export const AIRTIME_MIN = 1;
export const AIRTIME_MAX = 2.5;

const DEFAULTS = {
  airtime: 1.7, // hang-time multiplier for popped jumps (1 = the original real-ish ollie)
  returnKey: 'Space', // teleport back to the spawn point
  setSpawnKey: 'KeyP', // make the current spot the spawn point
  spawn: null, // { x, y, z, heading } or null for the level's default spawn
  ...SHARED_DEFAULTS, // stance, ... (shared.js: also changeable from the phone)
};

export const settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
  if (saved && typeof saved === 'object') Object.assign(settings, saved);
} catch {
  /* unreadable or blocked storage: use defaults */
}
settings.airtime = Math.min(AIRTIME_MAX, Math.max(AIRTIME_MIN, Number(settings.airtime) || DEFAULTS.airtime));
Object.assign(settings, sharedOnly(settings));
delete settings.character; // old option (the restyled Mixamo body was removed)
delete settings.leanBack; // old option (lean back is always a manual now)
delete settings.response; // old option (one steering curve now)
delete settings.manual; // old option (one manual difficulty now)
delete settings.sensitivity; // old phone preset, replaced by Truck sensitivity

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
export const commands = { toSpawn: false, setSpawn: false, clearSpawn: false };
