import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { board } from '../state.js';
import { SUN_DIR, sunView } from './look.js';

const aim = new Vector3();

// Low over-the-shoulder chase camera (DESIGN.md §3): hip height, ~2.5–3 m behind and a little
// to the right so the skater sits left of centre, nearly level with a slight downward tilt,
// lagging on turns and rolling a few degrees into them.
const HEIGHT = 1.1;
const RIGHT = 0.55;
const LOOK_AHEAD = 4;
const LOOK_RIGHT = 0.35;
const LOOK_Y = 0.7; // ~3.5° down-tilt
const MAX_ROLL = (3 * Math.PI) / 180;
// ?topdown (or ?topdown=300 for the height in meters) shows the level from above.
const TOP_DOWN = (() => {
  const q = new URLSearchParams(window.location.search);
  return q.has('topdown') ? Number(q.get('topdown')) || 260 : 0;
})();

export default function CameraRig() {
  const look = useRef(new Vector3());
  const target = useRef(new Vector3());
  const roll = useRef(0);
  const first = useRef(true);

  useFrame(({ camera, scene }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
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
    const fx = -Math.sin(board.heading);
    const fz = -Math.cos(board.heading);
    const rx = -fz; // right vector
    const rz = fx;
    const back = 2.5 + Math.min(board.speed, 14) * 0.04;
    target.current.set(board.x - fx * back + rx * RIGHT, board.y + HEIGHT, board.z - fz * back + rz * RIGHT);
    aim.set(board.x + fx * LOOK_AHEAD + rx * LOOK_RIGHT, board.y + LOOK_Y, board.z + fz * LOOK_AHEAD + rz * LOOK_RIGHT);

    // Snap on the first frames and after a reset/teleport instead of swooping across the map.
    if (first.current || camera.position.distanceTo(target.current) > 6) {
      camera.position.copy(target.current);
      look.current.copy(aim);
      first.current = false;
    }
    camera.position.lerp(target.current, 1 - Math.exp(-6 * dt));
    look.current.lerp(aim, 1 - Math.exp(-8 * dt));
    camera.lookAt(look.current);
    roll.current += (-board.steer * MAX_ROLL - roll.current) * (1 - Math.exp(-5 * dt));
    camera.rotateZ(roll.current);

    camera.updateMatrixWorld();
    sunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
  });

  return null;
}
