import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { Vector3 } from 'three';
import { board } from '../state.js';
import { settings } from '../settings.js';
import { SUN_DIR, sunView } from './look.js';
import { NOT_RAGDOLL } from './ragdoll.js';
import { smooth, urlParams } from './util.js';
import {
  CAM_CLEAR_FROM, CAM_CLIP_PAD, CAM_DISTANCE, CAM_FOLLOW, CAM_HEIGHT, CAM_LOOK_AHEAD, CAM_LOOK_RIGHT, CAM_LOOK_Y, CAM_MAX_ROLL, CAM_MIN_DISTANCE,
  CAM_RIGHT, CAM_SWITCH_TIME, GRIND_CAM, SHOULDER_DISTANCE, SHOULDER_HEIGHT, SHOULDER_LOOK_AHEAD, SHOULDER_LOOK_Y, SHOULDER_SIDE,
  SIDE_DISTANCE, SIDE_HEIGHT, SIDE_LOOK_AHEAD, SIDE_LOOK_Y,
} from './tuning.js';

const aim = new Vector3();
const fromPos = new Vector3();
const fromAim = new Vector3();
const eye = new Vector3();
const sidePos = new Vector3();
const sideAim = new Vector3();

// ?topdown (or ?topdown=300 for the height in meters) shows the level from above.
const TOP_DOWN = urlParams.has('topdown') ? Number(urlParams.get('topdown')) || 260 : 0;
const SIDE_CAM = urlParams.has('sidecam');
// Dev: ?cam=x,y,z,lookX,lookY,lookZ pins the camera (screenshots of the level).
const FIXED = import.meta.env.DEV ? urlParams.get('cam')?.split(',').map(Number) : null;

// Where a view wants the camera (pos) and what it looks at (out), for the board at p heading along (fx, fz).
// swing: the behind view's turn toward the side during a manual (rad).
function viewPose(view, p, fx, fz, swing, pos, out) {
  const rx = -fz; // right vector
  const rz = fx;
  // Rider's toe side (where they face) in world terms, from the Stance setting only, so the camera doesn't swap
  // sides on every revert: +1 = right of travel (regular), -1 = left (goofy).
  const toe = settings.stance === 'goofy' ? -1 : 1;
  if (view === 'shoulder') {
    const side = -toe * SHOULDER_SIDE; // behind the rider's back
    pos.set(p.x - fx * SHOULDER_DISTANCE + rx * side, p.y + SHOULDER_HEIGHT, p.z - fz * SHOULDER_DISTANCE + rz * side);
    out.set(p.x + fx * SHOULDER_LOOK_AHEAD, p.y + SHOULDER_LOOK_Y, p.z + fz * SHOULDER_LOOK_AHEAD);
  } else if (view === 'side') {
    pos.set(p.x + rx * toe * SIDE_DISTANCE, p.y + SIDE_HEIGHT, p.z + rz * toe * SIDE_DISTANCE);
    out.set(p.x + fx * SIDE_LOOK_AHEAD, p.y + SIDE_LOOK_Y, p.z + fz * SIDE_LOOK_AHEAD);
  } else {
    // Behind (DESIGN.md §3): low, a little to the right, swinging toward the toe side during a manual.
    const ca = Math.cos(swing);
    const sa = Math.sin(swing);
    const offX = (-fx * ca + rx * sa) * CAM_DISTANCE + rx * CAM_RIGHT * ca;
    const offZ = (-fz * ca + rz * sa) * CAM_DISTANCE + rz * CAM_RIGHT * ca;
    pos.set(p.x + offX, p.y + CAM_HEIGHT - Math.abs(sa) * 0.25, p.z + offZ);
    const ahead = CAM_LOOK_AHEAD * (1 - 0.75 * Math.abs(sa)); // look closer to the board from the side, to keep it centred
    out.set(p.x + fx * ahead + rx * CAM_LOOK_RIGHT, p.y + CAM_LOOK_Y, p.z + fz * ahead + rz * CAM_LOOK_RIGHT);
  }
}

