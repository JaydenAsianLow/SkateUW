// Phone sensitivity presets, chosen in the laptop's Settings and sent to the phone:
// how far you tilt for full steering (degrees), and how short a swipe still counts (fraction of screen height).
export const SENSITIVITY = [
  { label: 'Normal', tilt: 30, swipe: 0.04 },
  { label: 'High', tilt: 24, swipe: 0.028 },
  { label: 'Max', tilt: 18, swipe: 0.02 },
];
export const clampSensitivity = (v) => (Number.isInteger(v) && SENSITIVITY[v] ? v : 0);
