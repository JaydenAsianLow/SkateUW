// Every gameplay and camera tuning number in one place. Units: metres, seconds, radians.

// ---------- Riding (Skateboard.jsx) ----------
export const GRAVITY = 15; // m/s². A bit over real g so jumps feel snappy without floating.
export const MAX_SPEED = 8; // m/s (~29 km/h)
export const PUSH_GAIN = 1.9; // m/s added per push swipe (scaled by swipe power)
export const PUSH_TIME = 0.28; // seconds a push is spread over, so it feels like a kick, not a teleport
export const ROLL_DRAG = 0.22; // fraction of speed lost per second while coasting
export const TURN_RATE = 2.0; // rad/s at full steer
export const STEER_RESPONSE = 7; // how fast the board follows the phone tilt (lower = stiffer, heavier)
// Ollie: apex = v² / 2g. 3.7 m/s → ~0.45 m at a normal swipe, ~0.3–0.6 m from a lazy to a hard swipe
// (a typical street ollie). Power scales the apex height linearly, so v ∝ √power.
export const POP_VELOCITY = 3.7;
export const TRICK_WINDOW = 0.5; // seconds after the pop that a trick swipe still upgrades the ollie (at airtime 1)
// The Airtime setting (settings.js) scales the pop, gravity and trick window: see airPhysics in Skateboard.jsx.
export const LAND_OK = 0.78; // a trick at least this far through its rotation when you land still counts
export const ASSIST_MAX = 1.2; // m/s of extra lift a late trick may get so it can finish (keeps tricks landable)
export const REVERT_TIME = 0.34; // seconds for a ground revert (180° on the wheels)

// Trick definitions. flip = kickflip turns (board roll), shove = board-only yaw turns,
// spin = rider + board yaw turns (you ride away fakie after a 180). time = seconds for the rotation.
export const TRICKS = {
  kickflip: { name: 'KICKFLIP', time: 0.3, flip: 1 },
  varial: { name: 'VARIAL FLIP', time: 0.34, flip: 1, shove: 0.5 },
  tre: { name: 'TRE FLIP', time: 0.4, flip: 1, shove: 1 },
  shove: { name: 'POP SHOVE-IT', time: 0.3, shove: 0.5 },
  fs180: { name: 'FRONTSIDE 180', time: 0.4, spin: 0.5, dir: 1 },
  bs180: { name: 'BACKSIDE 180', time: 0.4, spin: 0.5, dir: -1 },
};

// Manuals: tilt the top of the phone up (lean back) to lift the front wheels and ride on the back two.
// The meter bar runs 0..1 with the phone's lean back (1 = full lean). Past MANUAL_IN a manual starts; then a green
// zone drifts along the bar and you keep the marker in it by tilting.
// Out of the zone for `tolerance` s (a second to get back into the green): the front wheels drop. Marker at MANUAL_BAIL_AT: you fall backwards.
// Phone back to level (below MANUAL_LET_GO): the front wheels drop at once.
export const MANUAL_IN = 0.25;
export const MANUAL_LET_GO = 0.1;
export const MANUAL_BAIL_AT = 0.93;
export const MANUAL_ZONE_MID = 0.55; // the zone drifts around here (the old fixed zone was 0.25..0.85)
export const MANUAL_DRIFT_GROW = 0.12; // the drift gets this much faster per second held
// drift: how fast the zone wanders, swing: how far it wanders from the middle, zone: half-width of the green,
// tolerance: s outside the zone before the wheels drop, sway: how much the marker itself wanders (x speed).
export const MANUAL_BALANCE = { drift: 1.0, swing: 0.18, zone: 0.12, tolerance: 1.0, sway: 0.07 };
// Points: MANUAL_POINTS per second, and the rate grows by MANUAL_POINTS_GROW per second held (2 s = 300, 5 s = 1125).
export const MANUAL_POINTS = 100;
export const MANUAL_POINTS_GROW = 0.25;
export const manualPoints = (t) => Math.round(MANUAL_POINTS * t * (1 + MANUAL_POINTS_GROW * t));
export const MANUAL_PITCH_MIN = 0.12; // rad, nose up at the start of the zone
export const MANUAL_PITCH_MAX = 0.3; // rad, nose up at the edge (tail almost on the ground)
export const MANUAL_MIN_SPEED = 0.6; // m/s; slower than this you just stand on it
export const MANUAL_CALLOUT = 0.6; // s held before it counts as a manual

