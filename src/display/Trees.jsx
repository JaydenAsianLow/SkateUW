import { useMemo } from 'react';
import { CylinderGeometry, Quaternion, Vector3 } from 'three';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { materials, merge, rng } from './look.js';

// Tall bare deciduous trees (DESIGN.md §6.4): only need to read as dark branch silhouettes
// against the bright sky, and throw long branchy shadows across the brick.

const UP = new Vector3(0, 1, 0);

function makeTree(seed, height) {
  const r = rng(seed);
  const parts = [];
  const q = new Quaternion();
  const MAX = 6;

  const branch = (start, dir, len, rad, depth) => {
    const seg = depth === 0 ? 9 : depth < 2 ? 6 : depth < 4 ? 4 : 3;
    const g = new CylinderGeometry(rad * 0.68, rad, len, seg, 1, true).translate(0, len / 2, 0);
    q.setFromUnitVectors(UP, dir);
    g.applyQuaternion(q).translate(start.x, start.y, start.z);
    parts.push(g);
    if (depth >= MAX) return;
    const n = depth === 0 ? 3 : r() < 0.55 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const axis = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).cross(dir).normalize();
      const nd = dir.clone().applyAxisAngle(axis, 0.35 + r() * 0.45);
      nd.y += depth < 2 ? 0.25 : 0.08; // main limbs reach up, twigs spread
      nd.normalize();
      const t = depth === 0 ? 0.8 + r() * 0.2 : 0.55 + r() * 0.45;
      const s = start.clone().addScaledVector(dir, len * t);
      branch(s, nd, len * (0.66 + r() * 0.14), rad * (depth === 0 ? 0.55 : 0.64), depth + 1);
    }
  };

  const lean = new Vector3((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize();
  branch(new Vector3(0, -0.2, 0), lean, height * 0.36, 0.34 + r() * 0.08, 0);
  return merge(parts);
}

let variants = null;
function getVariants() {
  if (!variants) variants = [makeTree(11, 14), makeTree(23, 12), makeTree(37, 16), makeTree(51, 13)];
  return variants;
}

export function Tree({ position: [x, z], y = 0, variant = 0, rotY = 0, scale = 1, collider = true }) {
  const geos = getVariants();
  const m = materials();
  const geo = useMemo(() => geos[variant % geos.length], [geos, variant]);
  return (
    <RigidBody type="fixed" colliders={false} position={[x, y, z]} rotation={[0, rotY, 0]}>
      {collider && <CylinderCollider args={[1.5, 0.35 * scale]} position={[0, 1.5, 0]} />}
      <mesh geometry={geo} material={m.bark} scale={scale} castShadow receiveShadow />
    </RigidBody>
  );
}
