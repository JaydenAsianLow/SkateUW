import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { CuboidCollider, RigidBody, useRapier } from '@react-three/rapier';
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Quaternion, Shape, Vector3 } from 'three';
import { board, game, haptic, phone, phoneIsLive } from '../state.js';
import { commands, settings, updateSettings } from '../settings.js';
import { BOARD_HALF_Y, DECK_TOP, PUSH_ANIM, materials, merge } from './look.js';
import { LOW, SPAWN } from './redSquare/layout.js';
import Rider from './RiderModel.jsx';
import { NOT_RAGDOLL, PLAYER_GROUPS } from './ragdoll.js';
import { mocap, runTopSpeed } from './mocap.js';
import { clamp, clamp01, damp, urlParams, wrapAngle } from './util.js';
import {
  ASSIST_MAX, AUTO_GRAB, BAIL_FAST, CAVEMAN_MAX_LEAD, CAVEMAN_MIN_LEAD, CAVEMAN_POINTS, FOOT_AIR_CONTROL, FOOT_JUMP_SPEED,
  FOOT_LAND_TIME, BAIL_SLOW, BOARD_DRAG, GRAVITY, LAND_OK, MANUAL_BAIL_AT, MANUAL_CALLOUT, MANUAL_BALANCE, MANUAL_DRIFT_GROW, MANUAL_IN, MANUAL_LET_GO,
  MANUAL_ZONE_MID, manualPoints,
  MANUAL_MIN_SPEED, MANUAL_PITCH_MAX, MANUAL_PITCH_MIN, MAX_SPEED, ON_THE_MOVE, POP_VELOCITY, PUSH_GAIN, PUSH_TIME,
  REVERT_TIME, ROLL_DRAG, RUN_SPEED, SLAM_AT, STEER_RESPONSE, STICK_DEAD, STICK_SMOOTH, TRICKS, TRICK_WINDOW, TURN_MAX,
  TURN_RATE, GRIND_EXIT_LIFT,
} from './tuning.js';
import { grind } from './grind/lines.js';
import { addScuff, at, continueGrind, findCorner, findCurbEntry, findEntry, grindName, nearby, startGrind, stepGrind } from './grind/grinding.js';
import { bailTrack, cavemanTrack, dismountTrack, evalTrack, finish, mountTrack, pickupTrack, rootAt, runDismountTrack, runMountTrack, trackWeight, jumpPose, walkPose, walkRate } from './choreo.js';

// Airtime setting A (settings.js): popped jumps hang A× longer. Pop speed ∝ A^-¼ and gravity ∝ A^-1¼,
// so the jump also gets a bit higher (∝ A^¾) instead of just floating in slow motion.
// A = 1.7 → ~0.9 s in the air and ~0.75 m apex (vs ~0.5 s / 0.45 m at A = 1).
const airPhysics = () => {
  const A = settings.airtime;
  return { pop: POP_VELOCITY * A ** -0.25, g: GRAVITY * A ** -1.25, window: TRICK_WINDOW * A };
};
const stickSpeed = (m) => runTopSpeed(RUN_SPEED) * clamp01((m - STICK_DEAD) / (1 - STICK_DEAD)) ** 2;
const HALF = { x: 0.12, y: BOARD_HALF_Y, z: 0.42 }; // collider half extents (real-size board)
const START = [SPAWN.position[0], HALF.y + 0.05, SPAWN.position[1]];
const PIVOT = DECK_TOP - 0.035; // flips spin around the middle of the board, not the ground

const KEY_TRICKS = ['kickflip', 'varial', 'tre', 'shove', 'fs180'];
const EDGE_KEYS = ['forward', 'pop', 'nollie', 'revert', 'carry', 'jump', ...KEY_TRICKS];

// Goofy (setting) and riding switch both mirror the rider across the board (x -> -x in rider space): right foot
// forward, facing the other edge. -1 = mirrored. Rider space is mirrored, the world (steering, travel) is not.
const mirrorOf = (st) => (settings.stance === 'goofy' ? -1 : 1) * (st.swap ? -1 : 1);
// Fakie + switch is the natural stance with the board turned round (the board's ends look alike): call it natural.
const normalizeStance = (st) => {
  if (st.stance === 1 && st.swap) (st.stance = 0), (st.swap = false);
};
// Trick name prefix from how it was popped.
const stancePrefix = (st) => (st.popSwitch ? 'SWITCH ' : '') + (st.popFakie ? 'FAKIE ' : '') + (st.popNose ? 'NOLLIE ' : '');
const _q = new Quaternion();
const _v = new Vector3();
const DROP = new Vector3(0, -HALF.y, 0);

// Per-frame body updates. Rapier copies the values, so one scratch object each is reused.
const _vel = { x: 0, y: 0, z: 0 };
const _rot = { x: 0, y: 0, z: 0, w: 1 };
function setVelocity(rb, x, y, z) {
  _vel.x = x;
  _vel.y = y;
  _vel.z = z;
  rb.setLinvel(_vel, true);
}
function setHeading(rb, heading) {
  _rot.y = Math.sin(heading / 2);
  _rot.w = Math.cos(heading / 2);
  rb.setRotation(_rot, true);
}

// Dev only: ?posetest=back:0.8 (or side, slam, dismount, mount, pickup, walk:<speed>) loops one off-board animation
// in place; add a third value to freeze it at that time, e.g. ?posetest=slam:1:0.5. Use with ?play&sidecam.
const POSE_TEST = import.meta.env.DEV ? urlParams.get('posetest') : null;
function poseTestTrack(kind, a) {
  if (kind === 'dismount') return dismountTrack();
  if (kind === 'mount') return mountTrack(walkPose(0.3, 1.2, true), true);
  if (kind === 'runmount') return runMountTrack(walkPose(0, 5, true));
  if (kind === 'hopoff') return runDismountTrack(4, a > 0);
  if (kind === 'pickup') return pickupTrack(walkPose(0.2, 1.2, false), { x: 0.45, y: 0, z: -0.75, yaw: 0.6 });
  return bailTrack(kind, a);
}