// ---------- Bails (choreo.js has the falls) ----------
// The rider falls by kind (manual too far back = backwards; trick under-rotated = a stumble onto the hands and
// knees when slow, a tumbling slam when fast), the board flies off on its own, the rider gets up and you walk to it
// (within AUTO_GRAB the skater picks it up), then Get on. Severity grows with speed.
export const BAIL_SLOW = 1.5; // m/s: at or below this a bail is as gentle as it gets
export const BAIL_FAST = 6.5; // m/s: the most severe
export const SLAM_AT = 0.45; // severity from which a trick bail is a slam instead of a stumble
export const BOARD_DRAG = 1.3; // loose board: fraction of speed lost per second rolling on the ground

// Ragdoll bails (Settings → Ragdoll falls; ragdoll.js). Capsule radii (m) per body part; the tumble is a random
// spin (rad/s) added to the crash speed. It ends after lying still (pelvis slower than RAGDOLL_STILL_SPEED) for
// RAGDOLL_STILL_TIME (the '2-3 s mostly stopped'), at least RAGDOLL_MIN_TIME after the crash and at most
// RAGDOLL_MAX_TIME, then blends to
// standing over RAGDOLL_BLEND.
export const RAGDOLL_RADIUS = { pelvis: 0.13, chest: 0.14, head: 0.1, upperArm: 0.05, foreArm: 0.045, thigh: 0.075, shin: 0.055, foot: 0.05, toe: 0.04 };
export const RAGDOLL_TUMBLE = 2.5;
export const RAGDOLL_KNEE_MAX = 2.4; // rad the knee can bend (it can't bend the other way)
export const RAGDOLL_ELBOW_MAX = 2.5;
export const RAGDOLL_DAMPING = { linear: 0.05, angular: 0.8 };
export const RAGDOLL_FRICTION = 0.9;
export const RAGDOLL_STILL_SPEED = 0.25;
export const RAGDOLL_STILL_TIME = 2.0;
export const RAGDOLL_MIN_TIME = 1.0;
export const RAGDOLL_MAX_TIME = 7.0;
export const RAGDOLL_BLEND = 0.5;

// ---------- On foot ----------
// Get off on the phone / B, or after a bail: the phone shows a joystick, moving relative to the camera.
// The stick is smoothed (~0.1 s), has a 15% dead zone and a squared response: precise near the centre, a run only
// at the edge. The animation blends idle -> walk -> run by speed (choreo.js walkPose).
export const STICK_DEAD = 0.15;
export const STICK_SMOOTH = 10; // 1/s (time constant 0.1 s)
export const RUN_SPEED = 4.2; // m/s at full push (without a run clip; with one, its own speed so it plays 1:1)
export const TURN_MAX = 6; // rad/s; the turn rate itself eases in/out so the body doesn't snap round
export const AUTO_GRAB = 1.0; // m: walking this close to a board on the ground picks it up
export const ON_THE_MOVE = 1.5; // m/s: faster than this, Get on is a running jump and Get off a hop into a run
// Jump on foot with the board in hand (phone Jump / Space). Airtime = 2 v / g, so ~0.56 s and ~0.6 m high.
export const FOOT_JUMP_SPEED = 4.2; // m/s straight up
export const FOOT_AIR_CONTROL = 0.35; // how much the joystick can still change your speed in the air (1 = as on the ground)
export const FOOT_LAND_TIME = 0.25; // s of landing crouch
// Caveman: Get on in the air lets the board go so it drops under your feet. It works when you let go this long
// before touching down (the board needs a moment to get under you; too early and it lands before you do).
export const CAVEMAN_MIN_LEAD = 0.12; // s
export const CAVEMAN_MAX_LEAD = 0.45; // s
export const CAVEMAN_POINTS = 250;

