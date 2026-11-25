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
// Rolling uphill: share of the speed lost to the climb that is given back, on slopes up to HILL_ASSIST_MAX_DEG
// (0 = pure physics: climbing 1.05 m then needs ~5.6 m/s; 0.7 = it costs like 0.3 m, two or three pushes).
export const HILL_ASSIST = 0.7;
export const HILL_ASSIST_MAX_DEG = 12;

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
// Locking on: the board snaps onto a line it's this close to (m, in plan) while in the air, easing over SNAP_TIME (s).
export const GRIND_SNAP = 0.3;
export const GRIND_SNAP_TIME = 0.15;
// An ollie can reach a line up to this far above the board's underside (m): the ollie alone peaks ~0.45 m, so the
// handrails (0.9 m) need the lift. Rolling off something (no pop) only catches lines within GRIND_DROP_IN below.
export const GRIND_REACH = 0.55;
export const GRIND_DROP_IN = 0.4;
export const GRIND_SQUARE_KEEP = 0.7; // share of your speed kept when you hit a rail square-on (any angle locks on; along it keeps all of it)
export const GRIND_MIN_ENTRY = 1.0; // m/s along the line needed to lock on
// The grind window: the trick is picked from the ollie's pop until GRIND_WINDOW s after locking on, then locked.
// Ollied on + a half circle = boardslide; no jump or no gesture = 50-50; a half circle given up halfway in the
// window, or any half circle after it, = bail. Riding on without an ollie: the window starts GRIND_PRE s before.
export const GRIND_WINDOW = 0.4;
export const GRIND_PRE = 0.35;
// Slowing down on each surface (fraction of speed lost per second): waxed rails slide best, ledges and curbs grab more.
export const GRIND_DRAG = { rail: 0.06, ledge: 0.1, curb: 0.13 };
export const GRIND_BOARDSLIDE_DRAG = 1.3; // boardslides scrub this much more than 50-50s
export const GRIND_SLOPE = 0.35; // share of gravity along a sloped line (handrails speed you up a little going down)
export const GRIND_MIN_SPEED = 0.6; // m/s: slower than this you stall and drop off
export const GRIND_MAX_SPEED = 9; // m/s
export const GRIND_EXIT_LIFT = 1.4; // m/s up when you pop off the end of a line (or ollie out)
// Long lines: keep the marker in the drifting green zone by tilting the phone left / right (like the manual meter).
export const GRIND_BALANCE = {
  '5050': { drift: 0.8, swing: 0.2, zone: 0.14, tolerance: 0.9, sway: 0.08 },
  boardslide: { drift: 1.0, swing: 0.22, zone: 0.12, tolerance: 0.8, sway: 0.1 },
};
// Side camera on long grinds: out to the side of the line (the side with more room), a bit behind, looking ahead.
// It blends in and back out at `blend` (1/s); the usual wall check keeps it out of buildings.
export const GRIND_CAM = { distance: 4.2, height: 1.3, back: 1.0, ahead: 1.6, blend: 3 };
// Riding up to a curb's edge (no ollie): locks on when the board is this close (m), within this angle of the curb
// (degrees, a shallow approach) and moving toward it. Only for edges up to GRIND_CURB_MAX high; taller needs an ollie.
export const GRIND_CURB_ANGLE = 25;
export const GRIND_CURB_TOWARD = 0.25; // m/s toward the edge needed (so riding alongside a curb doesn't lock on)
// End of a line: carry on onto another line starting within this distance (m) — round a pad's corner — if the
// turn is at most GRIND_CORNER_TURN degrees. Keeps GRIND_CORNER_KEEP of the speed. Counts as a combo.
export const GRIND_CORNER = 0.5;
export const GRIND_CORNER_TURN = 110;
export const GRIND_CORNER_KEEP = 0.92;
export const GRIND_CHAIN_CORNERS = false; // true: at the end of a pad edge carry on round the corner onto the next edge (combo)
export const GRIND_COOL = 0.6; // s after leaving a line: no locking onto lines near where you left (so popping off a pad's end doesn't grab the next edge)
export const GRIND_COOL_R = 2.5; // m: how near counts
export const GRIND_STUCK = 1.0; // s: a board that can't follow its line this long is let go (never trapped)
export const GRIND_NEAR = 5; // m: lines further than this from the skater aren't checked (grid lookup, grid cell = this)
// Scoring: points grow with the distance ground and the time on the line (balanced, on long ones). Rails pay more
// than ledges, ledges more than curbs; a boardslide more than a 50-50.
export const GRIND_POINTS = { perMetre: 12, perSecond: 25 };
export const GRIND_SURFACE_POINTS = { rail: 1.5, ledge: 1.2, curb: 1.0 };
export const GRIND_TRICK_POINTS = { '5050': 1.0, boardslide: 1.4 };
export const grindPoints = (type, kind, metres, seconds) =>
  Math.round((GRIND_POINTS.perMetre * metres + GRIND_POINTS.perSecond * seconds) * GRIND_SURFACE_POINTS[type] * GRIND_TRICK_POINTS[kind]);
// Combos: a grind or manual started within COMBO_WINDOW seconds of the last one ending (rounding a corner counts)
// scores (1 + COMBO_BONUS x links so far) times its points. A bail ends the combo.
export const COMBO_WINDOW = 1.5;
export const COMBO_BONUS = 0.5;
