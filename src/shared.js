// Player settings that both screens can change: the laptop saves them (settings.js) and sends them to the phone
// ('config'); the phone's Settings sheet sends changes back ('setting'). The server checks them with cleanSetting.

import { TRUCK_MAX, TRUCK_MIN } from './display/tuning.js';

// Choice settings: key -> allowed values (the first is the default).
export const CHOICES = {
  stance: ['regular', 'goofy'],
  camera: ['behind', 'shoulder', 'side'],
  response: ['softer', 'linear'],
  ragdoll: ['on', 'off'],
};

// Number settings (sliders): key -> { min, max, step, def }.
export const RANGES = {
  truck: { min: TRUCK_MIN, max: TRUCK_MAX, step: 0.05, def: 1 },
};
export const RANGE_UI = [['truck', 'Truck sensitivity', 'How far the board turns for a tilt. Calibration and the dead zone stay the same.']];

// How the Settings menus (laptop and phone) show them: [key, label, { value: button text }, hint].
export const CHOICE_UI = [
  ['stance', 'Stance', { regular: 'Regular', goofy: 'Goofy' }, 'Goofy rides right foot forward.'],
  ['response', 'Steering response', { softer: 'Softer', linear: 'Linear' }, 'Softer = less turn for small tilts (as before).'],
  ['ragdoll', 'Ragdoll falls', { on: 'On', off: 'Off' }, 'Bails with physics (On) or the animated falls (Off).'],
  ['camera', 'Camera', { behind: 'Behind', shoulder: 'Shoulder', side: 'Side' }, 'Behind, over the shoulder, or from the side.'],
];

export const SHARED_DEFAULTS = {
  ...Object.fromEntries(Object.entries(CHOICES).map(([k, v]) => [k, v[0]])),
  ...Object.fromEntries(Object.entries(RANGES).map(([k, r]) => [k, r.def])),
};

// A valid value for `key`, or undefined if the key or value isn't allowed.
export function cleanSetting(key, value) {
  if (CHOICES[key]) return CHOICES[key].includes(value) ? value : undefined;
  const r = RANGES[key];
  if (r && typeof value === 'number' && Number.isFinite(value)) return Math.round(Math.min(r.max, Math.max(r.min, value)) / r.step) * r.step;
  return undefined;
}

export const sharedOnly = (obj) => Object.fromEntries(Object.keys(SHARED_DEFAULTS).map((k) => [k, cleanSetting(k, obj?.[k]) ?? SHARED_DEFAULTS[k]]));
