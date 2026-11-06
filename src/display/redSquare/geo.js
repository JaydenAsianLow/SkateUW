// 2D footprint helpers (x/z plane) shared by the Red Square level builders.
import { BoxGeometry, Matrix4, Shape, ShapeGeometry, Vector3 } from 'three';

export function pointInPolygon([x, z], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Every edge of a polygon with its direction `e`, outward normal `n` (away from the polygon) and length.
export function edges(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const e = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let n = [e[1], -e[0]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (pointInPolygon([mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05], poly)) n = [-n[0], -n[1]];
    out.push({ i, a, b, e, n, len, mid });
  }
  return out;
}

const UP = new Vector3(0, 1, 0);
const _x = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();

// Box in an edge's frame: `u` along the edge from `a`, `w` outward from the wall, `y` up.
// size = [along, up, out]. Returns a BoxGeometry already placed in world space.
export function edgeBox(edge, u, y, w, size) {
  const { a, e, n } = edge;
  _x.set(e[0], 0, e[1]);
  _z.set(n[0], 0, n[1]);
  if (new Vector3().crossVectors(_x, UP).dot(_z) < 0) _x.negate(); // keep the basis right-handed
  _m.makeBasis(_x, UP, _z).setPosition(a[0] + e[0] * u + n[0] * w, y, a[1] + e[1] * u + n[1] * w);
  return new BoxGeometry(size[0], size[1], size[2]).applyMatrix4(_m);
}

// Y rotation that turns a collider's local +x along the edge direction.
export const edgeRotY = (e) => Math.atan2(-e[1], e[0]);

// Flat polygon (with optional holes) lying on the x/z plane at height y, facing up.
export function flatPolygon(poly, y = 0, holes = []) {
  const toShape = (p, S) => {
    const s = new S();
    p.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    return s;
  };
  const shape = toShape(poly, Shape);
  for (const h of holes) shape.holes.push(toShape(h, Shape));
  const g = new ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// Replace a ground geometry's uv with world xz / 2 (one 2 m brick tile per unit).
export function worldUv(g) {
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
  uv.needsUpdate = true;
  return g;
}
