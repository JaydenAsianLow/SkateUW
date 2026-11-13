import { useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { materials, merge } from '../look.js';
import { edgeBox, edgeRotY, edges, flatPolygon } from './geo.js';
import { LOW } from './layout.js';
import { onFacade } from './Glb.jsx';

// Buildings extruded from their OpenStreetMap footprints (MAP.md §7):
//  - mid tier (Kane, Odegaard, Meany, Gerberding): correct footprint + height, windows with real depth
//  - backdrop: same extrusion, windows painted by the facade shader, everything merged into a few meshes
// Walls start at LOW so a building straddling the deck edge never shows a gap underneath.

const LEVEL = 4.2;

// Vertical walls with uv = (meters along the perimeter, height) and aWin = window pattern.
function wallGeometry(pts, height, win = [0, 0, 0]) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const aw = [];
  let u = 0;
  for (const ed of edges(pts)) {
    const { a, b, n, len } = ed;
    // Two triangles, wound so they face outward along n.
    const quad = [
      [a, LOW, u], [b, LOW, u + len], [b, height, u + len],
      [a, LOW, u], [b, height, u + len], [a, height, u],
    ];
    const faceN = [-(b[1] - a[1]), b[0] - a[0]]; // normal of the default winding
    const flip = faceN[0] * n[0] + faceN[1] * n[1] < 0;
    const order = flip ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5];
    for (const k of order) {
      const [p, y, uu] = quad[k];
      pos.push(p[0], y, p[1]);
      nrm.push(n[0], 0, n[1]);
      uv.push(uu, y);
      aw.push(...win);
    }
    u += len;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aWin', new Float32BufferAttribute(aw, 3));
  return g;
}

// Window styles for the mid-tier buildings. `trim` is the material the reveals/sills use.
const STYLES = {
  // 1970s brick (Kane, Odegaard, Meany): glazed ground floor between brick piers, narrow deep slot windows above.
  modern: { bay: 3.4, wall: 'facadeBrick', trim: 'concrete', cap: 'concrete' },
  // Older stone hall (Gerberding): punched windows with stone sills and heads.
  stone: { bay: 3.0, wall: 'facadeStone', trim: 'limestone', cap: 'limestone' },
  // Collegiate Gothic brick with limestone trim (rest of Suzzallo).
  gothic: { bay: 2.8, wall: 'facadeBrick', trim: 'limestone', cap: 'limestone' },
};

function midParts(pts, height, styleName) {
  const st = STYLES[styleName];
  const floors = Math.max(1, Math.round((height - 1) / LEVEL));
  const floorH = (height - 1.2) / floors;
  const glass = [];
  const warm = [];
  const trim = [];
  let lit = 0;
  for (const ed of edges(pts)) {
    if (onFacade(ed)) continue; // modelled in Blender (Glb.jsx)
    // Parapet coping along the top.
    trim.push(edgeBox(ed, ed.len / 2, height + 0.2, 0.05, [ed.len + 0.35, 0.5, 0.6]));
    const n = Math.floor((ed.len - 1.2) / st.bay);
    if (n < 1) continue;
    const u0 = (ed.len - (n - 1) * st.bay) / 2;
    for (let f = 0; f < floors; f++) {
      const y0 = f * floorH;
      for (let i = 0; i < n; i++) {
        const u = u0 + i * st.bay;
        const pane = ((lit = (lit * 1103515245 + 12345) & 0x7fffffff) % 100) < 9 ? warm : glass;
        if (styleName === 'modern' && f === 0) {
          // Storefront glazing set back between piers.
          pane.push(edgeBox(ed, u, 1.7, 0.01, [st.bay - 0.7, 3.0, 0.04]));
          trim.push(edgeBox(ed, u + st.bay / 2, 1.75, 0.2, [0.7, 3.5, 0.4])); // pier
          trim.push(edgeBox(ed, u, 3.45, 0.15, [st.bay, 0.35, 0.3])); // lintel
          continue;
        }
        if (styleName === 'modern') {
          const h = floorH * 0.62;
          const yb = y0 + floorH * 0.22;
          pane.push(edgeBox(ed, u, yb + h / 2, 0.02, [1.0, h, 0.04]));
          trim.push(edgeBox(ed, u - 0.62, yb + h / 2, 0.22, [0.24, h + 0.3, 0.44])); // deep side reveals
          trim.push(edgeBox(ed, u + 0.62, yb + h / 2, 0.22, [0.24, h + 0.3, 0.44]));
          trim.push(edgeBox(ed, u, yb - 0.1, 0.22, [1.5, 0.2, 0.44]));
        } else {
          const w = styleName === 'stone' ? 1.3 : 1.2;
          const h = Math.min(2.6, floorH * 0.6);
          const yb = y0 + (f === 0 ? 1.2 : floorH * 0.25);
          pane.push(edgeBox(ed, u, yb + h / 2, 0.02, [w, h, 0.04]));
          trim.push(edgeBox(ed, u, yb - 0.08, 0.12, [w + 0.4, 0.16, 0.26])); // sill
          trim.push(edgeBox(ed, u, yb + h + 0.12, 0.08, [w + 0.3, 0.24, 0.18])); // head
          trim.push(edgeBox(ed, u - w / 2 - 0.08, yb + h / 2, 0.08, [0.16, h, 0.18]));
          trim.push(edgeBox(ed, u + w / 2 + 0.08, yb + h / 2, 0.08, [0.16, h, 0.18]));
          trim.push(edgeBox(ed, u, yb + h * 0.6, 0.03, [w, 0.06, 0.06])); // transom
        }
      }
      if (styleName !== 'modern' && f > 0) trim.push(edgeBox(ed, ed.len / 2, y0 - 0.05, 0.06, [ed.len + 0.15, 0.2, 0.12])); // string course
    }
  }
  return { glass: merge(glass), warm: merge(warm), trim: merge(trim), trimMat: st.trim, wallMat: st.wall };
}

