import { useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { BoxGeometry, DataTexture, PlaneGeometry, Vector3 } from 'three';
import Atmosphere from '../display/Atmosphere.jsx';
import { groundMask, groundMaskBounds, materials, merge } from '../display/look.js';
import { worldUv } from '../display/redSquare/geo.js';
import { BOX_W, POST_R, RAIL_R, barCollider, boxBar, boxCollider, boxLegs, tube, wallCollider } from '../display/redSquare/bars.js';
import { grind } from '../display/grind/lines.js';
import { buildGrid } from '../display/grind/grinding.js';
import { GRIND_LONG } from '../display/tuning.js';

// The Controls guide's practice set (only in the demo iframe): open brick ground and, side by side in their own
// lanes, the pieces the demos need. Every lane starts at z = 0 and runs toward -z (heading 0), 10 m apart.
//   x = 0    flat: pushes, flips, manuals, walking
//   x = 10   short rail (7 m, 0.4 m up), just right of the lane: 50-50, boardslide
//   x = -10  curb (7 m, 0.15 m), just right of the lane
//   x = 20   long box rail (24 m): long grinds get the timing bar
// Demos pick their lane with `spawn` (demos.js).
export const LANES = { flat: 0, rail: 10, curb: -10, long: 20 };
const SIDE = 0.26; // the rails' centre lines sit this far right of their lane (an ollie from the lane lands on them)

export const PIECES = {
  rail: { x: LANES.rail + SIDE, z0: -7, z1: -14, base: 0, h: 0.4 },
  long: { x: LANES.long + SIDE, z0: -7, z1: -31, base: 0, h: 0.435 },
  curb: { x: LANES.curb + SIDE, z0: -9, z1: -16, h: 0.15, w: 0.5 },
};

// Grind lines like lines.js builds for the level: { id, name, type, pts, cum, length, long, height, inner }.
function line(id, type, pts, height, inner = null) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(...[0, 1, 2].map((k) => pts[i][k] - pts[i - 1][k])));
  const length = cum[cum.length - 1];
  return { id, name: id, type, pts, cum, length, long: length >= GRIND_LONG, height, inner, source: 'demo' };
}

export default function DemoWorld() {
  const m = materials();
  const geo = useMemo(() => {
    // The brick ground shader paints lawn outside its plaza mask: one white texel = brick everywhere here.
    const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.needsUpdate = true;
    groundMask.value = t;
    groundMaskBounds.value = [-300, -300, 600, 600];

    const iron = [];
    const colliders = [];
    // Short rail: round bar on posts, the same as the level's free-standing rails.
    const r = PIECES.rail;
    const ra = new Vector3(r.x, r.base + r.h, r.z0), rb = new Vector3(r.x, r.base + r.h, r.z1);
    iron.push(tube(ra, rb, RAIL_R));
    for (const z of [r.z0 + 0.15, (r.z0 + r.z1) / 2, r.z1 - 0.15]) iron.push(tube(new Vector3(r.x, r.base, z), new Vector3(r.x, r.base + r.h, z), POST_R));
    colliders.push(barCollider(ra, rb), wallCollider(ra, rb, r.base));
    // Long box rail on paired legs.
    const L = PIECES.long;
    const la = new Vector3(L.x, L.base + L.h, L.z0), lb = new Vector3(L.x, L.base + L.h, L.z1);
    iron.push(boxBar(la, lb));
    colliders.push(boxCollider(la, lb), wallCollider(la, lb, L.base, BOX_W / 2 - 0.02));
    const yaw = Math.atan2(lb.x - la.x, lb.z - la.z);
    const len = la.distanceTo(lb);
    for (let k = 0; k <= 7; k++) iron.push(...boxLegs(la.clone().lerp(lb, Math.min(1 - 0.3 / len, Math.max(0.3 / len, k / 7))), L.base, yaw));
    // Curb: a concrete block, its grindable edge on the lane side.
    const c = PIECES.curb;
    const cl = Math.abs(c.z1 - c.z0);
    const curb = new BoxGeometry(c.w, c.h, cl).translate(c.x + c.w / 2, c.h / 2, (c.z0 + c.z1) / 2);
    colliders.push({ args: [c.w / 2, c.h / 2, cl / 2], position: [c.x + c.w / 2, c.h / 2, (c.z0 + c.z1) / 2], rotation: [0, 0, 0] });

    const lines = [
      line('R1', 'rail', [ra.toArray(), rb.toArray()], r.h),
      line('R2', 'rail', [la.toArray(), lb.toArray()], L.h),
      line('C1', 'curb', [[c.x, c.h, c.z0], [c.x, c.h, c.z1]], c.h, [1, 0]),
    ];
    grind.lines = lines;
    grind.grid = buildGrid(lines);
    grind.ready = true;

    const ground = worldUv(new PlaneGeometry(600, 600).rotateX(-Math.PI / 2));
    return { iron: merge(iron), curb, colliders, ground };
  }, []);

  return (
    <>
      <Atmosphere />
      <RigidBody type="fixed" colliders={false} friction={0}>
        <CuboidCollider args={[300, 0.5, 300]} position={[0, -0.5, 0]} />
        {geo.colliders.map((c, i) => (
          <CuboidCollider key={i} args={c.args} position={c.position} rotation={c.rotation} />
        ))}
      </RigidBody>
      <mesh geometry={geo.ground} material={m.ground} receiveShadow />
      <mesh geometry={geo.iron} material={m.iron} castShadow />
      <mesh geometry={geo.curb} material={m.aggregate} castShadow receiveShadow />
    </>
  );
}
