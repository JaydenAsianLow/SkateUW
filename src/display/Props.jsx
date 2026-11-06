import { useMemo } from 'react';
import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry } from 'three';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { materials, merge, rng } from './look.js';

// Plaza furniture (DESIGN.md §6.2, §6.4): cast-iron lamp posts, brick planters with hedges, benches.

let lampGeo = null;
function getLampGeo() {
  if (lampGeo) return lampGeo;
  const cyl = (rt, rb, h, y, seg = 12) => new CylinderGeometry(rt, rb, h, seg).translate(0, y, 0);
  lampGeo = {
    iron: merge([
      cyl(0.16, 0.22, 0.6, 0.3),
      cyl(0.12, 0.12, 0.12, 0.66),
      cyl(0.055, 0.07, 3.2, 2.3, 10),
      cyl(0.1, 0.075, 0.16, 3.92),
      cyl(0.15, 0.07, 0.18, 4.04),
      new ConeGeometry(0.13, 0.22, 10).translate(0, 4.58, 0),
      new SphereGeometry(0.04, 8, 6).translate(0, 4.72, 0),
    ]),
    globe: new SphereGeometry(0.21, 20, 14).translate(0, 4.3, 0),
  };
  return lampGeo;
}

// Lamps are lit (warm glow that blooms) but don't light the scene at this time of day.
export function LampPost({ position: [x, z] }) {
  const g = getLampGeo();
  const m = materials();
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      <CylinderCollider args={[2.2, 0.12]} position={[0, 2.2, 0]} />
      <mesh geometry={g.iron} material={m.iron} castShadow />
      <mesh geometry={g.globe} material={m.lampGlobe} />
    </RigidBody>
  );
}

// Dense lumpy hedge filling a rectangle (centre-origin), top at roughly `top`.
export function hedgeGeometry(sx, sz, top, seed) {
  const r = rng(seed);
  const parts = [];
  const n = Math.ceil(sx * sz * 2.2);
  for (let i = 0; i < n; i++) {
    const s = 0.35 + r() * 0.35;
    parts.push(
      new IcosahedronGeometry(1, 1)
        .scale(s * (1 + r() * 0.4), s * (0.8 + r() * 0.3), s * (1 + r() * 0.4))
        .translate((r() - 0.5) * (sx - s), top - s * 0.7 + r() * 0.15, (r() - 0.5) * (sz - s)),
    );
  }
  return merge(parts);
}

// Raised brick planter with a flat limestone cap, filled with hedges.
export function Planter({ position: [x, z], size: [sx, sz], height = 0.8, seed = 1 }) {
  const m = materials();
  const hedge = useMemo(() => hedgeGeometry(sx - 0.5, sz - 0.5, height + 0.75, seed), [sx, sz, height, seed]);
  const capT = 0.12;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      <CuboidCollider args={[sx / 2 + 0.1, (height + capT) / 2, sz / 2 + 0.1]} position={[0, (height + capT) / 2, 0]} />
      <mesh position={[0, height / 2, 0]} material={m.wallBrick} castShadow receiveShadow>
        <boxGeometry args={[sx, height, sz]} />
      </mesh>
      {/* Cap as a frame so the hedge soil shows inside */}
      {[
        [sx + 0.2, 0.5, 0, sz / 2 - 0.15],
        [sx + 0.2, 0.5, 0, -sz / 2 + 0.15],
        [0.5, sz - 0.1, sx / 2 - 0.15, 0],
        [0.5, sz - 0.1, -sx / 2 + 0.15, 0],
      ].map(([w, d, px, pz], i) => (
        <mesh key={i} position={[px, height + capT / 2, pz]} material={m.limestone} castShadow receiveShadow>
          <boxGeometry args={[w, capT, d]} />
        </mesh>
      ))}
      <mesh geometry={hedge} material={m.hedge} castShadow receiveShadow />
    </RigidBody>
  );
}

let benchGeo = null;
function getBenchGeo() {
  if (benchGeo) return benchGeo;
  const b = (w, h, d, x, y, z, rx = 0) => {
    const g = new BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    return g.translate(x, y, z);
  };
  benchGeo = {
    wood: merge([
      b(1.8, 0.04, 0.12, 0, 0.45, -0.16),
      b(1.8, 0.04, 0.12, 0, 0.45, 0),
      b(1.8, 0.04, 0.12, 0, 0.45, 0.16),
      b(1.8, 0.1, 0.03, 0, 0.62, 0.26, -0.2),
      b(1.8, 0.1, 0.03, 0, 0.78, 0.29, -0.2),
    ]),
    iron: merge([
      ...[-0.75, 0.75].flatMap((x) => [b(0.05, 0.45, 0.05, x, 0.22, -0.2), b(0.05, 0.85, 0.05, x, 0.42, 0.24, -0.15), b(0.05, 0.05, 0.5, x, 0.42, 0.02)]),
    ]),
  };
  return benchGeo;
}

export function Bench({ position: [x, z], rotY = 0 }) {
  const g = getBenchGeo();
  const m = materials();
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <CuboidCollider args={[0.95, 0.3, 0.3]} position={[0, 0.3, 0]} />
      <mesh geometry={g.wood} material={m.benchWood} castShadow receiveShadow />
      <mesh geometry={g.iron} material={m.iron} castShadow />
    </RigidBody>
  );
}