export default function Skateboard() {
  const body = useRef(null);
  const stanceG = useRef(null); // rider + board: 180s, reverts, fakie
  const shoveG = useRef(null); // board only: shove-it yaw, trick lift
  const deck = useRef(null); // board only: pop pitch, flip roll, carve roll
  const wheels = useRef([]);
  const boardG = useRef(null); // the board's offset from the rider (stepping off / on, carrying)
  const looseG = useRef(null); // the board loose in the world (after a bail)
  const looseWheels = useRef([]);
  // The rigid body's scene object (stanceG's parent) is what Rapier moves to the interpolated position each frame.
  useEffect(() => {
    board.drawn = stanceG.current.parent.position;
    return () => (board.drawn = null);
  }, []);
  const [, getKeys] = useKeyboardControls();
  const { world, rapier } = useRapier();
  const camera = useThree((t) => t.camera);
  if (import.meta.env.DEV && window.__skate) {
    window.__skate.world = world;
    window.__skate.rapierRay = rapier.Ray; // console / test ray casts
    // Console: __skate.bail('back' | 'side' | 'slam', speed?) to try the falls.
    window.__skate.bail = (kind = 'side', speed) => (s.current.devBail = [kind === 'slam' ? 'side' : kind, speed ?? (kind === 'slam' ? 7 : undefined)]);
    // Console / ?grindtest: put the board somewhere moving ({ x, y, z, heading, vx, vy, vz, popped }); freeze holds it still.
    window.__skate.place = (o) => (s.current.devPlace = o);
    window.__skate.board = board;
  }
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier]);
  const wallRay = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), [rapier]);
  const s = useRef({
    heading: SPAWN.heading,
    steer: 0,
    lean: 0,
    wheelSpin: 0,
    held: {}, // keyboard edge detection
    pushLeft: 0, // remaining push time
    pushAccel: 0,
    popT: -1, // seconds since pop, -1 when not in a trick
    trick: null, // { def, side, t }
    revert: null, // { dir, t }
    stance: 0, // 0 forward, 1 fakie (rider + board turned 180° to the travel direction)
    swap: false, // riding switch: feet the other way round from the Stance setting (a half shove-it from fakie)
    popFakie: false,
    popSwitch: false,
    popNose: false, // this pop was a nollie
    air: false,
    airT: 0,
    pushT: -1, // seconds since the current push stroke started (rider animation)
    // Off the board: mode 'ride' | 'bail' (falling + getting up) | 'dismount' (Get off, board into the hand) |
    // 'walk' (on foot: board in hand, or on the ground after a bail) | 'pickup' | 'mount' (Get on). track = the choreo.js animation being played.
    mode: 'ride',
    modeT: 0,
    track: null,
    loose: null, // the board on its own in the world (after a bail): { x, y, z, vx, vy, vz, yaw, vyaw, pitch, roll, vroll }
    offSpeed: 0, // m/s along the heading while off the board (sliding after a bail, rolling while stepping off/on)
    offDrag: 0,
    walkSpeed: 0,
    walkPhase: 0,
    jumpT: -1, // on foot: seconds since the jump, -1 on the ground
    landT: 0, // on foot: landing crouch left (s)
    caveman: false, // this Get on was a caveman (scores when you land on the board)
    pitchNow: 0,
    manual: 0, // 0 flat .. 1 nose fully up (smoothed)
    manualT: 0, // seconds the current manual has been held
    manualBalance: -1,
  });

  // Distance from a point straight down to the nearest collider (ignoring the board itself).
  const probe = (rb, x, y, z, max) => {
    ray.origin.x = x;
    ray.origin.y = y;
    ray.origin.z = z;
    const hit = world.castRay(ray, max, true, undefined, NOT_RAGDOLL, undefined, rb);
    return hit ? hit.timeOfImpact : Infinity;
  };

  // Rider-space (stance group) vector -> world, and the stance group's world yaw.
  const yawS = (st) => st.heading + st.stance * Math.PI;
  const toWorld = (st, x, z) => {
    const y = yawS(st);
    const c = Math.cos(y);
    const sn = Math.sin(y);
    x *= mirrorOf(st);
    return [x * c + z * sn, -x * sn + z * c];
  };

  // --- Grinding (grind/grinding.js): leave the line. end = 'off' (end of the line: pop off), 'ollie' (popped out),
  // 'stall' (too slow: drop off the side), 'bail', or null (reset: just let go).
  const endGrind = (rb, end) => {
    const st = s.current;
    const g = st.grind;
    st.grind = null;
    board.grind = null;
    rb.collider(0)?.setCollisionGroups(PLAYER_GROUPS);
    rb.setGravityScale(1, true);
    st.grindSkip = { line: g.line, until: performance.now() + 450 };
    const chain = [...(st.grindChain ?? []), { kind: g.kind, type: g.line.type, dist: Math.abs(g.s - g.s0), t: g.t }];
    st.grindChain = [];
    if (!end) return;
    addScuff(g.line, g.s0, g.s);
    const callout = chain.map((c) => `${c.kind === 'boardslide' ? 'BOARDSLIDE' : '50-50'} ${c.dist.toFixed(1)}m`).join(' + ');
    if (end === 'bail') {
      board.trick = { name: `${grindName(g)} BAIL`, at: performance.now() };
      startBail(rb, 'side', g.speed);
      return;
    }
    const { t } = at(g.line, g.s);
    const h = Math.hypot(t[0], t[2]) || 1;
    const speed = g.speed;
    let vx = ((t[0] * g.dir) / h) * speed;
    let vz = ((t[2] * g.dir) / h) * speed;
    let vy = Math.min(0, t[1] * g.dir * speed);
    if (end === 'off') vy += GRIND_EXIT_LIFT;
    if (end === 'ollie') {
      vy = Math.max(vy, 0) + airPhysics().pop;
      Object.assign(st, { popT: 0, trick: null, popFakie: st.stance === 1, popSwitch: st.swap, popNose: false });
    }
    if (end === 'stall' && g.line.inner) (vx -= g.line.inner[0] * 1.2), (vz -= g.line.inner[1] * 1.2); // off the open side
    setVelocity(rb, vx, vy, vz);
    st.slideYaw = 0;
    board.trick = { name: callout, at: performance.now() };
    haptic('land');
  };

  // --- Bail: pick the fall, set the board loose with a kick that grows with speed.
  const startBail = (rb, kind, speed) => {
    const st = s.current;
    const sev = clamp01((speed - BAIL_SLOW) / (BAIL_FAST - BAIL_SLOW));
    const k = kind === 'side' && sev > SLAM_AT ? 'slam' : kind;
    st.mode = 'bail';
    st.modeT = 0;
    st.track = bailTrack(k, sev);
    st.offSpeed = speed * (k === 'back' ? 0.45 : k === 'slam' ? 0.6 : 0.3);
    st.offDrag = k === 'slam' ? 1.5 : k === 'back' ? 2.2 : 3;
    Object.assign(st, { pushLeft: 0, pushT: -1, popT: -1, trick: null, revert: null, air: false, manualT: 0, manual: 0 });
    board.trick = { name: k === 'slam' ? 'SLAM' : 'BAIL', at: performance.now() };
    haptic('bail');
    // Ragdoll falls: physics takes the body from here (RiderModel), carrying on with the crash speed.
    st.ragdoll = settings.ragdoll === 'on';
    if (st.ragdoll) {
      const v = rb.linvel();
      st.track = null;
      board.ragdoll = { req: { vel: { x: -Math.sin(st.heading) * speed, y: v.y, z: -Math.cos(st.heading) * speed } }, at: null, done: false };
    }
    const p = rb.translation();
    const fx = -Math.sin(st.heading);
    const fz = -Math.cos(st.heading);
    const [hx, hz] = toWorld(st, -1, 0); // heel side
    const side = Math.random() < 0.5 ? -1 : 1;
    let fwd;
    let lat = 0;
    let vy = 0;
    let vyaw = side * 1.5 * sev;
    let vroll = 0;
    if (k === 'back') {
      fwd = speed * 1.05 + 0.7 + 1.6 * sev; // shoots out from under you
      vy = 1.4 * sev;
    } else if (k === 'slam') {
      fwd = speed * 0.95 + 0.5;
      lat = 1.2 + sev;
      vy = 1.6 + 1.6 * sev;
      vyaw = side * (5 + 4 * sev);
      vroll = side * 10;
    } else {
      fwd = speed * 0.7;
      lat = 1.1;
      vyaw = side * 2.5;
    }
    st.loose = {
      x: p.x,
      y: p.y - HALF.y,
      z: p.z,
      vx: fx * fwd + hx * lat,
      vy,
      vz: fz * fwd + hz * lat,
      yaw: yawS(st),
      vyaw,
      pitch: st.pitchNow,
      roll: 0,
      vroll,
      spin: st.wheelSpin,
    };
  };

  // The loose board: rolls and skids to a stop, bounces off walls, falls off ledges, settles flat.
  const updateLoose = (rb, dt) => {
    const L = s.current.loose;
    const gd = probe(rb, L.x, L.y + 0.6, L.z, 6);
    const ground = Number.isFinite(gd) ? L.y + 0.6 - gd : L.y - 10;
    L.vy -= GRAVITY * dt;
    L.y += L.vy * dt;
    if (L.y <= ground) {
      L.y = ground;
      L.vy = L.vy < -1.2 ? -L.vy * 0.3 : 0;
    }
    const onGround = L.y <= ground + 0.01 && L.vy <= 0;
    const k = Math.exp(-(onGround ? BOARD_DRAG : 0.2) * dt);
    L.vx *= k;
    L.vz *= k;
    const sp = Math.hypot(L.vx, L.vz);
    if (sp > 0.05) {
      wallRay.origin.x = L.x;
      wallRay.origin.y = L.y + 0.08;
      wallRay.origin.z = L.z;
      wallRay.dir.x = L.vx / sp;
      wallRay.dir.y = 0;
      wallRay.dir.z = L.vz / sp;
      const hit = world.castRayAndGetNormal(wallRay, sp * dt + 0.25, true, undefined, NOT_RAGDOLL, undefined, rb);
      if (hit) {
        const n = hit.normal;
        const d = L.vx * n.x + L.vz * n.z;
        if (d < 0) {
          L.vx = (L.vx - 2 * d * n.x) * 0.4;
          L.vz = (L.vz - 2 * d * n.z) * 0.4;
          L.vyaw += (Math.random() - 0.5) * 4;
        }
      }
    }
    L.x += L.vx * dt;
    L.z += L.vz * dt;
    L.vyaw *= Math.exp(-(onGround ? 2.5 : 0.3) * dt);
    L.yaw += L.vyaw * dt;
    if (onGround) L.roll = damp(L.roll, Math.round(L.roll / (Math.PI * 2)) * Math.PI * 2, 12, dt);
    else L.roll += L.vroll * dt;
    L.pitch = damp(L.pitch, 0, onGround ? 8 : 2, dt);
    L.spin += (Math.hypot(L.vx, L.vz) / 0.028) * dt * (onGround ? 1 : 0.3);
  };

  // Board pose in rider space (from the choreography) -> the board group inside the stance group.
  const placeBoard = (pose) => {
    const g = boardG.current;
    if (!g) return;
    if (!pose) {
      g.position.set(0, 0, 0);
      g.quaternion.identity();
      return;
    }
    _q.fromArray(pose.q);
    _v.copy(DROP).applyQuaternion(_q);
    g.position.set(pose.p[0], pose.p[1] - HALF.y, pose.p[2]).sub(_v);
    g.quaternion.copy(_q);
  };
  const showLoose = (on) => {
    if (looseG.current) looseG.current.visible = on;
    if (boardG.current) boardG.current.visible = !on;
  };
  const drawLoose = () => {
    const L = s.current.loose;
    const g = looseG.current;
    if (!L || !g) return;
    g.position.set(L.x, L.y + PIVOT, L.z);
    g.rotation.set(L.pitch, L.yaw, L.roll, 'YXZ');
    for (const w of looseWheels.current) if (w) w.rotation.x = -L.spin;
  };
  const resetBoardVisuals = () => {
    if (stanceG.current) {
      stanceG.current.rotation.y = s.current.stance * Math.PI;
      stanceG.current.scale.x = mirrorOf(s.current);
    }
    if (shoveG.current) {
      shoveG.current.rotation.y = 0;
      shoveG.current.position.y = -HALF.y;
    }
    if (deck.current) deck.current.rotation.set(0, 0, 0);
  };

  // Get off: step off to the heel side, stamp the tail and catch the board in the right hand.
  const startDismount = (speed) => {
    const st = s.current;
    if (speed > ON_THE_MOVE) {
      // Hop off into a run: keep going, easing down to running pace over the hop if you were faster.
      const run = runTopSpeed(RUN_SPEED);
      const fakie = st.stance === 1;
      st.stance = 0; // the hop starts from the fakie stance turned round, so nothing visibly flips
      Object.assign(st, { mode: 'dismount', modeT: 0, track: runDismountTrack(Math.min(speed, run), fakie), offSpeed: speed, offDrag: speed > run ? Math.log(speed / run) / 0.36 : 0, pushLeft: 0, pushT: -1, manual: 0, manualT: 0 });
      return;
    }
    st.offSpeed = speed;
    if (st.stance === 1) {
      // Off the board you walk nose first: turn the body round (same look) and keep sliding the same way.
      st.heading += Math.PI;
      st.stance = 0;
      st.offSpeed = -speed;
    }
    Object.assign(st, { mode: 'dismount', modeT: 0, track: dismountTrack(), offDrag: 3, pushLeft: 0, pushT: -1, manual: 0, manualT: 0 });
  };
  // Walked up to the board on the ground: pick it up (it leaves the world and goes into the hand).
  const startPickup = (rb) => {
    const st = s.current;
    const L = st.loose;
    const p = rb.translation();
    const y = yawS(st);
    const c = Math.cos(y);
    const sn = Math.sin(y);
    const dx = L.x - p.x;
    const dz = L.z - p.z;
    const m = mirrorOf(st);
    const b = { x: (dx * c - dz * sn) * m, y: Math.max(0, L.y - (p.y - HALF.y)), z: dx * sn + dz * c, yaw: wrapAngle(L.yaw - y) * m };
    // With the mocap pick-up clip, follow its timing (sped up to about 1.3 s) so the hand closes when the clip's does.
    const pc = mocap.clips.pickup;
    st.pickRate = pc ? Math.max(1, pc.dur / 1.3) : 1;
    st.track = pickupTrack(walkPose(st.walkPhase, st.walkSpeed, false, st.turnVel ?? 0), b, pc ? { dur: pc.dur / st.pickRate, grab: pc.grab / st.pickRate } : undefined);
    Object.assign(st, { mode: 'pickup', modeT: 0, offSpeed: 0, offDrag: 0, walkSpeed: 0, turnVel: 0, loose: null });
  };
  const startMount = (carry) => {
    const st = s.current;
    const start = walkPose(st.walkPhase, st.walkSpeed, carry);
    const running = carry && st.walkSpeed > ON_THE_MOVE;
    st.track = running ? runMountTrack(start) : mountTrack(start, carry);
    st.mode = 'mount';
    st.modeT = 0;
    st.stance = 0;
    st.offSpeed = Math.max(0, st.walkSpeed) * (running ? 1 : 0.9);
    st.offDrag = running ? 0 : 0.3; // a running jump-on keeps all its speed
    st.walkSpeed = 0;
    st.loose = null;
  };

  // Knees drawn up in the middle of an on-foot jump (0 at take-off and touch-down).
  const tuckOf = (st) => (st.jumpT >= 0 ? Math.sin(Math.PI * clamp01(st.jumpT / ((2 * FOOT_JUMP_SPEED) / GRAVITY))) : 0);
  // Caveman (Get on in the air, good timing): the board drops under the feet, you land on it riding.
  const startCaveman = (left) => {
    const st = s.current;
    st.track = cavemanTrack(jumpPose(walkPose(st.walkPhase, st.walkSpeed, true), tuckOf(st), 0), left);
    Object.assign(st, { mode: 'mount', modeT: 0, stance: 0, offSpeed: Math.max(0, st.walkSpeed), offDrag: 0, walkSpeed: 0, jumpT: -1, caveman: true });
  };
  // Let go of the board in the air with bad timing: it falls on its own (from your side, as carried) and you land on foot.
  const dropBoard = (rb, why) => {
    const st = s.current;
    const p = rb.translation();
    const v = rb.linvel();
    const [sx, sz] = toWorld(st, 0.32, 0); // carried at the right side
    st.loose = { x: p.x + sx, y: p.y - HALF.y + 0.45, z: p.z + sz, vx: v.x, vy: v.y, vz: v.z, yaw: yawS(st), vyaw: 0, pitch: 0, roll: (-Math.PI / 2) * mirrorOf(st), vroll: 0, spin: st.wheelSpin };
    board.trick = { name: why, at: performance.now() };
  };

  useFrame((_, rawDt) => {
    const rb = body.current;
    if (!rb) return;
    // Physics runs in real time, so trick timers must too (only guard against huge stalls),
    // otherwise a slow frame rate makes every trick land "unfinished".
    const dt = Math.min(rawDt, 0.1);
    const st = s.current;
    const keys = getKeys();
    const pressed = (k) => keys[k] && !st.held[k];
    if (import.meta.env.DEV && window.__skate?.freeze) {
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setGravityScale(0, true);
      return;
    }
    if (import.meta.env.DEV && st.devPlace) {
      const o = st.devPlace;
      st.devPlace = null;
      if (st.grind) endGrind(rb, null);
      rb.setTranslation({ x: o.x, y: o.y, z: o.z }, true);
      rb.setLinvel({ x: o.vx ?? 0, y: o.vy ?? 0, z: o.vz ?? 0 }, true);
      Object.assign(st, { heading: o.heading ?? st.heading, mode: 'ride', track: null, loose: null, popT: o.popped ? 0.2 : -1, trick: null, air: true, airT: 0.2 });
      setHeading(rb, st.heading);
      return;
    }

    if (POSE_TEST) {
      const [kind, a, t] = POSE_TEST.split(':');
      st.testT = (st.testT ?? 0) + dt;
      let pose;
      if (kind === 'walk') {
        const v = Number(a) || 1.5;
        st.walkPhase += walkRate(v) * dt;
        pose = finish(walkPose(t != null ? Number(t) : st.walkPhase, v, true));
        board.pose = { w: 1, ...pose };
      } else {
        st.track ??= poseTestTrack(kind, Number(a) || 0);
        const tt = t != null ? Number(t) : st.testT % (st.track.dur + 0.6);
        pose = evalTrack(st.track, tt);
        board.pose = { w: trackWeight(st.track, tt), ...pose };
      }
      resetBoardVisuals();
      placeBoard(pose.board);
      const p = rb.translation();
      st.loose = { x: p.x - Math.sin(st.heading) * 1.4, y: p.y - HALF.y, z: p.z - Math.cos(st.heading) * 1.4, yaw: st.heading, pitch: 0, roll: 0, spin: 0 };
      showLoose(!pose.board);
      drawLoose();
      Object.assign(board, { x: p.x, y: p.y, z: p.z, heading: st.heading, speed: 0 });
      return;
    }

    // Paused (menu, pairing, phone disconnected): freeze, and drop moves sent meanwhile so nothing fires on resume.
    if (!game.running) {
      Object.assign(phone, { pushQueued: 0, popQueued: 0, popNose: false, trickQueued: null, revertQueued: 0, partialQueued: false, resetQueued: false, carryQueued: false, jumpQueued: false });
      for (const k of EDGE_KEYS) st.held[k] = keys[k];
      return;
    }

    // --- Input. Phone: tilt steers / brakes, swipes push and do tricks. Keyboard mirrors it.
    let targetSteer = 0;
    let targetLean = 0;
    let push = 0;
    let pop = 0;
    let nose = false; // nollie
    let trickReq = null;
    let revertReq = 0;
    let leanIn = 0; // -1 leaning back (top of the phone up) .. 1 leaning forward
    const live = phoneIsLive();
    if (live) {
      targetSteer = phone.steer;
      leanIn = phone.lean;
      board.source = 'phone';
    } else {
      targetSteer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      leanIn = keys.back ? -0.55 : 0; // S = manual in the middle of the green
      board.source = keys.forward || keys.back || keys.left || keys.right ? 'keyboard' : 'none';
    }
    if (phone.pushQueued) (push = phone.pushQueued), (phone.pushQueued = 0);
    if (phone.popQueued) (pop = phone.popQueued), (nose = phone.popNose), (phone.popQueued = 0);
    if (phone.trickQueued) (trickReq = phone.trickQueued), (phone.trickQueued = null);
    if (phone.revertQueued) (revertReq = phone.revertQueued), (phone.revertQueued = 0);
    // Half circles (a revert on the ground, a 180 in the air) and half circles given up halfway: the grind window
    // reads these (grind/grinding.js), so remember when they came.
    const nowMs = performance.now();
    if (revertReq) (st.arcAt = nowMs), (st.arcDir = revertReq);
    if (trickReq?.type === 'fs180' || trickReq?.type === 'bs180') (st.arcAt = nowMs), (st.arcDir = trickReq.type === 'fs180' ? 1 : -1);
    if (phone.partialQueued) (st.partialAt = nowMs), (phone.partialQueued = false);
    let carryReq = phone.carryQueued;
    phone.carryQueued = false;
    const jumpReq = phone.jumpQueued || pressed('jump');
    phone.jumpQueued = false;
    if (pressed('forward')) push += 1; // tap W = one push
    if (pressed('pop')) pop = 1;
    if (pressed('nollie')) (pop = 1), (nose = true);
    for (const k of KEY_TRICKS) if (pressed(k)) trickReq = { type: k, side: 1 };
    if (pressed('revert')) revertReq = 1;
    if (pressed('carry')) carryReq = true;
    for (const k of EDGE_KEYS) st.held[k] = keys[k];

    st.steer = damp(st.steer, targetSteer, STEER_RESPONSE, dt);
    st.lean = damp(st.lean, targetLean, STEER_RESPONSE, dt);

    // --- Spawn point: set it where you are, or teleport back to it (spawn key, phone Reset button, falling out).
    const p = rb.translation();
    if (commands.setSpawn) {
      commands.setSpawn = false;
      updateSettings({ spawn: { x: p.x, y: p.y, z: p.z, heading: st.heading } });
      board.trick = { name: 'SPAWN SET', at: performance.now() };
    }
    if (commands.clearSpawn) {
      commands.clearSpawn = false;
      updateSettings({ spawn: null });
    }
    if (commands.toSpawn || phone.resetQueued || p.y < LOW - 10) {
      commands.toSpawn = false;
      phone.resetQueued = false;
      const sp = settings.spawn ?? { x: START[0], y: START[1], z: START[2], heading: SPAWN.heading };
      rb.setTranslation({ x: sp.x, y: sp.y + 0.05, z: sp.z }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setGravityScale(1, true);
      if (st.grind) endGrind(rb, null);
      Object.assign(st, { heading: sp.heading, steer: 0, pushLeft: 0, popT: -1, trick: null, revert: null, stance: 0, swap: false, air: false, airT: 0, pushT: -1 });
      Object.assign(st, { mode: 'ride', modeT: 0, track: null, loose: null, offSpeed: 0, walkSpeed: 0, jumpT: -1, landT: 0, caveman: false, ragdoll: false });
      board.ragdoll = null;
      board.pose = null;
      return;
    }

    // --- Off the board: falling and getting up, walking (with the board or back to it), stepping off / on.
    if (st.mode !== 'ride') {
      st.modeT += dt;
      const v = rb.linvel();
      let fwdSpeed = 0;
      let turn = 0;
      let jumpVy = null; // take-off speed this frame
      let latX = 0;
      let latZ = 0;
      if (st.mode === 'walk') {
        // Phone joystick (or WASD, Shift to run), relative to the camera like a third-person game.
        let jx = live ? phone.jx ?? 0 : 0;
        let jy = live ? phone.jy ?? 0 : 0;
        const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        const ky = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
        if (kx || ky) {
          const k = (keys.pop ? 1 : 0.7) / Math.hypot(kx, ky);
          jx = kx * k;
          jy = ky * k;
        }
        st.jx = damp(st.jx ?? 0, jx, STICK_SMOOTH, dt);
        st.jy = damp(st.jy ?? 0, jy, STICK_SMOOTH, dt);
        const mag = Math.min(1, Math.hypot(st.jx, st.jy));
        let target = 0;
        let turnTarget = 0;
        if (mag > STICK_DEAD) {
          camera.getWorldDirection(_v);
          const cl = Math.hypot(_v.x, _v.z) || 1;
          const cx = _v.x / cl;
          const cz = _v.z / cl;
          const dx = cx * st.jy - cz * st.jx; // camera forward * up + camera right * right
          const dz = cz * st.jy + cx * st.jx;
          const err = wrapAngle(Math.atan2(-dx, -dz) - st.heading);
          turnTarget = Math.max(-TURN_MAX, Math.min(TURN_MAX, err * 7));
          target = stickSpeed(mag) * Math.max(0.2, Math.cos(err));
        }
        st.turnVel = damp(st.turnVel ?? 0, turnTarget, 12, dt);
        st.heading += st.turnVel * dt;
        turn = st.turnVel;
        const airborne = st.jumpT >= 0;
        st.walkSpeed = damp(st.walkSpeed, target, (target > st.walkSpeed ? 5 : 8) * (airborne ? FOOT_AIR_CONTROL : 1), dt);
        fwdSpeed = st.walkSpeed;
        // Jumping (board in hand): take off, then land when the feet touch the ground again.
        const footGap = probe(rb, p.x, p.y, p.z, 4) - HALF.y; // feet above the ground
        if (airborne) {
          st.jumpT += dt;
          if (st.jumpT > 0.1 && footGap < 0.06 && v.y <= 0) (st.jumpT = -1), (st.landT = FOOT_LAND_TIME);
        } else if (jumpReq && !st.loose && footGap < 0.06) {
          st.jumpT = 0;
          jumpVy = FOOT_JUMP_SPEED;
        }
        st.landT = Math.max(0, st.landT - dt);
        const L = st.loose;
        if (L) {
          // Board on the ground: walking up to it picks it up.
          const still = Math.hypot(L.vx, L.vz) < 0.5 && L.vy === 0;
          if (still && Math.hypot(L.x - p.x, L.z - p.z) < AUTO_GRAB) startPickup(rb);
        } else if (carryReq && airborne) {
          // Caveman: let the board go in the air. Good timing (time left before touching down): it drops under the
          // feet and you land riding. Too late or too early: you land on foot and the board lands by itself.
          const left = (v.y + Math.sqrt(v.y * v.y + 2 * GRAVITY * Math.max(0, footGap))) / GRAVITY;
          if (left >= CAVEMAN_MIN_LEAD && left <= CAVEMAN_MAX_LEAD) startCaveman(left);
          else dropBoard(rb, left < CAVEMAN_MIN_LEAD ? 'TOO LATE' : 'TOO EARLY');
        } else if (carryReq && v.y > -1) startMount(true); // Get on: drop the board and step on
      } else if (st.ragdoll) {
        // Ragdoll bail: the body (and so the camera) follows the ragdoll's hips along the ground. Once it has lain
        // still (RiderModel sets done) you're back on your feet there, and walk to the board.
        const R = board.ragdoll;
        if (R?.at) {
          const g = probe(rb, R.at.x, R.at.y + 0.5, R.at.z, 6);
          rb.setTranslation({ x: R.at.x, y: Number.isFinite(g) ? R.at.y + 0.5 - g + HALF.y : p.y, z: R.at.z }, true);
        }
        if (!R || R.done) {
          if (st.stance === 1) (st.heading += Math.PI), (st.stance = 0);
          Object.assign(st, { ragdoll: false, mode: 'walk', modeT: 0, walkSpeed: 0, walkPhase: 0, offSpeed: 0, turnVel: 0 });
          board.ragdoll = null;
        }
      } else {
        // Playing a track (bail, stepping off, stepping on): slide along with what speed is left, plus root motion.
        st.offSpeed *= Math.exp(-st.offDrag * dt);
        fwdSpeed = st.offSpeed;
        const r0 = rootAt(st.track, st.modeT - dt);
        const r1 = rootAt(st.track, st.modeT);
        const [wx, wz] = toWorld(st, r1[0] - r0[0], r1[1] - r0[1]);
        latX = wx / dt;
        latZ = wz / dt;
        if (st.modeT >= st.track.dur) {
          if (st.mode === 'bail') {
            if (st.stance === 1) (st.heading += Math.PI), (st.stance = 0); // walk nose first (same look)
            Object.assign(st, { mode: 'walk', walkSpeed: 0, walkPhase: 0, offSpeed: 0, turnVel: 0 }); // walk to the board
          } else if (st.mode === 'dismount' || st.mode === 'pickup') {
            Object.assign(st, { mode: 'walk', walkSpeed: Math.min(runTopSpeed(RUN_SPEED), Math.max(0, st.offSpeed)), walkPhase: 0, offSpeed: 0, turnVel: 0 });
          } else {
            st.mode = 'ride';
            if (st.caveman) {
              st.caveman = false;
              board.score += CAVEMAN_POINTS;
              board.trick = { name: `CAVEMAN +${CAVEMAN_POINTS}`, at: performance.now() };
              haptic('trick');
            }
          }
          st.modeT = 0;
          st.track = null;
        }
      }
      if (st.mode === 'walk' && st.jumpT < 0) {
        // Stride matched to ground speed (feet never slide); turning on the spot still shuffles the feet.
        const shuffle = Math.abs(st.walkSpeed) < 0.3 ? Math.min(1.2, Math.abs(turn) * 0.25) : 0;
        st.walkPhase += (Math.sign(st.walkSpeed || 1) * walkRate(st.walkSpeed) + shuffle) * dt;
      }
      if (st.loose) {
        updateLoose(rb, dt);
        // Lost the board off the edge of the map: it turns up in front of you.
        if (st.loose.y < LOW - 10) Object.assign(st.loose, { x: p.x - Math.sin(st.heading) * 1.2, y: p.y - HALF.y, z: p.z - Math.cos(st.heading) * 1.2, vx: 0, vy: 0, vz: 0, vyaw: 0, yaw: st.heading });
      }

      const fx = -Math.sin(st.heading);
      const fz = -Math.cos(st.heading);
      rb.setGravityScale(st.ragdoll ? 0 : 1, true);
      setVelocity(rb, fx * fwdSpeed + latX, st.ragdoll ? 0 : jumpVy ?? v.y, fz * fwdSpeed + latZ);
      setHeading(rb, st.heading);

      // Pose for the rider, board placement.
      let pose = null;
      let w = 1;
      if (st.track) {
        pose = evalTrack(st.track, st.modeT);
        w = trackWeight(st.track, st.modeT);
      } else if (st.mode !== 'ride' && !st.ragdoll) {
        pose = finish(walkPose(st.walkPhase, st.walkSpeed, !st.loose, turn));
      }
      // Jump: knees tuck up through the air, then a short crouch on landing (posed: there's no jump clip).
      const jumping = st.mode === 'walk' && (st.jumpT >= 0 || st.landT > 0);
      if (jumping) pose = finish(jumpPose(walkPose(st.walkPhase, st.walkSpeed, !st.loose, turn), tuckOf(st), st.landT / FOOT_LAND_TIME));
      board.pose = pose && { w, state: jumping ? 'jump' : st.mode, ...pose };
      if (board.pose && st.mode === 'walk' && !jumping) board.pose.loco = { v: st.walkSpeed, turn, carry: !st.loose };
      if (board.pose && st.mode === 'pickup') board.pose.mocap = { clip: 'pickup', t: st.modeT, rate: st.pickRate ?? 1 };
      resetBoardVisuals();
      placeBoard(pose?.board);
      showLoose(!!st.loose && !pose?.board);
      drawLoose();
      if (pose?.board && pose.board.p[1] < 0.02) {
        st.wheelSpin += (fwdSpeed / 0.028) * dt;
        for (const wh of wheels.current) if (wh) wh.rotation.x = -st.wheelSpin;
      }

      // For the phone (joystick + one button): 'ride' on the board (Get off), 'carry' on foot with the board in hand
      // (Get on), 'find' on foot with the board on the ground (Go to board, greyed), 'off' down after a fall.
      let offMode = 'off';
      if (st.mode === 'ride' || st.mode === 'mount') offMode = 'ride';
      else if (st.mode === 'dismount' || (st.mode === 'walk' && !st.loose)) offMode = 'carry';
      else if (st.mode === 'walk' || st.mode === 'pickup') offMode = 'find';
      Object.assign(board.view, { roll: 0, pitch: 0, yaw: 0, spin: 0, lift: 0, height: 0, mode: offMode });
      Object.assign(board, { speed: fwdSpeed, x: p.x, y: p.y, z: p.z, heading: st.heading, steer: st.steer, lean: 0, fakie: false, mirror: mirrorOf(st), mode: st.mode, loose: st.loose });
      Object.assign(board.anim, {
        pushT: -1,
        popT: -1,
        flip: -1,
        air: false,
        pitch: 0,
        steer: 0,
        fall: st.mode === 'bail' ? clamp01(st.modeT / 0.4) : 0,
        manual: 0,
        balance: -1,
        meter: 0,
        zone: null,
        manualT: 0,
        balanceLabel: null,
      });
      board.grind = null;
      return;
    }
    board.pose = null;
    showLoose(false);
    placeBoard(null);

    // --- Grinding: locked to a grind line (grind/grinding.js). The line carries the board; this only applies it.
    if (st.grind) {
      const g = st.grind;
      const gap = g.lastC ? Math.hypot(p.x - g.lastC[0], p.y - g.lastC[1], p.z - g.lastC[2]) : 0;
      const r = stepGrind(g, dt, { now: nowMs, arcAt: st.arcAt ?? -1e9, arcDir: st.arcDir ?? 1, partialAt: st.partialAt ?? -1e9, steer: targetSteer, live, ollie: pop > 0, gap }, HALF.y);
      if (g.changed) {
        g.changed = false;
        st.trick = null; // the half circle was for the slide, not a 180
        haptic('trick');
      }
      if (r.end === 'off') {
        // Round a corner onto the next line (a pad's next edge): a combo, no landing in between.
        const next = findCorner(nearby(grind, p.x, p.z), g);
        if (next) {
          addScuff(g.line, g.s0, g.s);
          st.grindChain = [...(st.grindChain ?? []), { kind: g.kind, type: g.line.type, dist: Math.abs(g.s - g.s0), t: g.t }];
          st.grind = continueGrind(g, next, [p.x, p.y, p.z], HALF.y, nowMs);
          haptic('trick');
          return;
        }
      }
      if (r.end) {
        endGrind(rb, r.end);
        return;
      }
      g.lastC = r.c;
      // Velocity along the line plus a pull onto the seat point, so Rapier's interpolation stays smooth.
      const [tx, ty, tz] = r.t;
      setVelocity(rb, tx * g.dir * g.speed + (r.c[0] - p.x) * 30, ty * g.dir * g.speed + (r.c[1] - p.y) * 30, tz * g.dir * g.speed + (r.c[2] - p.z) * 30);
      rb.setGravityScale(0, true);
      const th = Math.hypot(tx, tz) || 1;
      st.heading = Math.atan2((-tx * g.dir) / th, (-tz * g.dir) / th);
      setHeading(rb, st.heading);
      // Visuals: a boardslide turns the board (and rider) across the line; the deck follows the slope.
      const mir = mirrorOf(st);
      st.slideYaw = damp(st.slideYaw ?? 0, g.kind === 'boardslide' ? (g.slideSign * Math.PI) / 2 : 0, 18, dt);
      const slope = Math.atan2(ty * g.dir, th); // + uphill
      const across = Math.abs(Math.sin(st.slideYaw));
      const fwd = st.stance === 1 ? -1 : 1;
      if (stanceG.current) {
        stanceG.current.rotation.y = st.stance * Math.PI + st.slideYaw * mir;
        stanceG.current.scale.x = mir;
      }
      if (shoveG.current) (shoveG.current.rotation.y = 0), (shoveG.current.position.y = -HALF.y);
      const pitch = slope * fwd * (1 - across);
      if (deck.current) deck.current.rotation.set(pitch, 0, slope * fwd * Math.sign(st.slideYaw || 1) * across);
      st.pitchNow = pitch;
      const b = g.bal;
      Object.assign(board.view, { roll: (deck.current?.rotation.z ?? 0) * mir, pitch, yaw: 0, spin: st.slideYaw, lift: 0, height: 0, mode: 'ride' });
      Object.assign(board, { speed: g.speed, x: p.x, y: p.y, z: p.z, heading: st.heading, steer: st.steer, lean: 0, fakie: st.stance === 1, mirror: mir, mode: 'ride', loose: null });
      board.grind = { id: g.line.id, type: g.line.type, kind: g.kind, long: g.line.long, tx: (tx * g.dir) / th, tz: (tz * g.dir) / th };
      Object.assign(board.anim, {
        pushT: -1, popT: -1, flip: -1, air: false, pitch, steer: st.steer, fall: 0, manual: 0,
        balance: b?.balance ?? -1, meter: b?.marker ?? 0, zone: b?.zone ?? null, manualT: 0,
        balanceLabel: `★ ${grindName(g)} ★`, balanceInfo: `${Math.abs(g.s - g.s0).toFixed(1)}m`, balanceEnds: ['BAIL', 'BAIL'],
      });
      return;
    }
    board.grind = null;

    // --- Ground contact: rays down from the middle, nose and tail of the board.
    const fx = -Math.sin(st.heading);
    const fz = -Math.cos(st.heading);
    const v = rb.linvel();
    const dCenter = probe(rb, p.x, p.y, p.z, 8);
    const dEnds = Math.min(probe(rb, p.x + fx * 0.3, p.y, p.z + fz * 0.3, 0.5), probe(rb, p.x - fx * 0.3, p.y, p.z - fz * 0.3, 0.5));
    const grounded = Math.min(dCenter, dEnds) < HALF.y + 0.06 && v.y < 0.8;
    const heightAbove = Number.isFinite(dCenter) ? Math.max(0, dCenter - HALF.y) : 8;
    let speed = Math.max(0, v.x * fx + v.z * fz);

    // Lock onto a grind line from the air (an ollie, or rolling off something). Not mid-flip or mid-revert.
    const trickBusy = st.revert || (st.trick && st.trick.t / st.trick.def.time < LAND_OK && !(st.trick.def.spin && !st.trick.def.flip && !st.trick.def.shove));
    // On the ground: riding up to a curb's edge at a shallow angle locks on too (no ollie needed for a curb).
    if (grind.ready && !trickBusy && (!grounded || st.popT < 0)) {
      const skip = st.grindSkip && nowMs < st.grindSkip.until ? st.grindSkip.line : null;
      const b = { x: p.x, z: p.z, bottom: p.y - HALF.y, vx: v.x, vy: v.y, vz: v.z, popped: st.popT >= 0 };
      const skipFn = skip && ((l) => l === skip);
      const near = nearby(grind, p.x, p.z); // only the lines within ~5 m (grid lookup)
      const hit = grounded ? findCurbEntry(near, b, skipFn) : findEntry(near, b, skipFn);
      if (hit) {
        st.grind = startGrind(hit, [p.x, p.y, p.z], HALF.y, nowMs);
        st.grind.s0 = hit.s;
        st.grindChain = [];
        // A 180 started in the air this close to locking on was the half circle for a boardslide.
        if (st.trick?.def.spin && !st.trick.def.flip) st.trick = null;
        Object.assign(st, { popT: -1, air: false, airT: 0, pushLeft: 0, pushT: -1, manualT: 0, manual: 0 });
        rb.collider(0)?.setCollisionGroups(0); // the line carries the board: no snagging on the rail or ledge itself
        haptic('land');
        return;
      }
    }

    if (import.meta.env.DEV && st.devBail) {
      const [kind, sp] = st.devBail;
      st.devBail = null;
      startBail(rb, kind, sp ?? speed);
      return;
    }

    // Step off and pick the board up (phone Walk button / B), only while rolling on the ground.
    if (carryReq && grounded && st.popT < 0 && !st.revert && st.manualT === 0) {
      startDismount(speed);
      return;
    }

    // Pushes only count with the board on the ground; each one is spread over PUSH_TIME.
    if (push && grounded && st.popT < 0 && !st.revert) {
      st.pushAccel = (PUSH_GAIN * push) / PUSH_TIME;
      st.pushLeft = PUSH_TIME;
      if (st.pushT < 0 || st.pushT > PUSH_ANIM * 0.7) st.pushT = 0;
      haptic('push');
    }
    if (st.pushT >= 0) {
      st.pushT += dt;
      if (st.pushT > PUSH_ANIM || st.popT >= 0) st.pushT = -1;
    }
    if (grounded) {
      if (st.pushLeft > 0) {
        speed += st.pushAccel * Math.min(dt, st.pushLeft);
        st.pushLeft -= dt;
      }
    }

    // --- Manuals: balance on the back wheels while the phone is leant back. A green zone drifts along the meter
    // (faster the longer you hold it); keep the marker in it by tilting the phone (tuning.js MANUAL_*).
    let inManual = false;
    let balance = 0; // where the marker is across the zone: 0 front edge .. 0.5 middle .. 1 back edge
    const back = -leanIn;
    let marker = clamp01(back); // HUD marker, 0..1 along the bar
    if (back < MANUAL_IN) st.manualLock = false; // after a lost manual, level the phone before the next one
    const holding = st.manualT > 0 ? back > MANUAL_LET_GO : back > MANUAL_IN && !st.manualLock;
    if (grounded && st.popT < 0 && !st.revert && !push && st.pushT < 0 && speed > MANUAL_MIN_SPEED && holding) {
      const diff = MANUAL_BALANCE;
      const lo = MANUAL_ZONE_MID - diff.swing;
      const hi = MANUAL_ZONE_MID + diff.swing;
      if (st.manualT === 0) st.bal = { t: 0, start: clamp(marker, lo, hi), out: 0, ph: [0, 1, 2, 3].map(() => Math.random() * 6.28) };
      const b = st.bal;
      b.t += dt * diff.drift * (1 + MANUAL_DRIFT_GROW * st.manualT);
      const wave = (f1, p1, f2, p2) => 0.6 * Math.sin(f1 * b.t + p1) + 0.4 * Math.sin(f2 * b.t + p2);
      b.centre = clamp(b.start + diff.swing * (wave(1, b.ph[0], 2.3, b.ph[1]) - wave(0, b.ph[0], 0, b.ph[1])), lo, hi);
      if (!live) marker = b.centre; // keyboard S has one fixed lean, so it balances by itself (phone: by hand)
      marker = clamp01(marker + diff.sway * (0.3 + speed / MAX_SPEED) * wave(1.7, b.ph[2], 3.1, b.ph[3]));
      const off = marker - b.centre;
      if (marker >= MANUAL_BAIL_AT) {
        // Leaned too far back: the board shoots out and you fall backwards.
        startBail(rb, 'back', speed);
        return;
      }
      b.out = Math.abs(off) > diff.zone ? b.out + dt : 0;
      if (st.manualT === 0) haptic('manual');
      else if (b.out > 0) haptic('manualWarn');
      if (b.out < diff.tolerance) {
        inManual = true;
        balance = clamp01(0.5 + off / (2 * diff.zone));
      } else st.manualLock = true; // lost it: the front wheels drop
      st.zone = { c: b.centre, w: diff.zone, out: b.out / diff.tolerance };
    }
    if (inManual) {
      st.manualT += dt; // no slowdown while manualing (rolling friction is skipped below)
    } else if (st.manualT > 0) {
      if (st.manualT > MANUAL_CALLOUT && st.popT < 0) {
        const t = st.manualT;
        const pts = manualPoints(t);
        board.score += pts;
        board.trick = { name: `MANUAL ${t.toFixed(1)}s +${pts}`, at: performance.now() };
      }
      st.manualT = 0;
    }
    st.manualBalance = inManual ? balance : -1;
    st.meter = marker;
    // The nose rises the further back the marker is.
    const manualPitch = inManual ? MANUAL_PITCH_MIN + (MANUAL_PITCH_MAX - MANUAL_PITCH_MIN) * clamp01((marker - MANUAL_IN) / (MANUAL_BAIL_AT - MANUAL_IN)) : 0;
    st.manual = damp(st.manual, manualPitch / MANUAL_PITCH_MAX, 10, dt);
    if (grounded) {
      if (!inManual) speed *= 1 - ROLL_DRAG * dt;
      speed = Math.min(MAX_SPEED, Math.max(0, speed));
    }

    // Turning is tighter when slow, still possible when stopped (pivot).
    const turnScale = 0.45 + 0.55 * Math.min(1, speed / 6);
    st.heading -= st.steer * TURN_RATE * turnScale * dt * (grounded ? 1 : 0.4);

    const nfx = -Math.sin(st.heading);
    const nfz = -Math.cos(st.heading);
    let vy = v.y;

    // --- Tricks.
    const air = airPhysics();
    const doPop = (power, fromNose = false) => {
      vy = air.pop * Math.sqrt(power);
      st.popT = 0;
      st.trick = null;
      st.pushLeft = 0;
      st.popFakie = st.stance === 1;
      st.popSwitch = st.swap;
      st.popNose = fromNose;
    };
    const startTrick = (type, side) => {
      const def = TRICKS[type];
      if (!def) return;
      st.trick = { def, side: side < 0 ? -1 : 1, t: 0 };
      // Late trick: make sure there is just enough air time left to finish it.
      const need = def.time * LAND_OK;
      const left = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * air.g * heightAbove))) / air.g;
      if (left < need) vy = Math.min(vy + ASSIST_MAX, (air.g * need) / 2 - heightAbove / need);
    };
    const canPop = grounded && st.popT < 0 && !st.revert;
    if (pop && canPop) doPop(pop, nose);
    if (revertReq && st.popT >= 0 && st.popT < air.window && !st.trick) {
      trickReq = { type: revertReq > 0 ? 'fs180' : 'bs180', side: 1 }; // a half-circle in the air is a 180
      revertReq = 0;
    }
    if (trickReq && TRICKS[trickReq.type]) {
      if (grounded && st.popT < 0 && !st.revert) {
        doPop(0.9); // a trick from flat ground pops by itself (e.g. the two-finger pop shove-it)
        startTrick(trickReq.type, trickReq.side);
      } else if (st.popT >= 0 && st.popT < air.window && !st.trick) {
        startTrick(trickReq.type, trickReq.side);
      }
    }
    if (revertReq && grounded && st.popT < 0 && !st.revert) st.revert = { dir: revertReq > 0 ? 1 : -1, t: 0 };

    if (st.popT >= 0) st.popT += dt;
    if (st.trick) st.trick.t += dt;

    // Revert: 180° on the wheels, keep rolling the same way, now fakie (or back to regular).
    if (st.revert) {
      st.revert.t += dt;
      if (st.revert.t >= REVERT_TIME) {
        st.stance ^= 1;
        normalizeStance(st);
        st.revert = null;
        speed *= 0.92;
        board.trick = { name: 'REVERT', at: performance.now() };
      }
    }

    // Landing: the trick resolves once we've been airborne and touch down again.
    if (!grounded) st.airT += dt;
    else st.airT = 0;
    if (!grounded && (st.popT > 0.05 || st.airT > 0.12)) st.air = true;
    if (st.air && grounded) {
      st.air = false;
      const tr = st.trick;
      const popped = st.popT >= 0;
      st.popT = -1;
      st.trick = null;
      if (tr && tr.t / tr.def.time < LAND_OK) {
        // Landed mid-rotation: stumble off (slow) or slam (fast), then get up and go back to the board.
        startBail(rb, 'side', speed);
        return;
      }
      if (tr?.def.spin) st.stance ^= 1;
      // A half shove-it turns the board round under you: the other end leads, so fakie <-> switch.
      if ((tr?.def.shove ?? 0) % 1 === 0.5) (st.stance ^= 1), (st.swap = !st.swap);
      normalizeStance(st);
      if (popped || tr) haptic(tr ? 'trick' : 'land');
      if (popped || tr) board.trick = { name: (stancePrefix(st) + (tr ? tr.def.name : 'OLLIE')).replace('NOLLIE OLLIE', 'NOLLIE'), at: performance.now() };
    }
    // A pop that never left the ground (e.g. under a ledge) shouldn't lock tricks forever.
    if (st.popT > 1.5 && grounded) (st.popT = -1), (st.trick = null);

    // Popped jumps use the lighter airtime gravity; rolling off a ledge falls normally.
    rb.setGravityScale(st.popT >= 0 && !grounded ? air.g / GRAVITY : 1, true);
    setVelocity(rb, nfx * speed, vy, nfz * speed);
    setHeading(rb, st.heading);

    // --- Visuals.
    const tr = st.trick;
    const u = tr ? Math.min(1, tr.t / tr.def.time) : 0;
    const ease = u * u * (3 - 2 * u) * 0.35 + u * 0.65; // quick start, soft catch
    let spinYaw = 0;
    if (tr?.def.spin) spinYaw = tr.def.dir * tr.def.spin * ease * Math.PI * 2;
    if (st.revert) spinYaw = st.revert.dir * Math.PI * Math.min(1, st.revert.t / REVERT_TIME);
    const mir = mirrorOf(st);
    spinYaw *= mir; // a goofy frontside 180 turns the other way round
    if (stanceG.current) {
      stanceG.current.rotation.y = st.stance * Math.PI + spinYaw;
      stanceG.current.scale.x = mir;
    }

    const boardTrick = tr && (tr.def.flip || tr.def.shove);
    let pitch = st.lean * 0.12 + st.manual * MANUAL_PITCH_MAX;
    if (st.popT >= 0) {
      const t = st.popT;
      const snap = t < 0.08 ? (t / 0.08) * 0.5 : 0.5 * Math.exp(-(t - 0.08) * 8); // tail snap, then level out
      pitch += st.popNose ? -snap : snap; // nollie: the nose snaps down instead
    }
    if (boardTrick) pitch *= 1 - Math.sin(Math.PI * u); // level the board while it rotates
    st.pitchNow = pitch;
    if (shoveG.current) {
      shoveG.current.rotation.y = boardTrick ? -tr.side * (tr.def.shove ?? 0) * ease * Math.PI * 2 : 0;
      shoveG.current.position.y = -HALF.y + (boardTrick ? Math.sin(Math.PI * u) * 0.16 : 0);
    }
    if (deck.current) {
      deck.current.rotation.x = pitch;
      deck.current.rotation.z = -st.steer * 0.12 * mir + (boardTrick ? tr.side * (tr.def.flip ?? 0) * ease * Math.PI * 2 : 0);
    }
    Object.assign(board.view, {
      // World-space values (the rider group may be mirrored): carve tilt + flip roll, shove-it.
      roll: (deck.current?.rotation.z ?? 0) * mir,
      pitch,
      yaw: (shoveG.current?.rotation.y ?? 0) * mir,
      spin: spinYaw, // 180s / reverts (not the fakie stance itself)
      lift: shoveG.current ? shoveG.current.position.y + HALF.y : 0, // board rising off the feet in flips
      height: grounded ? 0 : Math.min(2, heightAbove),
      mode: 'ride',
    });
    st.wheelSpin += (speed / 0.028) * dt;
    for (const w of wheels.current) if (w) w.rotation.x = -st.wheelSpin;

    Object.assign(board, { speed, x: p.x, y: p.y, z: p.z, heading: st.heading, steer: st.steer, lean: st.lean, fakie: st.stance === 1, mirror: mir, mode: 'ride', loose: null });
    Object.assign(board.anim, {
      pushT: st.pushT,
      popT: st.popT,
      nollie: st.popNose,
      flip: boardTrick ? u : -1,
      air: !grounded && (st.popT >= 0 || st.airT > 0.12),
      pitch,
      steer: st.steer,
      fall: 0,
      manual: st.manual, // 0..1 nose-up amount (rider leans back over the tail)
      balance: st.manualBalance ?? -1, // -1 not in a manual, 0..1 across the green zone
      meter: st.meter ?? 0, // marker position on the HUD meter (0..1)
      zone: st.manualBalance >= 0 ? st.zone : null, // the drifting green zone { c, w, out } for the HUD
      manualT: st.manualT,
      balanceLabel: null,
      balanceInfo: null,
      balanceEnds: null,
    });
  }, -1); // before the rider (and camera), so they see this frame's pose

  return (
    <>
    <RigidBody
      ref={body}
      position={START}
      rotation={[0, SPAWN.heading, 0]}
      colliders={false}
      enabledRotations={[false, false, false]}
      friction={0}
      mass={4}
      ccd
    >
      <CuboidCollider args={[HALF.x, HALF.y, HALF.z]} collisionGroups={PLAYER_GROUPS} />
      <group ref={stanceG}>
        <group ref={boardG}>
          <group ref={shoveG} position={[0, -HALF.y, 0]}>
            <group position={[0, PIVOT, 0]}>
              <group ref={deck}>
                <group position={[0, -PIVOT, 0]}>
                  <BoardModel wheelsRef={wheels} />
                </group>
              </group>
            </group>
          </group>
        </group>
        <group position={[0, -HALF.y, 0]}>
          <Rider boardRef={boardG} />
        </group>
      </group>
    </RigidBody>
    {/* The board on its own after a bail (world space, so it can roll away from the rider). */}
    <group ref={looseG} visible={false}>
      <group position={[0, -PIVOT, 0]}>
        <BoardModel wheelsRef={looseWheels} />
      </group>
    </group>
    </>
  );
}

