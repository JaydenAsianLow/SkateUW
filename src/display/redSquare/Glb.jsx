import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { DoubleSide, Euler, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { materials, merge } from '../look.js';
import FACADES from '../../../public/map/rs-facades.json';
import { PLAZA } from './osm.js';

// Red Square pieces modelled in Blender (art/scripts/2x_*.py -> public/models/redsquare/*.glb).
// The GLBs only carry geometry and material *names*; the game's own shaders are swapped in here so the
// Blender pieces match the rest of the level (world-mapped brick, weathered stone, the golden-hour look).
// Nodes named COL_* are physics boxes: a unit cube whose transform gives the size, position and yaw.

const DIR = '/models/redsquare/';

const MATERIAL_FOR = {
  M_brick: 'wallBrick',
  M_brick_dark: 'brickDark',
  M_brick_tan: 'brickTan',
  M_concrete: 'castConcrete',
  M_aggregate: 'aggregate',
  M_stone: 'gothicStone',
  M_granite: 'granite',
  M_glass: 'glass',
  M_glass_warm: 'glassWarm',
  M_corten: 'corten',
  M_metal: 'iron',
  M_bronze: 'bronze',
  M_brass: 'brass',
  M_wood: 'benchWood',
  M_slate: 'suzzRoof',
  M_roofmetal: 'roofMetal',
  M_skylight: 'skylight',
  M_paverbrick: 'ground',
};

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _e = new Euler();

// Grind lines (handrails, ledge and coping edges) from every piece, in world space: { name, a: [x,y,z], b: [x,y,z] }.
// Nothing reads them yet; they are here for the grind/slide moves (each RAIL_* line in the Blender scripts).
export const grindLines = new Map();

// Merge every mesh of one material into one geometry (baked transforms) and collect the colliders.
function prepare(scene) {
  const m = materials();
  scene.updateMatrixWorld(true);
  const byMat = new Map();
  const colliders = [];
  const rails = [];
  const trimeshes = [];
  scene.traverse((o) => {
    if (o.isLine && o.name.startsWith('RAIL_')) {
      const p = o.geometry.attributes.position;
      const a = new Vector3().fromBufferAttribute(p, 0).applyMatrix4(o.matrixWorld);
      const b = new Vector3().fromBufferAttribute(p, 1).applyMatrix4(o.matrixWorld);
      rails.push({ name: o.name.slice(5), a, b });
      return;
    }
    if (!o.isMesh) return;
    if (o.name.startsWith('COLMESH_')) {
      // Shaped collider (raised levels, banks): a trimesh of the node's triangles.
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const verts = Float32Array.from(g.attributes.position.array);
      trimeshes.push({ verts, idx: Uint32Array.from({ length: verts.length / 3 }, (_, i) => i) });
      return;
    }
    if (o.name.startsWith('COL_')) {
      o.matrixWorld.decompose(_p, _q, _s);
      colliders.push({ args: [_s.x / 2, _s.y / 2, _s.z / 2], position: _p.toArray(), rotation: _e.setFromQuaternion(_q).toArray().slice(0, 3) });
      return;
    }
    const name = o.material.name;
    let mat = m[MATERIAL_FOR[name]];
    if (!mat) {
      // Textured pieces (banners) keep their own texture, made matte.
      mat = byMat.get(name)?.mat ?? new MeshStandardMaterial({ map: o.material.map, color: o.material.color, roughness: 0.85, side: DoubleSide });
    }
    if (!byMat.has(name)) byMat.set(name, { mat, geos: [] });
    byMat.get(name).geos.push(o.geometry.clone().applyMatrix4(_m.copy(o.matrixWorld)));
  });
  const meshes = [...byMat.values()].map(({ mat, geos }) => ({ mat, geo: merge(geos) }));
  return { meshes, colliders, rails, trimeshes };
}

// One Blender piece, placed with its plaza face (+Z after export) turned to `rotY`.
export function GlbPiece({ name, position = [0, 0, 0], rotY = 0 }) {
  const { scene } = useGLTF(DIR + name + '.glb');
  const { meshes, colliders, rails, trimeshes } = useMemo(() => prepare(scene), [scene]);
  useMemo(() => {
    const place = _m.compose(_p.fromArray(position), _q.setFromEuler(_e.set(0, rotY, 0)), _s.set(1, 1, 1));
    grindLines.set(name, rails.map((r) => ({ name: r.name, a: r.a.clone().applyMatrix4(place).toArray(), b: r.b.clone().applyMatrix4(place).toArray() })));
  }, [rails, name, position[0], position[2], rotY]);
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={[0, rotY, 0]} friction={0}>
      {colliders.map((c, i) => (
        <CuboidCollider key={i} args={c.args} position={c.position} rotation={c.rotation} />
      ))}
      {trimeshes.map((t, i) => (
        // 144 = FIX_INTERNAL_EDGES: no snagging on the edges between triangles (as for the plaza deck)
        <TrimeshCollider key={'t' + i} args={[t.verts, t.idx, 144]} />
      ))}
      {meshes.map(({ mat, geo }, i) => (
        <mesh key={i} geometry={geo} material={mat} castShadow receiveShadow />
      ))}
    </RigidBody>
  );
}

// Where a facade goes: the middle of its OSM wall, turned so the modelled front faces the plaza.
const PLAZA_MID = PLAZA.reduce((s, p) => [s[0] + p[0] / PLAZA.length, s[1] + p[1] / PLAZA.length], [0, 0]);
export function facadePlacement(key) {
  const { a, b } = FACADES[key];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let n = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  if (n[0] * (PLAZA_MID[0] - mid[0]) + n[1] * (PLAZA_MID[1] - mid[1]) < 0) n = [-n[0], -n[1]];
  return { position: [mid[0], 0, mid[1]], rotY: Math.atan2(n[0], n[1]) };
}

export function Facade({ name }) {
  const { position, rotY } = facadePlacement(name);
  return <GlbPiece name={name} position={position} rotY={rotY} />;
}

// True when a footprint edge lies on a modelled facade (so the extruded building skips its own windows there).
export function onFacade(ed) {
  for (const { a, b } of Object.values(FACADES)) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const near = (p) => {
      const t = Math.max(-0.05, Math.min(1.05, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) < 1.0;
    };
    if (near(ed.a) && near(ed.b)) return true;
  }
  return false;
}

export const preloadFacades = () => Object.keys(FACADES).forEach((k) => useGLTF.preload(DIR + k + '.glb'));
