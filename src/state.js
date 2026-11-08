// Mutable state shared between the socket handlers, the 3D scene and the HUD.
// Kept outside React so 30-60Hz updates never trigger re-renders.
export const phone = {
  steer: 0, // -1 (left) .. 1 (right)
  lean: 0, // -1 (back / brake) .. 1 (forward / push)
  beta: 0,
  gamma: 0,
  lastUpdate: 0, // performance.now() of the last packet
  packets: 0,
  // Queued swipe moves, consumed by the skateboard each frame.
  pushQueued: 0, // summed push power
  popQueued: 0, // pop power (0 = none)
  trickQueued: null, // { type, side } (see TRICKS in Skateboard.jsx)
  revertQueued: 0, // -1 / 1 spin direction (0 = none)
  resetQueued: false,
};

export const net = { connected: false, controllers: 0 };

export const board = {
  speed: 0, x: 0, y: 0, z: 0, heading: 0, steer: 0, lean: 0, source: 'none', trick: null, fakie: false,
  // Read by the rider animation each frame.
  anim: { pushT: -1, popT: -1, flip: -1, air: false, pitch: 0, steer: 0, fall: 0 },
  // The deck's own rotation (radians) and height (m), mirrored by the 3D board on the phone.
  view: { roll: 0, pitch: 0, yaw: 0, spin: 0, lift: 0, height: 0 },
};
// board.trick = { name, at } is set on landing for the HUD callout.

export const PHONE_TIMEOUT_MS = 1000;
export const phoneIsLive = () => performance.now() - phone.lastUpdate < PHONE_TIMEOUT_MS;
