import { useMemo } from 'react';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { C, materials, merge, rng } from '../look.js';
import { LOW, STAIRS, VISTA_DIR } from './layout.js';
import { POI } from './osm.js';

// Broken Obelisk (Barnett Newman): ~7.8 m of weathering steel, an inverted, snapped-off obelisk balanced
// point-to-point on a pyramid. Artwork: solid collision only, never a grind spot (MAP.md §8).
export function BrokenObelisk() {
  const m = materials();
  const geo = useMemo(() => {
    const r = rng(9);
    const pyramid = new ConeGeometry(2.25, 2.3, 4, 1).rotateY(Math.PI / 4).translate(0, 1.15, 0);
    const shaft = new CylinderGeometry(0.75, 0.04, 5.5, 4, 6).rotateY(Math.PI / 4);
    // Jagged, torn top edge.
    const p = shaft.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 2.7) p.setY(i, p.getY(i) + (r() - 0.5) * 0.7);
    shaft.computeVertexNormals();
    shaft.translate(0, 2.3 + 2.75, 0);
    const pad = new BoxGeometry(4.8, 0.12, 4.8).translate(0, 0.06, 0);
    return { steel: merge([pyramid, shaft]), pad };
  }, []);
  const [x, z] = POI.brokenObelisk;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation={[0, 0.2, 0]}>
      <CuboidCollider args={[1.7, 1.2, 1.7]} position={[0, 1.2, 0]} />
      <CylinderCollider args={[2.6, 0.6]} position={[0, 4.9, 0]} />
      <mesh geometry={geo.steel} material={m.corten} castShadow receiveShadow />
      <mesh geometry={geo.pad} material={m.granite} receiveShadow />
    </RigidBody>
  );
}

// George Washington (Lorado Taft, 1909): bronze figure on a granite pedestal, facing west, below the plaza.
export function GeorgeWashington() {
  const m = materials();
  const geo = useMemo(() => {
    const stone = [
      new BoxGeometry(3.2, 0.5, 3.2).translate(0, 0.25, 0),
      new BoxGeometry(2.4, 2.4, 2.4).translate(0, 1.7, 0),
      new BoxGeometry(2.7, 0.35, 2.7).translate(0, 3.05, 0),
    ];
    const y0 = 3.22;
    const bronze = [
      new CylinderGeometry(0.16, 0.14, 1.1, 8).translate(-0.15, y0 + 0.55, 0), // legs
      new CylinderGeometry(0.16, 0.14, 1.1, 8).translate(0.15, y0 + 0.55, 0),
      new CylinderGeometry(0.42, 0.62, 1.2, 12).translate(0, y0 + 1.05, 0), // coat skirts
      new CylinderGeometry(0.36, 0.4, 0.9, 12).translate(0, y0 + 1.95, 0), // torso
      new SphereGeometry(0.2, 12, 10).translate(0, y0 + 2.6, 0.03),
      new CylinderGeometry(0.11, 0.1, 0.95, 8).rotateZ(0.15).translate(-0.48, y0 + 1.85, 0),
      new CylinderGeometry(0.11, 0.1, 0.95, 8).rotateX(-0.5).translate(0.48, y0 + 1.95, 0.2),
      new BoxGeometry(0.9, 0.08, 0.5).translate(0, y0 + 0.04, 0.05), // base plate
    ];
    return { stone: merge(stone), bronze: merge(bronze) };
  }, []);
  const [x, z] = POI.georgeWashington;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, LOW, z]} rotation={[0, -Math.PI / 2, 0]}>
      <CuboidCollider args={[1.6, 2, 1.6]} position={[0, 2, 0]} />
      <mesh geometry={geo.stone} material={m.granite} castShadow receiveShadow />
      <mesh geometry={geo.bronze} material={m.bronze} castShadow />
    </RigidBody>
  );
}

// Drumheller Fountain (backdrop): big round pool at the end of Rainier Vista with a central jet.
export function Drumheller() {
  const m = materials();
  const { center, radius } = POI.drumheller;
  const geo = useMemo(() => {
    const rim = new TorusGeometry(radius, 0.45, 8, 96).rotateX(Math.PI / 2).translate(0, 0.35, 0);
    const water = new CylinderGeometry(radius, radius, 0.1, 96).translate(0, 0.25, 0);
    const jets = [new CylinderGeometry(0.15, 0.7, 9, 12, 1, true).translate(0, 4.8, 0)];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      jets.push(new CylinderGeometry(0.06, 0.3, 3, 8, 1, true).translate(Math.cos(a) * radius * 0.45, 1.7, Math.sin(a) * radius * 0.45));
    }
    return { rim, water, jets: merge(jets) };
  }, [radius]);
  return (
    <group position={[center[0], LOW, center[1]]}>
      <mesh geometry={geo.rim} material={m.limestone} receiveShadow />
      <mesh geometry={geo.water} material={m.water} receiveShadow />
      <mesh geometry={geo.jets} material={m.jet} />
    </group>
  );
}

// Mount Rainier: a distant snow-capped silhouette straight down Rainier Vista (the vista is aligned on it).
// Real angular size is ~2.7°; drawn ~1.6× larger so it reads on screen. Unlit + unfogged, painted in haze.
export function MountRainier() {
  const geo = useMemo(() => {
    const r = rng(4392);
    const R = 260;
    const HT = 100;
    const g = new ConeGeometry(R, HT, 96, 14, true);
    const p = g.attributes.position;
    const col = [];
    const haze = new Color(C.fog).lerp(new Color('#b9a79a'), 0.35);
    const snow = new Color('#f6eadc');
    const sunSide = new Color('#ffd6a8');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const zz = p.getZ(i);
      const h = (y + HT / 2) / HT; // 0 base .. 1 summit
      // Broad shoulders, a flattened summit and ridges.
      const ang = Math.atan2(zz, x);
      const ridge = 1 + 0.08 * Math.sin(ang * 7 + r() * 0.3) + 0.05 * Math.sin(ang * 13);
      const k = h > 0.9 ? 0.9 + (h - 0.9) * 0.3 : h;
      p.setY(i, k * HT - HT / 2);
      const spread = (1 - h) ** 1.35 * ridge;
      const rad = Math.hypot(x, zz) || 1;
      p.setX(i, (x / rad) * R * spread);
      p.setZ(i, (zz / rad) * R * spread);
      const snowline = 0.42 + 0.12 * Math.sin(ang * 9);
      const c = haze.clone().lerp(snow, Math.min(1, Math.max(0, (h - snowline) / 0.12)));
      c.lerp(sunSide, 0.25 * Math.max(0, -Math.cos(ang)) * h);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    const mat = new MeshBasicMaterial({ vertexColors: true, fog: false });
    return { g, mat };
  }, []);
  const top = STAIRS[0].top;
  const dist = 820;
  return <mesh geometry={geo.g} material={geo.mat} position={[top[0] + VISTA_DIR[0] * dist, LOW + 18, top[1] + VISTA_DIR[1] * dist]} />;
}
