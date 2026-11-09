import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { CuboidCollider, RigidBody, useRapier } from '@react-three/rapier';
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Shape } from 'three';
import { board, phone, phoneIsLive } from '../state.js';
import { commands, settings, updateSettings } from '../settings.js';
import { DECK_TOP, PUSH_ANIM, materials, merge } from './look.js';
import { LOW, SPAWN } from './redSquare/layout.js';
import Rider from './RiderModel.jsx';

// Tuning
export const GRAVITY = 15; // m/s². A bit over real g so jumps feel snappy without floating.
const MAX_SPEED = 8; // m/s (~29 km/h)
const PUSH_GAIN = 1.9; // m/s added per push swipe (scaled by swipe power)
const PUSH_TIME = 0.28; // seconds a push is spread over, so it feels like a kick, not a teleport
const BRAKE_DECEL = 14; // m/s² at full back tilt
const BRAKE_DEADZONE = 0.3; // tilt back past this to brake (so holding the phone loosely doesn't)
const ROLL_DRAG = 0.22; // fraction of speed lost per second while coasting
const TURN_RATE = 2.0; // rad/s at full steer
const STEER_RESPONSE = 7; // how fast the board follows the phone tilt (lower = stiffer, heavier)
// Ollie: apex = v² / 2g. 3.7 m/s → ~0.45 m at a normal swipe, ~0.3–0.6 m from a lazy to a hard swipe
// (a typical street ollie). Power scales the apex height linearly, so v ∝ √power.
const POP_VELOCITY = 3.7;
const TRICK_WINDOW = 0.5; // seconds after the pop that a trick swipe still upgrades the ollie (at airtime 1)
// Airtime setting A (settings.js): popped jumps hang A× longer. Pop speed ∝ A^-¼ and gravity ∝ A^-1¼,
// so the jump also gets a bit higher (∝ A^¾) instead of just floating in slow motion.
// A = 1.7 → ~0.9 s in the air and ~0.75 m apex (vs ~0.5 s / 0.45 m at A = 1).
const airPhysics = () => {
  const A = settings.airtime;
  return { pop: POP_VELOCITY * A ** -0.25, g: GRAVITY * A ** -1.25, window: TRICK_WINDOW * A };
};
const LAND_OK = 0.78; // a trick at least this far through its rotation when you land still counts
const ASSIST_MAX = 1.2; // m/s of extra lift a late trick may get so it can finish (keeps tricks landable)
const BAIL_SPEED_KEEP = 0.25; // speed kept after landing mid-rotation
const BAIL_TIME = 1.7; // seconds on the ground after a bail before you're back on the board
const BAIL_FALL = 0.4; // seconds to hit the ground / to get back up
const BAIL_DRAG = 3; // the board skids to a stop while you're down
const REVERT_TIME = 0.34; // seconds for a ground revert (180° on the wheels)
// Manuals (Options -> Lean phone back: Manual): lean back = balance on the back wheels, forward = nose manual,
// all the way back = tail drag (slows you down). Leaning past MANUAL_IN starts one.
const MANUAL_IN = 0.3;
const TAIL_DRAG_IN = 0.85;
const MANUAL_PITCH = 0.2; // rad, nose up on a manual
const TAIL_DRAG_PITCH = 0.3; // rad, tail on the ground
const TAIL_DRAG_DECEL = 5; // m/s²
const MANUAL_DRAG = 0.15; // extra fraction of speed lost per second while balancing
const MANUAL_MIN_SPEED = 0.6; // m/s; slower than this you just stand on it
const MANUAL_CALLOUT = 0.6; // s held before it counts as a manual
const HALF = { x: 0.12, y: 0.08, z: 0.42 }; // collider half extents (real-size board)
const START = [SPAWN.position[0], HALF.y + 0.05, SPAWN.position[1]];
const PIVOT = DECK_TOP - 0.035; // flips spin around the middle of the board, not the ground

// Trick definitions. flip = kickflip turns (board roll), shove = board-only yaw turns,
// spin = rider + board yaw turns (you ride away fakie after a 180).
export const TRICKS = {
  kickflip: { name: 'KICKFLIP', time: 0.3, flip: 1 },
  varial: { name: 'VARIAL FLIP', time: 0.34, flip: 1, shove: 0.5 },
  tre: { name: 'TRE FLIP', time: 0.4, flip: 1, shove: 1 },
  shove: { name: 'POP SHOVE-IT', time: 0.3, shove: 0.5 },
  fs180: { name: 'FRONTSIDE 180', time: 0.4, spin: 0.5, dir: 1 },
  bs180: { name: 'BACKSIDE 180', time: 0.4, spin: 0.5, dir: -1 },
};

