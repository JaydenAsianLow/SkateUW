// Is there room for the board here? A box a little smaller than the board (its upper part only, so the rail or
// ledge it rides on never counts) tested against the level's fixed colliders. Used when the lines are built (trim
// lines whose ends run into a wall or pillar) and every grinding frame (stop before the board goes into anything).
import { Euler, Quaternion } from 'three';

const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const HX = 0.08, HY = 0.05, HZ = 0.4; // half sizes: across (narrow enough for a rail bolted 9 cm off a wall), up, along
export const CLEAR_RAISE = 0.03; // box centre above the board centre (its bottom is 2 cm under the board centre)

export function makeClearTest(world, rapier) {
  const shape = new rapier.Cuboid(HX, HY, HZ);
  const flags = rapier.QueryFilterFlags.ONLY_FIXED | rapier.QueryFilterFlags.EXCLUDE_SENSORS;
  const pos = { x: 0, y: 0, z: 0 };
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  // c = board centre [x, y, z], t = unit travel direction [x, y, z] (the box lies along it, slope included)
  return (c, t) => {
    // yaw + pitch only (no roll: the box stays level across the line whichever way you go)
    const h = Math.hypot(t[0], t[2]) || 1e-9;
    _q.setFromEuler(_e.set(-Math.atan2(t[1], h), Math.atan2(t[0], t[2]), 0, 'YXZ'));
    (rot.x = _q.x), (rot.y = _q.y), (rot.z = _q.z), (rot.w = _q.w);
    (pos.x = c[0]), (pos.y = c[1] + CLEAR_RAISE), (pos.z = c[2]);
    return !world.intersectionWithShape(pos, rot, shape, flags);
  };
}
