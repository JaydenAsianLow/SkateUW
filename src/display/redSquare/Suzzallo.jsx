import { useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { ConeGeometry, CylinderGeometry, Shape, SphereGeometry } from 'three';
import { archShape, box, extrude } from '../Buildings.jsx';
import { materials, merge } from '../look.js';
import { MidBuilding } from './Footprints.jsx';
import { LOW, SUZZALLO, SUZZALLO_FACADE } from './layout.js';

// Suzzallo Library, the hero building (MAP.md §7). The west wing faces Red Square: a long Collegiate
// Gothic façade with buttresses and pinnacles, tall pointed reading-room windows over a lower storey
// of smaller windows, a projecting three-arch entrance, terra-cotta figures and a steep roof.
// The rest of the OSM footprint is extruded behind it at mid detail.
// Proportions are from general knowledge; refine against photos (MAP.md §9).

const H = 22; // wall height
const D = 20; // wing depth
const ROOF_H = 10;
const BAYS = 15;
const ENTRY = [6, 7, 8]; // bays covered by the entrance pavilion

function wingGeometry(L) {
  const bay = L / BAYS;
  const u = (i) => -L / 2 + bay * (i + 0.5); // bay centre
  const F = D / 2; // facade plane (local +z faces the plaza)
  const brick = [];
  const trim = [];
  const glass = [];
  const warm = [];
  const wood = [];
  const roof = [];

  brick.push(box(L, H - LOW, D, 0, (H + LOW) / 2, 0));
  trim.push(box(L + 0.3, 1.2 - LOW, D + 0.3, 0, (1.2 + LOW) / 2, 0)); // plinth
  trim.push(box(L + 0.25, 0.45, D + 0.25, 0, 8.7, 0)); // belt course under the reading room
  trim.push(box(L + 0.5, 0.55, D + 0.5, 0, H - 0.1, 0)); // cornice
  for (let x = -L / 2 + 0.7; x < L / 2; x += 1.4) trim.push(box(0.62, 0.8, 0.4, x, H + 0.55, F - 0.2)); // crenellated parapet
  trim.push(box(L, 0.3, 0.5, 0, H + 0.1, F - 0.2));

  // Buttresses at bay divisions, stepping back above the belt course, each topped by a pinnacle.
  for (let i = 0; i <= BAYS; i++) {
    const x = -L / 2 + i * bay;
    trim.push(box(1.0, 9.0 - LOW, 1.4, x, (9 + LOW) / 2, F + 0.7));
    trim.push(box(0.85, H - 9, 0.8, x, (H + 9) / 2, F + 0.4));
    trim.push(box(1.05, 0.3, 1.5, x, 9.0, F + 0.7)); // weathering step
    trim.push(box(0.7, 1.1, 0.7, x, H + 0.85, F + 0.35));
    roof.push(new ConeGeometry(0.42, 2.6, 4).rotateY(Math.PI / 4).translate(x, H + 2.7, F + 0.35));
    // Terra-cotta figure standing on the step (the façade has a row of them).
    if (i > 0 && i < BAYS) {
      trim.push(new CylinderGeometry(0.2, 0.3, 1.5, 8).translate(x, 9.9, F + 1.0));
      trim.push(new SphereGeometry(0.17, 10, 8).translate(x, 10.82, F + 1.0));
    }
  }

  for (let i = 0; i < BAYS; i++) {
    const x = u(i);
    // Reading room: tall pointed windows with tracery, lit warm at dusk.
    const w = Math.min(2.6, bay - 1.4);
    const h = 9.4;
    const spring = 6.6;
    const yb = 10.0;
    const ring = archShape(w + 0.55, h + 0.35, spring);
    ring.holes.push(archShape(w, h, spring));
    trim.push(extrude(ring, 0.28).translate(x, yb - 0.15, F));
    (i % 4 === 1 ? glass : warm).push(extrude(archShape(w, h, spring), 0.04).translate(x, yb, F + 0.02));
    for (const dx of [-w / 6, w / 6]) trim.push(box(0.12, spring + 1.2, 0.12, x + dx, yb + (spring + 1.2) / 2, F + 0.08));
    trim.push(box(w, 0.12, 0.12, x, yb + spring * 0.5, F + 0.08));
    trim.push(box(w + 0.7, 0.25, 0.45, x, yb - 0.2, F + 0.2)); // sill

    if (ENTRY.includes(i)) continue;
    // Lower storey: paired rectangular windows in stone surrounds.
    for (const dx of [-0.75, 0.75]) {
      const ww = 1.0;
      const wh = 3.0;
      glass.push(box(ww, wh, 0.04, x + dx, 2.4 + wh / 2, F + 0.02));
      trim.push(box(ww + 0.3, 0.2, 0.3, x + dx, 2.3, F + 0.12));
      trim.push(box(ww + 0.3, 0.3, 0.25, x + dx, 2.4 + wh + 0.15, F + 0.1));
    }
    trim.push(box(0.2, 3.3, 0.25, x, 4.05, F + 0.1)); // mullion between the pair
  }

  // Entrance pavilion: projecting stone frontispiece with three pointed-arch doorways and steps.
  const ew = ENTRY.length * bay - 0.6;
  const ex = u(ENTRY[1]);
  trim.push(box(ew, 9.6 - LOW, 1.6, ex, (9.6 + LOW) / 2, F + 0.8));
  trim.push(box(ew + 0.4, 0.5, 1.9, ex, 9.6, F + 0.85));
  for (const k of [-1, 0, 1]) {
    const x = ex + k * bay;
    const dw = 2.5;
    const dh = 5.0;
    const r = archShape(dw + 0.8, dh + 0.5, dh * 0.62);
    r.holes.push(archShape(dw, dh, dh * 0.62));
    trim.push(extrude(r, 0.3).translate(x, 0.45, F + 1.6));
    wood.push(extrude(archShape(dw, dh, dh * 0.62), 0.05).translate(x, 0.45, F + 1.55));
    trim.push(box(dw + 0.4, 1.1, 0.2, x, 7.1, F + 1.65)); // carved panel
  }
  for (let k = 0; k < 3; k++) trim.push(box(ew + 1.2, 0.15 * (3 - k), 0.42, ex, (0.15 * (3 - k)) / 2, F + 1.6 + 0.21 + k * 0.42));

  // Steep gable roof along the wing, with brick gable ends and stone coping.
  const tri = new Shape();
  tri.moveTo(-D / 2 - 0.4, 0);
  tri.lineTo(D / 2 + 0.4, 0);
  tri.lineTo(0, ROOF_H);
  tri.lineTo(-D / 2 - 0.4, 0);
  roof.push(extrude(tri, L - 0.8).rotateY(Math.PI / 2).translate(-(L - 0.8) / 2, H, 0));
  const end = new Shape();
  end.moveTo(-D / 2, 0);
  end.lineTo(D / 2, 0);
  end.lineTo(0, ROOF_H + 0.6);
  end.lineTo(-D / 2, 0);
  const a = Math.atan2(ROOF_H + 0.6, D / 2);
  const cl = Math.hypot(D / 2, ROOF_H + 0.6) + 0.3;
  for (const s of [-1, 1]) {
    brick.push(extrude(end, 0.7).rotateY(Math.PI / 2).translate(s * (L / 2) - 0.35, H, 0));
    trim.push(box(0.9, 0.35, cl, s * (L / 2), H + (ROOF_H + 0.6) / 2 + 0.1, D / 4, a, 0, 0));
    trim.push(box(0.9, 0.35, cl, s * (L / 2), H + (ROOF_H + 0.6) / 2 + 0.1, -D / 4, -a, 0, 0));
    roof.push(new ConeGeometry(0.5, 3, 4).rotateY(Math.PI / 4).translate(s * (L / 2), H + ROOF_H + 2.1, 0));
  }

  return { brick: merge(brick), trim: merge(trim), glass: merge(glass), warm: merge(warm), wood: merge(wood), roof: merge(roof), bay, ex, ew };
}

export default function Suzzallo() {
  const m = materials();
  const wing = useMemo(() => {
    const { a, b } = SUZZALLO_FACADE;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const n = [-e[1], e[0]]; // outward (west, toward the plaza): a→b runs south, so its right side is west
    const off = 0.6 - D / 2; // façade sits 0.6 m in front of the OSM wall line
    const c = [(a[0] + b[0]) / 2 + n[0] * off, (a[1] + b[1]) / 2 + n[1] * off];
    return { L, c, rotY: Math.atan2(n[0], n[1]), geo: wingGeometry(L) };
  }, []);
  const g = wing.geo;
  return (
    <>
      {/* Rest of the building behind the hero wing, slightly lower so the wing reads as the front. */}
      <MidBuilding pts={SUZZALLO.pts} height={19} style="gothic" roof="suzzRoof" />
      <RigidBody type="fixed" colliders={false} position={[wing.c[0], 0, wing.c[1]]} rotation={[0, wing.rotY, 0]}>
        <CuboidCollider args={[wing.L / 2, (H - LOW) / 2, D / 2 + 0.7]} position={[0, (H + LOW) / 2, 0.7]} />
        <CuboidCollider args={[g.ew / 2 + 0.6, 1.5, 1.4]} position={[g.ex, 1.5, D / 2 + 1.6]} />
        <mesh geometry={g.brick} material={m.wallBrick} castShadow receiveShadow />
        <mesh geometry={g.trim} material={m.limestone} castShadow receiveShadow />
        <mesh geometry={g.glass} material={m.glass} />
        <mesh geometry={g.warm} material={m.glassWarm} />
        <mesh geometry={g.wood} material={m.wood} />
        <mesh geometry={g.roof} material={m.suzzRoof} castShadow receiveShadow />
      </RigidBody>
    </>
  );
}
