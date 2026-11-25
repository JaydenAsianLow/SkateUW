// Round iron bars: the stair handrails (Ground.jsx) and the free-standing rails (Rails.jsx) share their look and
// their collider style.
import { CylinderGeometry, Euler, Quaternion, SphereGeometry, Vector3 } from 'three';

export const RAIL_R = 0.07; // bar radius (14 cm thick: reads from the chase camera; also the collider half-size)
export const POST_R = 0.05;

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

// A solid wall under a bar, from `bottom` up to the bar (so nothing rolls or walks through or under it). Straight
// segment a-b in plan; returns { args, position, rotation } like barCollider. Invisible: the bar and posts are the look.
export function wallCollider(a, b, bottom) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const top = Math.min(a.y, b.y);
  return {
    args: [RAIL_R, Math.max(0.05, (top - bottom) / 2), len / 2 + 0.02],
    position: [(a.x + b.x) / 2, bottom + (top - bottom) / 2, (a.z + b.z) / 2],
    rotation: [0, Math.atan2(b.x - a.x, b.z - a.z), 0],
  };
}

// Thin box collider along a bar, its top just under the bar's top (so the board can land on / bump it).
export function barCollider(a, b) {
  _q.setFromUnitVectors(_up.set(0, 1, 0), _d.subVectors(b, a).normalize());
  return {
    args: [RAIL_R, a.distanceTo(b) / 2, RAIL_R],
    position: a.clone().lerp(b, 0.5).add(_up.set(0, -0.02, 0)).toArray(),
    rotation: _e.setFromQuaternion(_q).toArray().slice(0, 3),
  };
}
