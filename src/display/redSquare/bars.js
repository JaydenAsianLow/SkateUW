// Round iron bars: the stair handrails (Ground.jsx) and the free-standing rails (Rails.jsx) share their look and
// their collider style.
import { CylinderGeometry, Euler, Quaternion, SphereGeometry, Vector3 } from 'three';

export const RAIL_R = 0.045; // bar radius (chunky enough to read from the chase camera; also the collider half-size)
export const POST_R = 0.035;

const _up = new Vector3();
const _d = new Vector3();
const _q = new Quaternion();
const _e = new Euler();

// A round bar from a to b (Vector3s).
export function tube(a, b, r) {
  const d = _d.subVectors(b, a);
  const g = new CylinderGeometry(r, r, d.length(), 8, 1);
  g.applyQuaternion(_q.setFromUnitVectors(_up.set(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

// A ball that rounds off the joint where two bars meet.
export const joint = (p, r) => new SphereGeometry(r, 8, 6).translate(p.x, p.y, p.z);

// Thin box collider along a bar, its top just under the bar's top (so the board can land on / bump it).
export function barCollider(a, b) {
  _q.setFromUnitVectors(_up.set(0, 1, 0), _d.subVectors(b, a).normalize());
  return {
    args: [RAIL_R, a.distanceTo(b) / 2, RAIL_R],
    position: a.clone().lerp(b, 0.5).add(_up.set(0, -0.02, 0)).toArray(),
    rotation: _e.setFromQuaternion(_q).toArray().slice(0, 3),
  };
}