// Chase camera with three views (Settings → Camera), blended over CAM_SWITCH_TIME when switching.
export default function CameraRig() {
  const { world, rapier } = useRapier();
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), [rapier]);
  const look = useRef(new Vector3());
  const target = useRef(new Vector3());
  const roll = useRef(0);
  const angle = useRef(0); // camera swing toward the side during a manual (rad)
  const first = useRef(true);
  const sw = useRef({ view: settings.camera, from: null, t: 1 }); // view switch in progress
  const gc = useRef({ w: 0, id: null, side: 1, tx: 0, tz: -1 }); // long-grind side camera: blend weight, line, side

  useFrame(({ camera, scene }, rawDt) => {
    const dt = Math.min(rawDt, 0.1); // real time, like the physics, so the speed lead below stays exact
    const p = board.drawn ?? board; // where the board is drawn this frame (see state.js)
    if (FIXED?.length === 6) {
      camera.position.set(FIXED[0], FIXED[1], FIXED[2]);
      camera.lookAt(FIXED[3], FIXED[4], FIXED[5]);
      return updateSunView(camera);
    }
    if (TOP_DOWN) {
      scene.fog = null;
      // Debug map view (MAP.md §10 step 2): straight down over the plaza, north at the top.
      camera.position.set(p.x * 0.25, TOP_DOWN, p.z * 0.25 + 0.01);
      camera.up.set(0, 0, -1);
      camera.lookAt(p.x * 0.25, 0, p.z * 0.25);
      return updateSunView(camera);
    }
    // Manual: swing round toward the toe side (a slight side angle) so you can see the board on its back wheels.
    const side = (board.fakie ? -1 : 1) * (board.mirror ?? 1); // goofy / switch: the toe side is the other side
    angle.current += ((board.anim.manual ?? 0) * 0.75 * side - angle.current) * (1 - Math.exp(-3 * dt));
    const fx = -Math.sin(board.heading);
    const fz = -Math.cos(board.heading);
    if (SIDE_CAM) {
      // Debug view of the rider (?sidecam): from the toe side, 3 m out, looking at the rider's front.
      camera.position.set(p.x - fz * 3, p.y + 0.9, p.z + fx * 3);
      camera.up.set(0, 1, 0);
      camera.lookAt(p.x, p.y + 0.8, p.z);
      return updateSunView(camera);
    }

    // Switching views: remember where the old view was and blend from it.
    const s = sw.current;
    if (settings.camera !== s.view) {
      s.from = s.view;
      s.view = settings.camera;
      s.t = 0;
    }
    s.t = Math.min(1, s.t + dt / CAM_SWITCH_TIME);
    viewPose(s.view, p, fx, fz, angle.current, target.current, aim);
    if (s.t < 1 && s.from) {
      viewPose(s.from, p, fx, fz, angle.current, fromPos, fromAim);
      const k = smooth(s.t);
      target.current.lerp(fromPos, 1 - k);
      aim.lerp(fromAim, 1 - k);
    }
    // Long grind: swing out to the side of the line, and back afterwards.
    const g = board.grind;
    const G = gc.current;
    G.w += ((g?.long ? 1 : 0) - G.w) * (1 - Math.exp(-GRIND_CAM.blend * dt));
    if (g?.long) {
      if (G.id !== g.id) (G.id = g.id), (G.side = roomierSide(p, -g.tz, g.tx));
      (G.tx = g.tx), (G.tz = g.tz);
    } else if (!g) G.id = null;
    if (G.w > 0.002) {
      const px = -G.tz * G.side, pz = G.tx * G.side;
      sidePos.set(p.x + px * GRIND_CAM.distance - G.tx * GRIND_CAM.back, p.y + GRIND_CAM.height, p.z + pz * GRIND_CAM.distance - G.tz * GRIND_CAM.back);
      sideAim.set(p.x + G.tx * GRIND_CAM.ahead, p.y + 0.5, p.z + G.tz * GRIND_CAM.ahead);
      const k = smooth(G.w);
      target.current.lerp(sidePos, k);
      aim.lerp(sideAim, k);
    }
    // Fixed distance at any speed: the camera eases toward its target (rate CAM_FOLLOW), which on its own would
    // trail speed/CAM_FOLLOW metres further back when moving fast; leading the target by that much cancels it.
    const lead = (Math.min(board.speed, 10) / CAM_FOLLOW) * (1 - G.w);
    target.current.x += fx * lead;
    target.current.z += fz * lead;

    // Snap on the first frames and after a reset/teleport instead of swooping across the map.
    if (first.current || camera.position.distanceTo(target.current) > 6) {
      camera.position.copy(target.current);
      look.current.copy(aim);
      first.current = false;
    }
    camera.position.lerp(target.current, 1 - Math.exp(-CAM_FOLLOW * dt));
    look.current.lerp(aim, 1 - Math.exp(-8 * dt));
    keepClear(camera.position, p);
    camera.up.set(0, 1, 0);
    camera.lookAt(look.current);
    roll.current += (-board.steer * CAM_MAX_ROLL - roll.current) * (1 - Math.exp(-5 * dt));
    camera.rotateZ(roll.current);

    updateSunView(camera);
  });

  // Which side of the line has more open space (for the grind camera): +1 or -1 along (px, pz).
  function roomierSide(p, px, pz) {
    const room = (sg) => {
      ray.origin.x = p.x;
      ray.origin.y = p.y + GRIND_CAM.height;
      ray.origin.z = p.z;
      ray.dir.x = px * sg;
      ray.dir.y = 0;
      ray.dir.z = pz * sg;
      const hit = world.castRay(ray, GRIND_CAM.distance + 2, true, undefined, NOT_RAGDOLL);
      return hit ? hit.timeOfImpact : Infinity;
    };
    return room(1) >= room(-1) ? 1 : -1;
  }

  // A wall, stair or building between the rider and the camera: move the camera in front of it. Two rays to the
  // camera, from head height and from knee height (low ledges and stairs would otherwise hide the board).
  function keepClear(cam, p) {
    let keep = 1;
    for (const h of CAM_CLEAR_FROM) {
      eye.set(p.x, p.y + h, p.z);
      const dist = eye.distanceTo(cam);
      if (dist < 1e-3) continue;
      ray.origin.x = eye.x;
      ray.origin.y = eye.y;
      ray.origin.z = eye.z;
      ray.dir.x = (cam.x - eye.x) / dist;
      ray.dir.y = (cam.y - eye.y) / dist;
      ray.dir.z = (cam.z - eye.z) / dist;
      const hit = world.castRay(ray, dist + CAM_CLIP_PAD, true, undefined, NOT_RAGDOLL);
      if (hit) keep = Math.min(keep, Math.max(Math.min(CAM_MIN_DISTANCE, dist), hit.timeOfImpact - CAM_CLIP_PAD) / dist);
    }
    // Pull in along the line from the head, so the camera stays above the rider.
    if (keep < 1) eye.set(p.x, p.y + CAM_CLEAR_FROM[0], p.z), cam.sub(eye).multiplyScalar(keep).add(eye);
  }

  return null;
}

// After moving the camera: its matrices, and the sun direction in view space (drives the rim light).
function updateSunView(camera) {
  camera.updateMatrixWorld();
  sunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
}
