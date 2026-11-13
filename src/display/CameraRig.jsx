import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { board } from '../state.js';
import { SUN_DIR, sunView } from './look.js';
import { urlParams } from './util.js';
import { CAM_DISTANCE, CAM_FOLLOW, CAM_HEIGHT, CAM_LOOK_AHEAD, CAM_LOOK_RIGHT, CAM_LOOK_Y, CAM_MAX_ROLL, CAM_RIGHT } from './tuning.js';

const aim = new Vector3();

// ?topdown (or ?topdown=300 for the height in meters) shows the level from above.
const TOP_DOWN = urlParams.has('topdown') ? Number(urlParams.get('topdown')) || 260 : 0;
const SIDE_CAM = urlParams.has('sidecam');
// Dev: ?cam=x,y,z,lookX,lookY,lookZ pins the camera (screenshots of the level).
const FIXED = import.meta.env.DEV ? urlParams.get('cam')?.split(',').map(Number) : null;

// Low over-the-shoulder chase camera (DESIGN.md §3; numbers in tuning.js).
export default function CameraRig() {
  const look = useRef(new Vector3());
  const target = useRef(new Vector3());
  const roll = useRef(0);
  const angle = useRef(0); // camera swing toward the side during a manual (rad)
  const first = useRef(true);

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
    const side = board.fakie ? -1 : 1;
    angle.current += ((board.anim.manual ?? 0) * 0.75 * side - angle.current) * (1 - Math.exp(-3 * dt));
    const fx = -Math.sin(board.heading);
    const fz = -Math.cos(board.heading);
    const rx = -fz; // right vector
    const rz = fx;
    if (SIDE_CAM) {
      // Debug view of the rider (?sidecam): from the toe side, 3 m out, looking at the rider's front.
      camera.position.set(p.x + rx * 3, p.y + 0.9, p.z + rz * 3);
      camera.up.set(0, 1, 0);
      camera.lookAt(p.x, p.y + 0.8, p.z);
      return updateSunView(camera);
    }
    // Fixed distance at any speed. The camera eases toward its target (rate CAM_FOLLOW), which on its own would
    // trail speed/CAM_FOLLOW metres further back when moving fast; leading the target by that much cancels it.
    const back = CAM_DISTANCE - Math.min(board.speed, 10) / CAM_FOLLOW;
    const ca = Math.cos(angle.current);
    const sa = Math.sin(angle.current);
    const offX = (-fx * ca + rx * sa) * CAM_DISTANCE + fx * (CAM_DISTANCE - back) + rx * CAM_RIGHT * ca;
    const offZ = (-fz * ca + rz * sa) * CAM_DISTANCE + fz * (CAM_DISTANCE - back) + rz * CAM_RIGHT * ca;
    target.current.set(p.x + offX, p.y + CAM_HEIGHT - Math.abs(sa) * 0.25, p.z + offZ);
    const ahead = CAM_LOOK_AHEAD * (1 - 0.75 * Math.abs(sa)); // look closer to the board from the side, to keep it centred
    aim.set(p.x + fx * ahead + rx * CAM_LOOK_RIGHT, p.y + CAM_LOOK_Y, p.z + fz * ahead + rz * CAM_LOOK_RIGHT);

    // Snap on the first frames and after a reset/teleport instead of swooping across the map.
    if (first.current || camera.position.distanceTo(target.current) > 6) {
      camera.position.copy(target.current);
      look.current.copy(aim);
      first.current = false;
    }
    camera.position.lerp(target.current, 1 - Math.exp(-CAM_FOLLOW * dt));
    look.current.lerp(aim, 1 - Math.exp(-8 * dt));
    camera.lookAt(look.current);
    roll.current += (-board.steer * CAM_MAX_ROLL - roll.current) * (1 - Math.exp(-5 * dt));
    camera.rotateZ(roll.current);

    updateSunView(camera);
  });

  return null;
}

// After moving the camera: its matrices, and the sun direction in view space (drives the rim light).
function updateSunView(camera) {
  camera.updateMatrixWorld();
  sunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
}
