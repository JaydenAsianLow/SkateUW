import { useMemo } from 'react';
import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { materials, merge } from './look.js';
import { Instanced } from './Instanced.jsx';

// Plaza furniture (DESIGN.md §6.2, §6.4): cast-iron lamp posts and benches.
// Every copy of a prop is drawn as one instanced mesh per material; colliders share one fixed body.

function lampGeometry() {
  const cyl = (rt, rb, h, y, seg = 12) => new CylinderGeometry(rt, rb, h, seg).translate(0, y, 0);
  return {
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
}

// Lamps are lit (warm glow that blooms) but don't light the scene at this time of day.
// positions = [[x, z], ...]
export function LampPosts({ positions }) {
  const m = materials();
  const g = useMemo(lampGeometry, []);
  const items = useMemo(() => positions.map(([x, z]) => ({ position: [x, 0, z] })), [positions]);
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {positions.map(([x, z], i) => (
          <CylinderCollider key={i} args={[2.2, 0.12]} position={[x, 2.2, z]} />
        ))}
      </RigidBody>
      <Instanced geometry={g.iron} material={m.iron} items={items} castShadow />
      <Instanced geometry={g.globe} material={m.lampGlobe} items={items} />
    </>
  );
}

function benchGeometry() {
  const b = (w, h, d, x, y, z, rx = 0) => {
    const g = new BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    return g.translate(x, y, z);
  };
  return {
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
}

// benches = [[x, z, rotY], ...]
export function Benches({ benches }) {
  const m = materials();
  const g = useMemo(benchGeometry, []);
  const items = useMemo(() => benches.map(([x, z, rotY]) => ({ position: [x, 0, z], rotY })), [benches]);
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {benches.map(([x, z, rotY], i) => (
          <CuboidCollider key={i} args={[0.95, 0.3, 0.3]} position={[x, 0.3, z]} rotation={[0, rotY, 0]} />
        ))}
      </RigidBody>
      <Instanced geometry={g.wood} material={m.benchWood} items={items} castShadow receiveShadow />
      <Instanced geometry={g.iron} material={m.iron} items={items} castShadow />
    </>
  );
}
