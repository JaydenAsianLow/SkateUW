import { STEER_CURVE, TILT_DEADZONE_DEG, TILT_RANGE_DEG } from './display/tuning.js';

// Phone tilt (degrees from the calibrated neutral) -> -1..1. Nothing inside the dead zone; past it, `truck` scales
// the tilt (Truck sensitivity: 2 = half the tilt for the same turn), full lock at TILT_RANGE_DEG / truck past the
// dead zone. STEER_CURVE bends it: less turn for small tilts.
export function tiltToSteer(deg, truck = 1) {
  const over = (Math.max(0, Math.abs(deg) - TILT_DEADZONE_DEG) * truck) / (TILT_RANGE_DEG - TILT_DEADZONE_DEG);
  return Math.sign(deg) * Math.min(1, over) ** STEER_CURVE;
}

// Lean (manual) keeps the original shaping: no truck sensitivity.
export const tiltToLean = (deg) => tiltToSteer(deg, 1);