const KEY_TRICKS = ['kickflip', 'varial', 'tre', 'shove', 'fs180'];
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

export default function Skateboard() {
  const body = useRef(null);
  const stanceG = useRef(null); // rider + board: 180s, reverts, fakie
  const shoveG = useRef(null); // board only: shove-it yaw, trick lift
  const deck = useRef(null); // board only: pop pitch, flip roll, carve roll
  const wheels = useRef([]);
  const [, getKeys] = useKeyboardControls();
  const { world, rapier } = useRapier();
  if (import.meta.env.DEV && window.__skate) window.__skate.world = world;
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier]);
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
    stance: 0, // 0 regular, 1 fakie (rider + board turned 180° to the travel direction)
    popFakie: false,
    air: false,
    airT: 0,
    pushT: -1, // seconds since the current push stroke started (rider animation)
    bail: -1, // seconds since bailing, -1 when riding
    manual: 0, // -1 nose manual .. 0 flat .. 1 manual (smoothed)
    manualT: 0, // seconds the current manual has been held
    manualDir: 0,
  });

  // Distance from a point straight down to the nearest collider (ignoring the board itself).
  const probe = (rb, x, y, z, max) => {
    ray.origin.x = x;
    ray.origin.y = y;
    ray.origin.z = z;
    const hit = world.castRay(ray, max, true, undefined, undefined, undefined, rb);
    return hit ? hit.timeOfImpact : Infinity;
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

    // --- Input. Phone: tilt steers / brakes, swipes push and do tricks. Keyboard mirrors it.
    let targetSteer = 0;
    let targetLean = 0;
    let push = 0;
    let pop = 0;
    let trickReq = null;
    let revertReq = 0;
    const manualMode = settings.leanBack === 'manual';
    let leanIn = 0; // -1 leaning back .. 1 leaning forward
    if (phoneIsLive()) {
      targetSteer = phone.steer;
      leanIn = phone.lean;
      targetLean = !manualMode && phone.lean < -BRAKE_DEADZONE ? phone.lean : 0;
      board.source = 'phone';
    } else {
      targetSteer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      leanIn = keys.back ? (manualMode ? -0.6 : -1) : 0;
      targetLean = !manualMode && keys.back ? -1 : 0;
      board.source = keys.forward || keys.back || keys.left || keys.right ? 'keyboard' : 'none';
    }
    if (phone.pushQueued) (push = phone.pushQueued), (phone.pushQueued = 0);
    if (phone.popQueued) (pop = phone.popQueued), (phone.popQueued = 0);
    if (phone.trickQueued) (trickReq = phone.trickQueued), (phone.trickQueued = null);
    if (phone.revertQueued) (revertReq = phone.revertQueued), (phone.revertQueued = 0);
    if (pressed('forward')) push += 1; // tap W = one push
    if (pressed('pop')) pop = 1;
    for (const k of KEY_TRICKS) if (pressed(k)) trickReq = { type: k, side: 1 };
    if (pressed('revert')) revertReq = 1;
    for (const k of ['forward', 'pop', 'revert', ...KEY_TRICKS]) st.held[k] = keys[k];

    st.steer = damp(st.steer, targetSteer, STEER_RESPONSE, dt);
    st.lean = damp(st.lean, targetLean, STEER_RESPONSE, dt);

    // --- Spawn point: set it where you are, or teleport back to it (spawn key, phone shake, falling out).
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
      Object.assign(st, { heading: sp.heading, steer: 0, pushLeft: 0, popT: -1, trick: null, revert: null, stance: 0, air: false, airT: 0, pushT: -1, bail: -1 });
      return;
    }

    // --- Bailed: you're on the ground, the board skids to a stop, inputs are ignored until you get up.
    if (st.bail >= 0) {
      st.bail += dt;
      push = pop = revertReq = 0;
      trickReq = null;
      targetSteer = targetLean = leanIn = 0;
      st.steer = st.lean = 0;
      if (st.bail >= BAIL_TIME) st.bail = -1; // back on the board, right where you fell
    }

    // --- Ground contact: rays down from the middle, nose and tail of the board.
    const fx = -Math.sin(st.heading);
    const fz = -Math.cos(st.heading);
    const v = rb.linvel();
    const dCenter = probe(rb, p.x, p.y, p.z, 8);
    const dEnds = Math.min(probe(rb, p.x + fx * 0.3, p.y, p.z + fz * 0.3, 0.5), probe(rb, p.x - fx * 0.3, p.y, p.z - fz * 0.3, 0.5));
    const grounded = Math.min(dCenter, dEnds) < HALF.y + 0.06 && v.y < 0.8;
    const heightAbove = Number.isFinite(dCenter) ? Math.max(0, dCenter - HALF.y) : 8;
    let speed = Math.max(0, v.x * fx + v.z * fz);

    // Pushes only count with the board on the ground; each one is spread over PUSH_TIME.
    if (push && grounded && st.popT < 0 && !st.revert) {
      st.pushAccel = (PUSH_GAIN * push) / PUSH_TIME;
      st.pushLeft = PUSH_TIME;
      if (st.pushT < 0 || st.pushT > PUSH_ANIM * 0.7) st.pushT = 0;
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
      if (st.lean < -0.05) speed -= -st.lean * BRAKE_DECEL * dt;
      speed *= 1 - ROLL_DRAG * dt;
    }

    // --- Manuals: balance on two wheels while the phone is leant (Manual mode only).
    let manualTarget = 0;
    let tailDrag = false;
    if (manualMode && grounded && st.popT < 0 && !st.revert && st.bail < 0 && !push && speed > MANUAL_MIN_SPEED) {
      if (leanIn < -MANUAL_IN) manualTarget = 1;
      else if (leanIn > MANUAL_IN) manualTarget = -1;
      tailDrag = leanIn < -TAIL_DRAG_IN;
    }
    if (manualTarget && st.pushT < 0) {
      if (manualTarget !== st.manualDir) st.manualT = 0;
      st.manualDir = manualTarget;
      st.manualT += dt;
      speed *= 1 - MANUAL_DRAG * dt;
      if (tailDrag) speed = Math.max(0, speed - TAIL_DRAG_DECEL * dt);
    } else if (st.manualDir) {
      if (st.manualT > MANUAL_CALLOUT && st.popT < 0) {
        const name = st.manualDir > 0 ? 'MANUAL' : 'NOSE MANUAL';
        board.trick = { name: `${name} ${st.manualT.toFixed(1)}s`, at: performance.now() };
      }
      st.manualDir = 0;
      st.manualT = 0;
    }
    st.manual = damp(st.manual, manualTarget * (tailDrag ? TAIL_DRAG_PITCH / MANUAL_PITCH : 1), 10, dt);
    if (grounded) {
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
    const doPop = (power) => {
      vy = air.pop * Math.sqrt(power);
      st.popT = 0;
      st.trick = null;
      st.pushLeft = 0;
      st.popFakie = st.stance === 1;
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
    const canPop = grounded && st.popT < 0 && !st.revert && st.bail < 0;
    if (pop && canPop) doPop(pop);
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
      if (st.popT >= 0 || tr) {
        let name = (st.popFakie ? 'FAKIE ' : '') + (tr ? tr.def.name : 'OLLIE');
        if (tr && tr.t / tr.def.time < LAND_OK) {
          name = 'BAIL'; // landed mid-rotation: you hit the ground, then get back up
          speed *= BAIL_SPEED_KEEP;
          st.bail = 0;
          st.pushLeft = 0;
          st.pushT = -1;
        } else if (tr?.def.spin) st.stance ^= 1;
        board.trick = { name, at: performance.now() };
      }
      st.popT = -1;
      st.trick = null;
    }
    // A pop that never left the ground (e.g. under a ledge) shouldn't lock tricks forever.
    if (st.popT > 1.5 && grounded) (st.popT = -1), (st.trick = null);

    if (st.bail >= 0) speed *= Math.exp(-BAIL_DRAG * dt);
    // Popped jumps use the lighter airtime gravity; rolling off a ledge falls normally.
    rb.setGravityScale(st.popT >= 0 && !grounded ? air.g / GRAVITY : 1, true);
    rb.setLinvel({ x: nfx * speed, y: vy, z: nfz * speed }, true);
    rb.setRotation({ x: 0, y: Math.sin(st.heading / 2), z: 0, w: Math.cos(st.heading / 2) }, true);

    // --- Visuals.
    const tr = st.trick;
    // Fall weight for the rider: 0 riding → 1 lying on the ground → 0 back up.
    const fall = st.bail < 0 ? 0 : Math.min(1, st.bail / BAIL_FALL, (BAIL_TIME - st.bail) / BAIL_FALL);
    const u = tr ? Math.min(1, tr.t / tr.def.time) : 0;
    const ease = u * u * (3 - 2 * u) * 0.35 + u * 0.65; // quick start, soft catch
    let spinYaw = 0;
    if (tr?.def.spin) spinYaw = tr.def.dir * tr.def.spin * ease * Math.PI * 2;
    if (st.revert) spinYaw = st.revert.dir * Math.PI * Math.min(1, st.revert.t / REVERT_TIME);
    if (stanceG.current) stanceG.current.rotation.y = st.stance * Math.PI + spinYaw;

    const boardTrick = tr && (tr.def.flip || tr.def.shove);
    let pitch = st.lean * 0.12 + st.manual * MANUAL_PITCH;
    if (st.popT >= 0) {
      const t = st.popT;
      pitch += t < 0.08 ? (t / 0.08) * 0.5 : 0.5 * Math.exp(-(t - 0.08) * 8); // tail snap, then level out
    }
    if (boardTrick) pitch *= 1 - Math.sin(Math.PI * u); // level the board while it rotates
    if (shoveG.current) {
      // On a bail the board kicks out sideways from under you.
      shoveG.current.rotation.y = boardTrick ? -tr.side * (tr.def.shove ?? 0) * ease * Math.PI * 2 : fall * 0.5;
      shoveG.current.position.y = -HALF.y + (boardTrick ? Math.sin(Math.PI * u) * 0.16 : 0);
    }
    if (deck.current) {
      deck.current.rotation.x = pitch;
      deck.current.rotation.z = -st.steer * 0.12 + (boardTrick ? tr.side * (tr.def.flip ?? 0) * ease * Math.PI * 2 : 0);
    }
    Object.assign(board.view, {
      roll: deck.current?.rotation.z ?? 0, // carve tilt + flip roll
      pitch,
      yaw: shoveG.current?.rotation.y ?? 0, // shove-it
      spin: spinYaw, // 180s / reverts (not the fakie stance itself)
      lift: shoveG.current ? shoveG.current.position.y + HALF.y : 0, // board rising off the feet in flips
      height: grounded ? 0 : Math.min(2, heightAbove),
    });
    st.wheelSpin += (speed / 0.028) * dt;
    for (const w of wheels.current) if (w) w.rotation.x = -st.wheelSpin;

    Object.assign(board, { speed, x: p.x, y: p.y, z: p.z, heading: st.heading, steer: st.steer, lean: st.lean, fakie: st.stance === 1 });
    Object.assign(board.anim, {
      pushT: st.pushT,
      popT: st.popT,
      flip: boardTrick ? u : -1,
      air: !grounded && (st.popT >= 0 || st.airT > 0.12),
      pitch,
      steer: st.steer,
      fall: fall * fall * (3 - 2 * fall),
      manual: st.manual,
    });
  });

  return (
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
      <CuboidCollider args={[HALF.x, HALF.y, HALF.z]} />
      <group ref={stanceG}>
        <group ref={shoveG} position={[0, -HALF.y, 0]}>
          <group position={[0, PIVOT, 0]}>
            <group ref={deck}>
              <group position={[0, -PIVOT, 0]}>
                <BoardModel wheelsRef={wheels} />
              </group>
            </group>
          </group>
        </group>
        <group position={[0, -HALF.y, 0]}>
          <Rider />
        </group>
      </group>
    </RigidBody>
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

function BoardModel({ wheelsRef }) {
  const m = materials();
  const geo = useMemo(() => {
    const truck = [];
    for (const z of [-0.2, 0.2]) {
      truck.push(new BoxGeometry(0.06, 0.012, 0.09).translate(0, DECK_TOP - 0.018, z)); // baseplate
      truck.push(new BoxGeometry(0.035, 0.035, 0.04).translate(0, DECK_TOP - 0.04, z)); // kingpin block
      truck.push(new CylinderGeometry(0.011, 0.011, 0.17, 8).rotateZ(Math.PI / 2).translate(0, WHEEL_R, z)); // axle
      truck.push(new BoxGeometry(0.15, 0.022, 0.03).translate(0, WHEEL_R + 0.012, z)); // hanger
    }
    return { deck: deckGeometry(0.012, 0), grip: deckGeometry(0.001, 0.004), trucks: merge(truck) };
  }, []);
  const wheelPositions = [
    [-0.075, -0.2],
    [0.075, -0.2],
    [-0.075, 0.2],
    [0.075, 0.2],
  ];
  return (
    <group>
      <mesh geometry={geo.deck} material={m.deck} position-y={DECK_TOP - 0.002} castShadow receiveShadow />
      <mesh geometry={geo.grip} material={m.grip} position-y={DECK_TOP + 0.0005} receiveShadow />
      <mesh geometry={geo.trucks} material={m.trucks} castShadow />
      {wheelPositions.map(([x, z], i) => (
        <mesh key={i} ref={(e) => (wheelsRef.current[i] = e)} position={[x, WHEEL_R, z]} rotation-z={Math.PI / 2} material={m.wheels} castShadow>
          <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.032, 18]} />
        </mesh>
      ))}
    </group>
  );
}