// ---------- Chase camera (CameraRig.jsx, DESIGN.md §3) ----------
// Low over-the-shoulder: hip height, ~2.5–3 m behind and a little to the right so the skater sits left of centre,
// nearly level with a slight downward tilt, lagging on turns and rolling a few degrees into them.
export const CAM_DISTANCE = 2.7; // m behind the board
export const CAM_HEIGHT = 1.2;
export const CAM_RIGHT = 0.55;
export const CAM_LOOK_AHEAD = 4;
export const CAM_LOOK_RIGHT = 0.35;
export const CAM_LOOK_Y = 0.7; // ~3.5° down-tilt
export const CAM_MAX_ROLL = (3 * Math.PI) / 180;
export const CAM_FOLLOW = 6; // camera position easing rate (1/s)

// Camera views (Settings → Camera, or the View button on the phone). Behind uses the numbers above.
export const CAM_SWITCH_TIME = 0.4; // s, blend between views
// Over the shoulder: close, at shoulder height, off to the rider's back (heel) side, looking well ahead past them.
export const SHOULDER_DISTANCE = 1.7;
export const SHOULDER_HEIGHT = 1.55;
export const SHOULDER_SIDE = 0.5;
export const SHOULDER_LOOK_AHEAD = 7;
export const SHOULDER_LOOK_Y = 1.1;
// Side view: out on the rider's toe side (where they face), level with the knees, so the feet and board show.
export const SIDE_DISTANCE = 3.2;
export const SIDE_HEIGHT = 0.9;
export const SIDE_LOOK_Y = 0.55;
export const SIDE_LOOK_AHEAD = 0.6; // look a little ahead of the rider so there's room in front
// Walls / stairs between the rider and the camera: pull the camera in to this far in front of the hit.
export const CAM_CLIP_PAD = 0.2;
export const CAM_CLEAR_FROM = [1.2, 0.4]; // m above the board: rays to the camera from the head and the knees
export const CAM_MIN_DISTANCE = 0.6;

// ---------- Phone vibration (haptics) ----------
// Events the game sends to the phone. pattern: ms on (or [on, off, on, ...]) for navigator.vibrate;
// gap: at most one of that event per this many seconds (checked on the laptop and again on the phone).
export const HAPTICS = {
  push: { pattern: 12, gap: 0.15 },
  land: { pattern: 30, gap: 0.25 }, // an ollie / jump landed
  trick: { pattern: [20, 30, 45], gap: 0.3 }, // a flip / shove-it / 180 / caveman landed
  manual: { pattern: [10, 30, 10], gap: 0.5 }, // front wheels up
  manualWarn: { pattern: 8, gap: 0.2 }, // marker outside the green zone
  bail: { pattern: [90, 50, 180], gap: 1.5 },
};

// ---------- Phone tilt -> steering (steering.js, used on the phone) ----------
// Dead zone, then full lock TILT_RANGE_DEG from neutral at Truck sensitivity 1 (the old 'Normal' preset).
// Truck sensitivity (Settings, TRUCK_MIN..TRUCK_MAX) scales the tilt past the dead zone: 2 = full lock at 17.5°,
// 0.5 = at 55°. STEER_CURVE bends it: a little less turn for small tilts, so a steady hand rides straight.
export const TILT_DEADZONE_DEG = 5;
export const TILT_RANGE_DEG = 30;
export const STEER_CURVE = 1.25;
export const TRUCK_MIN = 0.5;
export const TRUCK_MAX = 2;
export const SWIPE_MIN = 0.04; // shortest swipe that counts, as a fraction of the screen height

// --- Grinding (src/display/grind/). Grind lines are built once when the level loads.
export const GRIND_LONG = 10; // m: lines at least this long are "long" (balance bar + side camera); shorter ones auto-complete
export const GRIND_MIN_LEN = 1.5; // m: scanned edges shorter than this are not grindable
export const GRIND_MIN_DROP = 0.1; // m: a scanned edge must stand at least this far above the ground beside it ...
export const GRIND_MAX_DROP = 0.65; // m: ... and at most this far (taller = a wall, not a ledge)
export const GRIND_CURB_MAX = 0.3; // m: scanned edges up to this height are curbs, higher ones ledges
