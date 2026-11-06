import { useMemo } from 'react';
import { BoxGeometry, ConeGeometry, Euler, ExtrudeGeometry, Matrix4, Shape } from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { materials, merge, rng } from './look.js';

// Collegiate Gothic campus buildings (DESIGN.md §6.2–6.3): red brick, limestone trim,
// tall multi-pane windows, pointed-arch doorways, gables, crenellations and turrets.

const euler = new Euler();
export function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new Matrix4().makeRotationFromEuler(euler.set(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

export function archShape(w, h, spring) {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, spring);
  s.quadraticCurveTo(w / 2, spring + (h - spring) * 0.6, 0, h);
  s.quadraticCurveTo(-w / 2, spring + (h - spring) * 0.6, -w / 2, spring);
  s.lineTo(-w / 2, 0);
  return s;
}

export function extrude(shape, depth) {
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
}

// One window in face space (u across the face, y up, +z out of the wall).
function addWindow(L, u, yb, w, h, lancet, r) {
  const fr = 0.13;
  (r() < 0.14 ? L.warm : L.glass).push(box(w, h, 0.02, u, yb + h / 2, 0.02));
  L.trim.push(box(fr, h + fr, 0.14, u - w / 2 - fr / 2, yb + h / 2, 0.07));
  L.trim.push(box(fr, h + fr, 0.14, u + w / 2 + fr / 2, yb + h / 2, 0.07));
  L.trim.push(box(w + 0.45, 0.12, 0.24, u, yb - 0.06, 0.12)); // sill
  L.trim.push(box(0.07, h, 0.08, u, yb + h / 2, 0.04)); // mullion
  if (lancet) {
    const hw = w / 2 + fr;
    const ang = 0.85;
    const rise = Math.tan(ang) * hw;
    const len = hw / Math.cos(ang) + 0.1;
    L.trim.push(box(len, 0.16, 0.18, u - hw / 2, yb + h + rise / 2, 0.09, 0, 0, ang));
    L.trim.push(box(len, 0.16, 0.18, u + hw / 2, yb + h + rise / 2, 0.09, 0, 0, -ang));
    L.glass.push(box(w * 0.55, rise * 0.7, 0.02, u, yb + h + rise * 0.35, 0.02));
    for (const t of [0.3, 0.62]) L.trim.push(box(w, 0.06, 0.06, u, yb + h * t, 0.04));
  } else {
    L.trim.push(box(w + 2 * fr + 0.1, 0.2, 0.18, u, yb + h + 0.1, 0.09)); // head
    L.trim.push(box(w, 0.06, 0.06, u, yb + h * 0.7, 0.04)); // transom
  }
}

// Projecting limestone entrance bay with a pointed-arch doorway and steps.
function addDoor(L, { u, w = 2.4, h = 4.2 }) {
  const lift = 0.51; // door sits on top of three steps
  const bayW = w + 2.8;
  const bayH = h + lift + 4.5;
  L.trim.push(box(bayW, bayH, 0.9, u, bayH / 2, 0.45));
  L.trim.push(box(bayW + 0.3, 0.35, 1.1, u, bayH, 0.5)); // bay cap
  const ring = archShape(w + 1.0, h + 0.55, h * 0.6);
  ring.holes.push(archShape(w, h, h * 0.6));
  L.trim.push(extrude(ring, 0.25).translate(u, lift, 0.9));
  L.wood.push(extrude(archShape(w, h, h * 0.6), 0.05).translate(u, lift, 0.92));
  L.trim.push(box(w + 0.6, 0.9, 0.15, u, lift + h + 1.4, 0.97)); // carved panel
  for (let k = 0; k < 3; k++) {
    const sh = (3 - k) * 0.17;
    L.trim.push(box(bayW - 0.4, sh, 0.42, u, sh / 2, 0.9 + 0.21 + k * 0.42));
  }
}

function buildFacade(o, out, faceMatrix) {
  const L = { trim: [], glass: [], warm: [], wood: [] };
  const floorH = (o.h - o.baseH - o.topH) / o.floors;
  const n = Math.max(1, Math.floor((o.width - 1.6) / o.bayW));
  const u0 = -((n - 1) / 2) * o.bayW;
  const step = o.lancet ? 2 : 1;
  for (let f = 0; f < o.floors; f += step) {
    const span = Math.min(step, o.floors - f);
    const y0 = o.baseH + f * floorH;
    const wh = o.lancet ? floorH * span * 0.74 : floorH * 0.58;
    const yb = y0 + floorH * (o.lancet ? 0.12 : 0.2);
    for (let i = 0; i < n; i++) {
      const u = u0 + i * o.bayW;
      if (o.door && Math.abs(u - o.door.u) < (o.door.w ?? 2.4) / 2 + 1.4 + o.winW / 2 && yb < (o.door.h ?? 4.2) + 5.5) continue;
      addWindow(L, u, yb, o.winW, wh, o.lancet, o.rand);
    }
  }
  if (o.door) addDoor(L, o.door);
  for (const k of Object.keys(L)) for (const g of L[k]) out[k].push(g.applyMatrix4(faceMatrix));
}

const FACES = {
  '+z': (w, d) => ({ width: w, m: new Matrix4().makeTranslation(0, 0, d / 2) }),
  '-z': (w, d) => ({ width: w, m: new Matrix4().makeTranslation(0, 0, -d / 2).multiply(new Matrix4().makeRotationY(Math.PI)) }),
  '+x': (w, d) => ({ width: d, m: new Matrix4().makeTranslation(w / 2, 0, 0).multiply(new Matrix4().makeRotationY(Math.PI / 2)) }),
  '-x': (w, d) => ({ width: d, m: new Matrix4().makeTranslation(-w / 2, 0, 0).multiply(new Matrix4().makeRotationY(-Math.PI / 2)) }),
};

export function GothicBuilding({
  position: [x, z],
  w,
  d,
  h,
  rotY = 0,
  floors = 4,
  bayW = 2.7,
  winW = 1.25,
  roof = 'gable', // 'gable' | 'crenel' | 'spire'
  turrets = false,
  lancet = false,
  door = null, // { face, u, w, h }
  chimneys = 0,
  seed = 1,
}) {
  const geo = useMemo(() => {
    const r = rng(seed);
    const out = { brick: [], trim: [], glass: [], warm: [], wood: [], slate: [] };
    const baseH = 1.3;
    const topH = 1.2;

    out.brick.push(box(w, h, d, 0, h / 2, 0));
    out.trim.push(box(w + 0.3, 1.0, d + 0.3, 0, 0.5, 0)); // plinth
    const floorH = (h - baseH - topH) / floors;
    for (let f = 0; f <= floors; f += lancet ? 2 : 1) out.trim.push(box(w + 0.16, 0.22, d + 0.16, 0, baseH + f * floorH - 0.05, 0));
    out.trim.push(box(w + 0.4, 0.45, d + 0.4, 0, h - 0.2, 0)); // cornice

    for (const face of Object.keys(FACES)) {
      const { width, m } = FACES[face](w, d);
      buildFacade({ width, h, floors, baseH, topH, bayW, winW, lancet, rand: r, door: door?.face === face ? door : null }, out, m);
    }

    if (roof === 'gable') {
      const rh = d * 0.42;
      const tri = new Shape();
      tri.moveTo(-d / 2 - 0.3, 0);
      tri.lineTo(d / 2 + 0.3, 0);
      tri.lineTo(0, rh + 0.15);
      tri.lineTo(-d / 2 - 0.3, 0);
      out.slate.push(extrude(tri, w - 0.6).rotateY(Math.PI / 2).translate(-(w - 0.6) / 2, h, 0));
      // Brick gable ends with stone coping.
      const end = new Shape();
      end.moveTo(-d / 2, 0);
      end.lineTo(d / 2, 0);
      end.lineTo(0, rh + 0.6);
      end.lineTo(-d / 2, 0);
      const a = Math.atan2(rh + 0.6, d / 2);
      const L = Math.hypot(d / 2, rh + 0.6) + 0.3;
      for (const s of [-1, 1]) {
        out.brick.push(extrude(end, 0.6).rotateY(Math.PI / 2).translate(s * (w / 2) - 0.3, h, 0));
        out.trim.push(box(0.8, 0.3, L, s * (w / 2), h + (rh + 0.6) / 2 + 0.1, d / 4, a, 0, 0));
        out.trim.push(box(0.8, 0.3, L, s * (w / 2), h + (rh + 0.6) / 2 + 0.1, -d / 4, -a, 0, 0));
      }
      for (let c = 0; c < chimneys; c++) {
        const cx = (r() - 0.5) * (w - 6);
        const cz = (r() - 0.5) * d * 0.4;
        out.brick.push(box(1.1, rh + 2.5, 1.6, cx, h + (rh + 2.5) / 2, cz));
        out.trim.push(box(1.4, 0.25, 1.9, cx, h + rh + 2.5, cz));
      }
    }
    if (roof === 'crenel' || roof === 'spire') {
      out.trim.push(box(w + 0.25, 0.3, d + 0.25, 0, h + 0.15, 0));
      const merlons = (len, fixed, alongX) => {
        const n = Math.floor(len / 1.4);
        for (let i = 0; i <= n; i++) {
          const t = -len / 2 + (i * len) / n;
          out.brick.push(alongX ? box(0.75, 1.0, 0.5, t, h + 0.8, fixed) : box(0.5, 1.0, 0.75, fixed, h + 0.8, t));
        }
      };
      merlons(w, d / 2 - 0.25, true);
      merlons(w, -d / 2 + 0.25, true);
      merlons(d, w / 2 - 0.25, false);
      merlons(d, -w / 2 + 0.25, false);
    }
    if (roof === 'spire') {
      out.slate.push(new ConeGeometry(Math.min(w, d) * 0.62, h * 0.95, 4).rotateY(Math.PI / 4).translate(0, h + 0.3 + h * 0.475, 0));
    }
    if (turrets) {
      const th = h + 4.5;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const tx = (sx * w) / 2;
          const tz = (sz * d) / 2;
          out.brick.push(box(1.9, th, 1.9, tx, th / 2, tz));
          out.trim.push(box(2.2, 0.3, 2.2, tx, th, tz));
          for (let k = 1; k < 5; k++) out.trim.push(box(2.0, 0.18, 2.0, tx, (th * k) / 5, tz));
          out.slate.push(new ConeGeometry(1.45, 3.2, 4).rotateY(Math.PI / 4).translate(tx, th + 1.75, tz));
        }
    }

    const merged = {};
    for (const k of Object.keys(out)) merged[k] = merge(out[k]);
    return merged;
  }, [w, d, h, floors, bayW, winW, roof, turrets, lancet, door, chimneys, seed]);

  const m = materials();
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <CuboidCollider args={[w / 2 + 0.2, h / 2, d / 2 + 0.2]} position={[0, h / 2, 0]} />
      {geo.brick && <mesh geometry={geo.brick} material={m.wallBrick} castShadow receiveShadow />}
      {geo.trim && <mesh geometry={geo.trim} material={m.limestone} castShadow receiveShadow />}
      {geo.glass && <mesh geometry={geo.glass} material={m.glass} receiveShadow />}
      {geo.warm && <mesh geometry={geo.warm} material={m.glassWarm} />}
      {geo.wood && <mesh geometry={geo.wood} material={m.wood} receiveShadow />}
      {geo.slate && <mesh geometry={geo.slate} material={m.slate} castShadow receiveShadow />}
    </RigidBody>
  );
}
