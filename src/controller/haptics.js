import { HAPTICS } from '../display/tuning.js';

// Phone vibration (navigator.vibrate). Not available on iPhone Safari: there `supported` is false, the toggle is
// hidden and every buzz is a no-op. The on/off choice is saved on the phone (localStorage).
const KEY = 'skate.phone.v1';
export const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

const prefs = { vibrate: true };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) ?? 'null'));
} catch {
  /* blocked storage: defaults */
}
export const vibrateOn = () => supported && prefs.vibrate !== false;
export function setVibrate(on) {
  prefs.vibrate = !!on;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* not saved, still applies */
  }
}

// One vibration pattern (ms, or [on, off, on, ...]).
export function buzz(pattern) {
  if (!vibrateOn()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some browsers throw without a user gesture first */
  }
}

// A haptic event from the game ('push', 'land', ...): its pattern from tuning.js, at most once per its gap.
const last = {};
export function playHaptic(type) {
  const h = HAPTICS[type];
  const now = performance.now();
  if (!h || now - (last[type] ?? -1e9) < h.gap * 1000) return;
  last[type] = now;
  buzz(h.pattern);
}
