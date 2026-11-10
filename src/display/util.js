// Small helpers shared by the display code.

// Ease `current` toward `target` at `lambda` per second (frame-rate independent).
export const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
export const smooth = (t) => t * t * (3 - 2 * t); // smoothstep on 0..1
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // to -π..π

// The page's URL query (debug switches like ?play, ?sidecam, ?spawn=...).
export const urlParams = new URLSearchParams(globalThis.location?.search ?? '');
