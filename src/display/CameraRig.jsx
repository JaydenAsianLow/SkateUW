import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { board } from '../state.js';
import { SUN_DIR, sunView } from './look.js';

const aim = new Vector3();

// Low over-the-shoulder chase camera (DESIGN.md §3): hip height, ~2.5–3 m behind and a little
// to the right so the skater sits left of centre, nearly level with a slight downward tilt,
// lagging on turns and rolling a few degrees into them.
const HEIGHT = 1.2;
const RIGHT = 0.55;
const LOOK_AHEAD = 4;
const LOOK_RIGHT = 0.35;
const LOOK_Y = 0.7; // ~3.5° down-tilt
const MAX_ROLL = (3 * Math.PI) / 180;
const FOLLOW = 6; // camera position easing rate (1/s)
// ?topdown (or ?topdown=300 for the height in meters) shows the level from above.
const TOP_DOWN = (() => {
  const q = new URLSearchParams(window.location.search);
  return q.has('topdown') ? Number(q.get('topdown')) || 260 : 0;
})();

const SIDE_CAM = new URLSearchParams(window.location.search).has('sidecam');

export default function CameraRig() {
  const look = useRef(new Vector3());
  const target = useRef(new Vector3());
  const roll = useRef(0);
  const angle = useRef(0); // camera swing toward the side during a manual (rad)
  const first = useRef(true);

  useFrame(({ camera, scene }, rawDt) => {
    const dt = Math.min(rawDt, 0.1); // real time, like the physics, so the speed lead below stays exact
    if (TOP_DOWN) {
      scene.fog = null;
      // Debug map view (MAP.md §10 step 2): straight down over the plaza, north at the top.
      camera.position.set(board.x * 0.25, TOP_DOWN, board.z * 0.25 + 0.01);
      camera.up.set(0, 0, -1);
      camera.lookAt(board.x * 0.25, 0, board.z * 0.25);
      camera.updateMatrixWorld();
      sunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
      return;
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
      camera.position.set(board.x + rx * 3, board.y + 0.9, board.z + rz * 3);
      camera.up.set(0, 1, 0);
      camera.lookAt(board.x, board.y + 0.8, board.z);
      camera.updateMatrixWorld();
      sunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
      return;
    }
    // Fixed distance at any speed. The camera eases toward its target (rate FOLLOW), which on its own would
    // trail speed/FOLLOW metres further back when moving fast; leading the target by that much cancels it.
    const back = 2.7 - Math.min(board.speed, 10) / FOLLOW;
    const ca = Math.cos(angle.current);
    const sa = Math.sin(angle.current);
    const offX = (-fx * ca + rx * sa) * 2.7 + fx * (2.7 - back) + rx * RIGHT * ca;
    const offZ = (-fz * ca + rz * sa) * 2.7 + fz * (2.7 - back) + rz * RIGHT * ca;
    target.current.set(board.x + offX, board.y + HEIGHT - Math.abs(sa) * 0.25, board.z + offZ);
    const ahead = LOOK_AHEAD * (1 - 0.75 * Math.abs(sa)); // look closer to the board from the side, to keep it centred
    aim.set(board.x + fx * ahead + rx * LOOK_RIGHT, board.y + LOOK_Y, board.z + fz * ahead + rz * LOOK_RIGHT);

    // Snap on the first frames and after a reset/teleport instead of swooping across the map.
    if (first.current || camera.position.distanceTo(target.current) > 6) {
      camera.position.copy(target.current);
      look.current.copy(aim);
      first.current = false;
    }
    camera.position.lerp(target.current, 1 - Math.exp(-FOLLOW * dt));
    look.current.lerp(aim, 1 - Math.exp(-8 * dt));
    camera.lookAt(look.current);
    roll.current += (-board.steer * MAX_ROLL - roll.current) * (1 - Math.exp(-5 * dt));
    camera.rotateZ(roll.current);

    camera.updateMatrixWorld();
    sunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
  });

  return null;
}
