import { interactionGroups } from '@react-three/rapier';
import { Matrix4, Quaternion, Vector3 } from 'three';
import {
  RAGDOLL_DAMPING, RAGDOLL_ELBOW_MAX, RAGDOLL_FRICTION, RAGDOLL_KNEE_MAX, RAGDOLL_MAX_TIME, RAGDOLL_MIN_TIME,
  RAGDOLL_STILL_SPEED, RAGDOLL_STILL_TIME, RAGDOLL_TUMBLE,
} from './tuning.js';

// Collision groups. The ragdoll collides with the world only (not with itself, not with the rider's board body);
// the board body is in its own group; scene rays (ground probes, the camera) ignore the ragdoll.
export const PLAYER_GROUPS = interactionGroups(2);
const RAGDOLL_GROUPS = interactionGroups(1, [0]);
export const NOT_RAGDOLL = interactionGroups([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

// A ragdoll of capsules and joints, made from the skeleton's pose right now (world space) and removed again with
// destroy(). parts: [{ key, a, b (Vector3 joint positions), r, parent?, joint?: 'ball' | 'knee' | 'elbow',
// balls?: [{ at, r }] }], parents before children. forward: the character's front (world). vel: starting velocity.
export function createRagdoll(world, RAPIER, { parts, forward, vel }) {
  const bodies = {};
  const frames = {};
  const joints = [];
  // A random tumble on top of the crash speed, mostly about the body's side-to-side axis (a forward roll).
  const side = _v.crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const spin = side.clone().multiplyScalar(RAGDOLL_TUMBLE * (0.6 + 0.4 * Math.random()))
    .add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(RAGDOLL_TUMBLE * 0.5));
  const centre = parts[0].a.clone();

  // Hinge axis for a knee / elbow: the real bend direction when bent, the anatomical one when (nearly) straight.
  const hingeAxis = (p, c) => {
    const dP = _y.subVectors(p.b, p.a).normalize().clone();
    const dC = _z.subVectors(c.b, c.a).normalize().clone();
    const anat = c.joint === 'knee' ? new Vector3().crossVectors(forward, dP) : new Vector3().crossVectors(dP, forward);
    const bent = new Vector3().crossVectors(dP, dC);
    return (bent.length() > 0.15 && bent.dot(anat) > 0 ? bent : anat).normalize();
  };
  const axisOf = {};
  for (const c of parts) if (c.joint === 'knee' || c.joint === 'elbow') axisOf[c.key] = axisOf[c.parent] = hingeAxis(parts.find((p) => p.key === c.parent), c);

  for (const part of parts) {
    // Body frame: Y along the bone, X across it (the hinge axis for arm / leg parts), origin in the middle.
    const len = part.a.distanceTo(part.b);
    _y.subVectors(part.b, part.a).normalize();
    _x.copy(axisOf[part.key] ?? side);
    _x.addScaledVector(_y, -_x.dot(_y));
    if (_x.lengthSq() < 1e-6) _x.crossVectors(_y, forward);
    _x.normalize();
    _z.crossVectors(_x, _y);
    const rot = new Quaternion().setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    const pos = part.a.clone().add(part.b).multiplyScalar(0.5);
    const lin = _v.subVectors(pos, centre).cross(spin).negate().add(vel); // v + ω × r
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(rot)
        .setLinvel(lin.x, lin.y, lin.z)
        .setAngvel(spin)
        .setLinearDamping(RAGDOLL_DAMPING.linear)
        .setAngularDamping(RAGDOLL_DAMPING.angular)
        .setCcdEnabled(true),
    );
    const collider = (desc) => world.createCollider(desc.setCollisionGroups(RAGDOLL_GROUPS).setFriction(RAGDOLL_FRICTION).setRestitution(0.05), body);
    collider(RAPIER.ColliderDesc.capsule(Math.max(0.01, len / 2 - part.r), part.r));
    for (const b of part.balls ?? []) {
      const at = toLocal(b.at, pos, rot);
      collider(RAPIER.ColliderDesc.ball(b.r).setTranslation(at.x, at.y, at.z));
    }
    bodies[part.key] = body;
    frames[part.key] = { pos, rot };
    // Joint at this part's start point, in both bodies' local frames.
    if (part.parent) {
      const pf = frames[part.parent];
      const a1 = toLocal(part.a, pf.pos, pf.rot);
      const a2 = toLocal(part.a, pos, rot);
      const hinge = part.joint === 'knee' || part.joint === 'elbow';
      const data = hinge ? RAPIER.JointData.revolute(a1, a2, { x: 1, y: 0, z: 0 }) : RAPIER.JointData.spherical(a1, a2);
      const joint = world.createImpulseJoint(data, bodies[part.parent], body, true);
      if (hinge) joint.setLimits(-0.05, part.joint === 'knee' ? RAGDOLL_KNEE_MAX : RAGDOLL_ELBOW_MAX); // bends one way only
      joints.push(joint);
    }
  }

  let t = 0;
  let still = 0;
  return {
    bodies,
    // A point / direction stored in a part's frame now, and where it is later.
    pointIn: (key, p) => toLocal(p, frames[key].pos, frames[key].rot),
    dirIn: (key, d) => d.clone().applyQuaternion(frames[key].rot.clone().invert()),
    pointOut(key, local, out) {
      const b = bodies[key];
      return out.copy(local).applyQuaternion(_q.copy(b.rotation())).add(b.translation());
    },
    dirOut: (key, local, out) => out.copy(local).applyQuaternion(_q.copy(bodies[key].rotation())),
    // Advance the timers; true once it has lain still long enough (or for too long).
    settled(dt) {
      t += dt;
      const v = bodies[parts[0].key].linvel();
      still = Math.hypot(v.x, v.y, v.z) < RAGDOLL_STILL_SPEED ? still + dt : 0;
      return (t > RAGDOLL_MIN_TIME && still > RAGDOLL_STILL_TIME) || t > RAGDOLL_MAX_TIME;
    },
    destroy() {
      for (const j of joints) world.removeImpulseJoint(j, false);
      for (const b of Object.values(bodies)) world.removeRigidBody(b);
    },
  };
}

function toLocal(p, pos, rot) {
  return p.clone().sub(pos).applyQuaternion(rot.clone().invert());
}
