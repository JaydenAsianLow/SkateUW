import { useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Vector3 } from 'three';
import { materials, merge } from '../look.js';
import { grindLines } from './Glb.jsx';
import { BOX_W, POST_R, RAIL_R, barCollider, boxBar, boxCollider, boxLegs, joint, tube, wallCollider } from './bars.js';
import { RAILS } from './layout.js';

// The free-standing rails (layout.js RAILS): iron bars on posts, like the stair handrails, with the same thin
// colliders; and the big box rails (style 'box') for long timing-bar grinds: wide steel box sections on paired legs. A rail can bend: each corner is rounded off (BEND_R) so a grind follows it smoothly. Each rail is one
// grind line along its whole (rounded) path.
const BEND_R = 1.2; // m, radius of the rounded corners
const POST_GAP = 2.6; // m, at most this far between posts
const BOX_GAP = 3.2; // m, between the big box rails' supports (grind line along the box's centre: BOX_H / 2 ~ RAIL_R)

// Replace each corner of a path with a short arc of radius r (points every ~0.25 m).
export function roundCorners(pts, r = BEND_R) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1].clone().sub(p).normalize();
    const b = pts[i + 1].clone().sub(p).normalize();
    const turn = Math.PI - a.angleTo(b); // how far the path turns here
    if (turn < 0.02) {
      out.push(p);
      continue;
    }
    const cut = Math.min(r * Math.tan(turn / 2), pts[i - 1].distanceTo(p) / 2, pts[i + 1].distanceTo(p) / 2);
    const p0 = p.clone().addScaledVector(a, cut);
    const p1 = p.clone().addScaledVector(b, cut);
    const n = Math.max(3, Math.ceil((turn * r) / 0.25));
    for (let k = 0; k <= n; k++) {
      // quadratic Bezier through the corner: tangent to both legs, close to a circular arc
      const t = k / n;
      out.push(p0.clone().multiplyScalar((1 - t) ** 2).addScaledVector(p, 2 * t * (1 - t)).addScaledVector(p1, t * t));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export default function Rails() {
  const m = materials();
  const geo = useMemo(() => {
    const parts = [];
    const colliders = [];
    const lines = [];
    for (const r of RAILS) {
      const y = r.base + r.h;
      if (r.style === 'box') {
        // Big box rail: straight, wide steel box on paired legs, solid box collider + a wall under it.
        const [a, b] = r.pts.map(([x, z]) => new Vector3(x, y, z));
        parts.push(boxBar(a, b));
        colliders.push(boxCollider(a, b), wallCollider(a, b, r.base, BOX_W / 2 - 0.02));
        const L = a.distanceTo(b);
        const n = Math.ceil(L / BOX_GAP);
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        for (let k = 0; k <= n; k++) parts.push(...boxLegs(a.clone().lerp(b, Math.min(1 - 0.3 / L, Math.max(0.3 / L, k / n))), r.base, yaw));
        lines.push({ name: r.name, pts: [a.toArray(), b.toArray()] });
        continue;
      }
      const path = roundCorners(r.pts.map(([x, z]) => new Vector3(x, y, z)));
      for (let i = 0; i < path.length - 1; i++) {
        parts.push(tube(path[i], path[i + 1], RAIL_R));
        if (i > 0) parts.push(joint(path[i], RAIL_R));
        colliders.push(barCollider(path[i], path[i + 1]), wallCollider(path[i], path[i + 1], r.base)); // bar + solid wall under it
      }
      // posts: both ends, and evenly in between at most POST_GAP apart (measured along the path)
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
      const L = cum[cum.length - 1];
      const n = Math.ceil(L / POST_GAP);
      for (let k = 0; k <= n; k++) {
        const s = Math.min(L - 0.15, Math.max(0.15, (L * k) / n));
        let i = 0;
        while (i < path.length - 2 && cum[i + 1] < s) i++;
        const p = path[i].clone().lerp(path[i + 1], (s - cum[i]) / (cum[i + 1] - cum[i]));
        parts.push(tube(new Vector3(p.x, r.base, p.z), p, POST_R));
      }
      lines.push({ name: r.name, pts: path.map((p) => p.toArray()) });
    }
    grindLines.set('rails', lines);
    return { mesh: merge(parts), colliders };
  }, []);
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {geo.colliders.map((c, i) => (
          <CuboidCollider key={i} args={c.args} position={c.position} rotation={c.rotation} />
        ))}
      </RigidBody>
      <mesh geometry={geo.mesh} material={m.iron} castShadow />
    </>
  );
}