// Board model (DESIGN.md §7.3): plain natural-maple popsicle deck (~80 × 21 cm) with kicktails,
// black grip, raw aluminium trucks, off-white wheels. Length runs along Z, nose toward -Z.
const WHEEL_R = 0.028;
function deckGeometry(thick, inset) {
  const L = 0.8 - inset * 2;
  const W = 0.21 - inset * 2;
  const r = W / 2;
  const s = new Shape();
  s.moveTo(-r, -L / 2 + r);
  s.lineTo(-r, L / 2 - r);
  s.absarc(0, L / 2 - r, r, Math.PI, 0, true);
  s.lineTo(r, -L / 2 + r);
  s.absarc(0, -L / 2 + r, r, 0, Math.PI, true);
  const g = new ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 2, curveSegments: 16 });
  g.rotateX(Math.PI / 2); // shape Y → world Z, extrusion → down
  // Bend the kicktails up.
  const pos = g.attributes.position;
  const flat = 0.27;
  const tan = Math.tan(0.32);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const over = Math.abs(z) - flat;
    if (over > 0) pos.setY(i, pos.getY(i) + over * tan);
  }
  g.computeVertexNormals();
  return g;
}

// Built once, shared by the ridden board and the loose one.
let boardGeo = null;
function getBoardGeo() {
  if (boardGeo) return boardGeo;
  const truck = [];
  for (const z of [-0.2, 0.2]) {
    truck.push(new BoxGeometry(0.06, 0.012, 0.09).translate(0, DECK_TOP - 0.018, z)); // baseplate
    truck.push(new BoxGeometry(0.035, 0.035, 0.04).translate(0, DECK_TOP - 0.04, z)); // kingpin block
    truck.push(new CylinderGeometry(0.011, 0.011, 0.17, 8).rotateZ(Math.PI / 2).translate(0, WHEEL_R, z)); // axle
    truck.push(new BoxGeometry(0.15, 0.022, 0.03).translate(0, WHEEL_R + 0.012, z)); // hanger
  }
  boardGeo = {
    deck: deckGeometry(0.012, 0),
    grip: deckGeometry(0.001, 0.004),
    trucks: merge(truck),
    wheel: new CylinderGeometry(WHEEL_R, WHEEL_R, 0.032, 18),
  };
  return boardGeo;
}
const WHEEL_POSITIONS = [
  [-0.075, -0.2],
  [0.075, -0.2],
  [-0.075, 0.2],
  [0.075, 0.2],
];

function BoardModel({ wheelsRef }) {
  const m = materials();
  const geo = getBoardGeo();
  return (
    <group>
      <mesh geometry={geo.deck} material={m.deck} position-y={DECK_TOP - 0.002} castShadow receiveShadow />
      <mesh geometry={geo.grip} material={m.grip} position-y={DECK_TOP + 0.0005} receiveShadow />
      <mesh geometry={geo.trucks} material={m.trucks} castShadow />
      {WHEEL_POSITIONS.map(([x, z], i) => (
        <mesh
          key={i}
          ref={(e) => (wheelsRef.current[i] = e)}
          geometry={geo.wheel}
          position={[x, WHEEL_R, z]}
          rotation-z={Math.PI / 2}
          material={m.wheels}
          castShadow
        />
      ))}
    </group>
  );
}
