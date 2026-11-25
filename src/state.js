import { HAPTICS } from './display/tuning.js';

// Mutable state shared between the socket handlers, the 3D scene and the HUD.
// Kept outside React so 30-60Hz updates never trigger re-renders.
export const phone = {
  steer: 0, // -1 (left) .. 1 (right)
  lean: 0, // -1 (back / brake) .. 1 (forward / push)
  beta: 0,
  gamma: 0,
  jx: 0, // on-foot joystick, -1..1 (right +, up +)
  jy: 0,
  lastUpdate: 0, // performance.now() of the last packet
  packets: 0,
  // Queued swipe moves, consumed by the skateboard each frame.
  pushQueued: 0, // summed push power
  popQueued: 0, // pop power (0 = none)
  popNose: false, // that pop is a nollie (off the nose)
  trickQueued: null, // { type, side } (see TRICKS in Skateboard.jsx)
  revertQueued: 0, // -1 / 1 spin direction (0 = none)
  partialQueued: false, // a half circle given up halfway (grind window: bail)
  resetQueued: false,
  carryQueued: false, // Walk / Ride button: step off and carry the board, or drop back in
  jumpQueued: false, // Jump button (on foot, board in hand)
};

export const net = { connected: false, controllers: 0 };

export const board = {
  speed: 0, x: 0, y: 0, z: 0, heading: 0, steer: 0, lean: 0, source: 'none', trick: null, fakie: false,
  score: 0, // points this session (manuals, caveman)
  // Ragdoll bail in progress (Skateboard <-> RiderModel): { req: { vel } to start, at: pelvis position, done }.
  ragdoll: null,
  mirror: 1, // -1 = the rider is mirrored (goofy, or riding switch): right foot forward
  // Where the board is drawn this frame ({ x, y, z }): x/y/z above are the latest physics step, while the drawn
  // position is interpolated between steps. The camera follows this so the skater never shivers on >60 Hz screens.
  drawn: null,
  mode: 'ride', // 'ride' | 'bail' | 'toBoard' | 'dismount' | 'walk' | 'mount' (Skateboard.jsx)
  // Off-board pose for the rider (choreo.js), null while riding: { w: blend weight vs. the skate pose, ...pose }.
  pose: null,
  loose: null, // the board's own position while it's away from the rider (after a bail)
  // Read by the rider animation each frame.
  anim: { pushT: -1, popT: -1, flip: -1, air: false, pitch: 0, steer: 0, fall: 0 },
  // The deck's own rotation (radians) and height (m), mirrored by the 3D board on the phone.
  view: { roll: 0, pitch: 0, yaw: 0, spin: 0, lift: 0, height: 0, mode: 'ride' }, // mode: 'ride' | 'carry' | 'find' | 'off' (phone screen + button)
};
// board.trick = { name, at } is set on landing for the HUD callout.

export const PHONE_TIMEOUT_MS = 1000;
export const phoneIsLive = () => performance.now() - phone.lastUpdate < PHONE_TIMEOUT_MS;

// Whether the game is actually running (not on a menu, not paused waiting for the phone).
// keyboard = the player chose "Play with keyboard" on the pairing screen, so no phone is required.
export const game = { running: false, keyboard: false };

// Haptic events for the phone ('push', 'land', ... in tuning.js HAPTICS), throttled per type. Display.jsx sends them.
export const haptics = [];
const lastHaptic = {};
export function haptic(type) {
  const now = performance.now();
  if (!HAPTICS[type] || now - (lastHaptic[type] ?? -1e9) < HAPTICS[type].gap * 1000) return;
  lastHaptic[type] = now;
  if (haptics.length < 8) haptics.push(type);
}
