import { STEER_CURVES, TILT_DEADZONE_DEG, TILT_RANGE_DEG } from './display/tuning.js';

// Phone tilt (degrees from the calibrated neutral) -> -1..1. Nothing inside the dead zone; past it, `truck` scales
// the tilt (Truck sensitivity: 2 = half the tilt for the same turn), full lock at TILT_RANGE_DEG / truck past the
// dead zone. The response curve bends it: 'softer' turns less for small tilts, 'linear' is straight.
export function tiltToSteer(deg, truck = 1, response = 'softer') {
  const over = (Math.max(0, Math.abs(deg) - TILT_DEADZONE_DEG) * truck) / (TILT_RANGE_DEG - TILT_DEADZONE_DEG);
  return Math.sign(deg) * Math.min(1, over) ** (STEER_CURVES[response] ?? STEER_CURVES.softer);
}

// Lean (manual) keeps the original shaping: no truck sensitivity, the softer curve.
export const tiltToLean = (deg) => tiltToSteer(deg, 1, 'softer');
