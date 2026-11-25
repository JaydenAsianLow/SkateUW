// Player settings that both screens can change: the laptop saves them (settings.js) and sends them to the phone
// ('config'); the phone's Settings sheet sends changes back ('setting'). The server checks them with cleanSetting.

// Choice settings: key -> allowed values (the first is the default).
export const CHOICES = {
  stance: ['regular', 'goofy'],
  camera: ['behind', 'shoulder', 'side'],
  manual: ['medium', 'easy', 'hard'],
};

// How the Settings menus (laptop and phone) show them: [key, label, { value: button text }, hint].
export const CHOICE_UI = [
  ['stance', 'Stance', { regular: 'Regular', goofy: 'Goofy' }, 'Goofy rides right foot forward.'],
  ['manual', 'Manual', { easy: 'Easy', medium: 'Medium', hard: 'Hard' }, 'How fast the green zone drifts, and how small it is.'],
  ['camera', 'Camera', { behind: 'Behind', shoulder: 'Shoulder', side: 'Side' }, 'Behind, over the shoulder, or from the side.'],
];

export const SHARED_DEFAULTS = Object.fromEntries(Object.entries(CHOICES).map(([k, v]) => [k, v[0]]));

// A valid value for `key`, or undefined if the key or value isn't allowed.
export function cleanSetting(key, value) {
  if (CHOICES[key]) return CHOICES[key].includes(value) ? value : undefined;
  return undefined;
}

export const sharedOnly = (obj) => Object.fromEntries(Object.keys(SHARED_DEFAULTS).map((k) => [k, cleanSetting(k, obj?.[k]) ?? SHARED_DEFAULTS[k]]));
