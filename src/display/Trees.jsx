import { useMemo } from 'react';
import { CylinderGeometry, Quaternion, Vector3 } from 'three';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { materials, merge, rng } from './look.js';
import { Instanced } from './Instanced.jsx';

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

// trees = [{ p: [x, z], y, v: variant, s: scale }, ...]; each is turned by its index so copies look different.
// One instanced mesh per variant; all trunk colliders share one fixed body.
export function Trees({ trees }) {
  const m = materials();
  const variants = useMemo(() => [makeTree(11, 14), makeTree(23, 12), makeTree(37, 16), makeTree(51, 13)], []);
  const byVariant = useMemo(
    () =>
      variants.map((_, v) =>
        trees
          .map(({ p: [x, z], y = 0, v: tv = 0, s = 1 }, i) => ({ v: tv % variants.length, position: [x, y, z], rotY: i * 1.7, scale: s }))
          .filter((t) => t.v === v),
      ),
    [trees, variants],
  );
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {trees.map(({ p: [x, z], y = 0, s = 1 }, i) => (
          <CylinderCollider key={i} args={[1.5, 0.35 * s]} position={[x, y + 1.5, z]} />
        ))}
      </RigidBody>
      {variants.map((geo, v) =>
        byVariant[v].length ? <Instanced key={v} geometry={geo} material={m.bark} items={byVariant[v]} castShadow receiveShadow /> : null,
      )}
    </>
  );
}