export function edgeColliders(pts, height) {
  return edges(pts).map((ed) => ({
    args: [ed.len / 2 + 0.3, (height - LOW) / 2, 0.5],
    position: [ed.mid[0] - ed.n[0] * 0.5, (height + LOW) / 2, ed.mid[1] - ed.n[1] * 0.5],
    rotY: edgeRotY(ed.e),
  }));
}

// Upright box colliders from { args, position, rotY } (half extents, centre, yaw).
export function BoxColliders({ list }) {
  return list.map((c, i) => <CuboidCollider key={i} args={c.args} position={c.position} rotation={[0, c.rotY, 0]} />);
}

export function MidBuilding({ pts, height, style = 'modern', roof = 'roofFlat' }) {
  const m = materials();
  const geo = useMemo(() => {
    const parts = midParts(pts, height, style);
    return {
      ...parts,
      walls: wallGeometry(pts, height),
      roof: flatPolygon(pts, height),
      colliders: edgeColliders(pts, height),
    };
  }, [pts, height, style]);
  return (
    <RigidBody type="fixed" colliders={false}>
      <BoxColliders list={geo.colliders} />
      <mesh geometry={geo.walls} material={m[geo.wallMat]} castShadow receiveShadow />
      <mesh geometry={geo.roof} material={m[roof]} receiveShadow />
      {geo.trim && <mesh geometry={geo.trim} material={m[geo.trimMat]} castShadow receiveShadow />}
      {geo.glass && <mesh geometry={geo.glass} material={m.glass} />}
      {geo.warm && <mesh geometry={geo.warm} material={m.glassWarm} />}
    </RigidBody>
  );
}

// All backdrop buildings merged: brick walls with painted windows, flat roofs, stone coping.
export function Backdrop({ buildings }) {
  const m = materials();
  const geo = useMemo(() => {
    const walls = [];
    const roofs = [];
    const coping = [];
    for (const b of buildings) {
      walls.push(wallGeometry(b.pts, b.height, [2.8, LEVEL, b.height - 1.8]));
      roofs.push(flatPolygon(b.pts, b.height));
      for (const ed of edges(b.pts)) coping.push(edgeBox(ed, ed.len / 2, b.height + 0.15, 0.05, [ed.len + 0.3, 0.45, 0.5]));
    }
    return { walls: merge(walls), roofs: merge(roofs), coping: merge(coping) };
  }, [buildings]);
  return (
    <group>
      <mesh geometry={geo.walls} material={m.facadeBrick} castShadow receiveShadow />
      <mesh geometry={geo.roofs} material={m.roofFlat} receiveShadow />
      <mesh geometry={geo.coping} material={m.limestone} castShadow />
    </group>
  );
}
