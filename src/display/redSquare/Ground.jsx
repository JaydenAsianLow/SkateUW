import { useMemo } from 'react';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { CanvasTexture, LinearFilter, PlaneGeometry, Vector3 } from 'three';
import { groundMask, groundMaskBounds, materials, merge } from '../look.js';
import { edgeBox, edgeRotY, edges, flatPolygon, worldUv } from './geo.js';
import { BoxColliders } from './Footprints.jsx';
import { grindLines } from './Glb.jsx';
import { POST_R, RAIL_R, barCollider, tube } from './bars.js';
import { BOUNDS, HOLES, LOW, PAVED, RISER, STAIRS, stairCorners } from './layout.js';

// The plaza deck (y = 0) with holes where the ground drops to LOW, the lower ground, retaining walls,
// stair sets, invisible boundaries, and the paved/lawn mask the ground shader reads.

const WORLD = 700; // half-size of the deck
const WALL_T = 0.5; // retaining wall collider thickness
const TRIMESH_FIX_INTERNAL_EDGES = 144;
const RAIL_H = 0.9; // handrail height above the stair line
const RAIL_INSET = 0.35; // handrail distance in from each side of a stair set

function paintMask() {
  const [x0, z0, w, d] = groundMaskBounds.value;
  const PX_PER_M = 2;
  const c = document.createElement('canvas');
  c.width = w * PX_PER_M;
  c.height = d * PX_PER_M;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.filter = 'blur(1.5px)';
  g.setTransform(PX_PER_M, 0, 0, PX_PER_M, -x0 * PX_PER_M, -z0 * PX_PER_M);
  g.fillStyle = g.strokeStyle = '#fff';
  g.lineJoin = g.lineCap = 'round';
  const path = (pts) => {
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
  };
  PAVED.polygons.forEach((p, i) => {
    path(p);
    g.closePath();
    g.fill();
    if (i === 0) {
      g.lineWidth = PAVED.dilate;
      g.stroke();
    }
  });
  for (const [width, ...pts] of PAVED.paths) {
    path(pts);
    g.lineWidth = width;
    g.stroke();
  }
  for (const [x, z, r, width] of PAVED.rings) {
    g.beginPath();
    g.arc(x, z, r, 0, Math.PI * 2);
    g.lineWidth = width;
    g.stroke();
  }
  // Keep a black border so anything beyond the mask is lawn.
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.filter = 'none';
  g.strokeStyle = '#000';
  g.lineWidth = 4;
  g.strokeRect(0, 0, c.width, c.height);
  const t = new CanvasTexture(c);
  t.flipY = false;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export default function Ground() {
  const m = materials();
  const geo = useMemo(() => {
    groundMask.value = paintMask();
    const deck = worldUv(flatPolygon([[-WORLD, -WORLD], [WORLD, -WORLD], [WORLD, WORLD], [-WORLD, WORLD]], 0, HOLES));
    const lower = worldUv(new PlaneGeometry(WORLD * 3, WORLD * 3).rotateX(-Math.PI / 2).translate(0, LOW, 0));

    // Retaining walls on every hole edge except each hole's first edge (its stair top).
    const walls = [];
    const coping = [];
    const wallColliders = [];
    for (const hole of HOLES) {
      for (const ed of edges(hole)) {
        if (ed.i === 0) continue;
        const far = (p) => Math.max(Math.abs(p[0]), Math.abs(p[1])) > WORLD - 60;
        if (far(ed.a) && far(ed.b)) continue; // runs along the edge of the world
        const h = -LOW + 0.02;
        // The hole's outward normal points into the deck, so the wall sits just outside the hole.
        walls.push(edgeBox(ed, ed.len / 2, LOW + h / 2, 0.2, [ed.len + 0.4, h, 0.4]));
        coping.push(edgeBox(ed, ed.len / 2, 0.0, 0.1, [ed.len + 0.6, 0.05, 0.6]));
        wallColliders.push({
          args: [ed.len / 2 + 0.2, -LOW / 2, WALL_T / 2],
          position: [ed.mid[0] + ed.n[0] * (WALL_T / 2), LOW / 2, ed.mid[1] + ed.n[1] * (WALL_T / 2)],
          rotY: edgeRotY(ed.e),
        });
      }
    }

    // Stair sets: one solid block per step, from LOW up to that step's tread.
    const steps = [];
    const nosing = [];
    const stepColliders = [];
    for (const s of STAIRS) {
      const top = { a: s.top, e: [-s.dir[1], s.dir[0]], n: s.dir }; // edge frame: u across, w down the stairs
      for (let k = 0; k < s.risers - 1; k++) {
        const y = -(k + 1) * RISER;
        const h = y - LOW;
        const wMid = (k + 0.5) * s.tread;
        steps.push(edgeBox(top, 0, LOW + h / 2, wMid, [s.width, h, s.tread]));
        nosing.push(edgeBox(top, 0, y - 0.015, k * s.tread + 0.04, [s.width, 0.035, 0.08]));
        stepColliders.push({
          args: [s.width / 2, h / 2, s.tread / 2],
          position: [s.top[0] + s.dir[0] * wMid, LOW + h / 2, s.top[1] + s.dir[1] * wMid],
          rotY: edgeRotY(top.e),
        });
      }
    }

    // Handrails down both sides of each stair set (grind lines for the slide/grind moves).
    const rails = [];
    const railColliders = [];
    const lines = [];
    for (const s of STAIRS) {
      const { right, run } = stairCorners(s);
      for (const side of [-1, 1]) {
        const u = side * (s.width / 2 - RAIL_INSET);
        const at = (w, y) => new Vector3(s.top[0] + right[0] * u + s.dir[0] * w, y, s.top[1] + right[1] * u + s.dir[1] * w);
        const a = at(-0.3, RAIL_H);
        const b = at(run + 0.3, LOW + RAIL_H);
        rails.push(tube(a, b, RAIL_R));
        for (const t of [0, 0.5, 1]) {
          const p = a.clone().lerp(b, t);
          rails.push(tube(new Vector3(p.x, p.y - RAIL_H, p.z), p, POST_R));
        }
        railColliders.push(barCollider(a, b));
        lines.push({ name: `${s.key}_rail_${side < 0 ? 'left' : 'right'}`, a: a.toArray(), b: b.toArray() });
      }
    }
    grindLines.set('stairs', lines);

    // Invisible boundaries: walls from the lower ground up to 3 m above the deck along each polyline.
    const bounds = [];
    const bh = (3 - LOW) / 2;
    for (const line of BOUNDS) {
      for (let i = 0; i < line.length - 1; i++) {
        const [a, b] = [line[i], line[i + 1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const e = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        bounds.push({ args: [len / 2 + 0.4, bh, 0.25], position: [(a[0] + b[0]) / 2, LOW + bh, (a[1] + b[1]) / 2], rotY: edgeRotY(e) });
      }
    }

    return {
      deck,
      deckVerts: deck.attributes.position.array,
      deckIdx: deck.index.array,
      lower,
      walls: merge(walls),
      coping: merge(coping),
      steps: merge(steps),
      nosing: merge(nosing),
      rails: merge(rails),
      railColliders,
      colliders: [...wallColliders, ...stepColliders, ...bounds],
    };
  }, []);

  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={0}>
        {/* FIX_INTERNAL_EDGES (Rapier TriMeshFlags = 144): without it the board snags on the edges
            between the deck's long triangles and stops dead ("ghost" collisions). */}
        <TrimeshCollider args={[geo.deckVerts, geo.deckIdx, TRIMESH_FIX_INTERNAL_EDGES]} />
        <CuboidCollider args={[WORLD * 1.5, 0.5, WORLD * 1.5]} position={[0, LOW - 0.5, 0]} />
        <BoxColliders list={geo.colliders} />
        {geo.railColliders.map((c, i) => (
          <CuboidCollider key={'rail' + i} args={c.args} position={c.position} rotation={c.rotation} />
        ))}
      </RigidBody>
      <mesh geometry={geo.deck} material={m.ground} receiveShadow />
      <mesh geometry={geo.lower} material={m.ground} receiveShadow />
      <mesh geometry={geo.walls} material={m.limestone} castShadow receiveShadow />
      <mesh geometry={geo.coping} material={m.limestone} receiveShadow />
      <mesh geometry={geo.steps} material={m.limestone} castShadow receiveShadow />
      <mesh geometry={geo.nosing} material={m.granite} receiveShadow />
      <mesh geometry={geo.rails} material={m.iron} castShadow />
    </>
  );
}
