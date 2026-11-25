// One-time scan of the level's physics shapes for grindable edges (curbs, ledges, step edges, benches...).
// Runs once when the level has loaded, never per frame. It reads the fixed colliders straight from the Rapier world
// and does its own vertical ray tests against them, so it works before the physics has ever stepped (menu screen).
import { Quaternion, Vector3 } from 'three';

const CELL = 4; // m, grid cell for the shape lookup

// --- Snapshot of every fixed collider: boxes (any rotation), triangle meshes, cylinders (as boxes) ---
export function snapshot(world, rapier) {
  const boxes = [];
  const tris = []; // flat world-space triangles: [ax, ay, az, bx, by, bz, cx, cy, cz]
  world.forEachCollider((c) => {
    const body = c.parent();
    const type = c.shapeType();
    if (c.isSensor() || (body && !body.isFixed())) return;
    // World pose = body pose * the collider's pose on the body. (collider.translation() is only up to date once the
    // physics has stepped, and on the menu screen it hasn't.)
    let pos, q;
    if (body) {
      const bt = body.translation(), br = body.rotation();
      const lt = c.translationWrtParent(), lr = c.rotationWrtParent();
      const bq = new Quaternion(br.x, br.y, br.z, br.w);
      pos = new Vector3(lt.x, lt.y, lt.z).applyQuaternion(bq).add(new Vector3(bt.x, bt.y, bt.z));
      q = bq.multiply(new Quaternion(lr.x, lr.y, lr.z, lr.w));
    } else {
      const t = c.translation(), r = c.rotation();
      pos = new Vector3(t.x, t.y, t.z);
      q = new Quaternion(r.x, r.y, r.z, r.w);
    }
    if (type === rapier.ShapeType.Cuboid) {
      const h = c.halfExtents();
      boxes.push(makeBox(pos, q, new Vector3(h.x, h.y, h.z)));
    } else if (type === rapier.ShapeType.Cylinder) {
      const rad = c.radius();
      boxes.push(makeBox(pos, q, new Vector3(rad, c.halfHeight(), rad), true));
    } else if (type === rapier.ShapeType.TriMesh) {
      const v = c.vertices();
      const idx = c.indices();
      const p = (i) => new Vector3(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]).applyQuaternion(q).add(pos);
      for (let i = 0; i < idx.length; i += 3) {
        const a = p(idx[i]), b = p(idx[i + 1]), cc = p(idx[i + 2]);
        tris.push([a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z]);
      }
    }
  });
  // Grid over xz so a vertical ray only tests the shapes above/below it.
  const grid = new Map();
  const put = (x0, z0, x1, z1, item) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
        const key = i * 100003 + k;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(item);
      }
  };
  const big = []; // shapes too large for the grid (the deck, the under-world floor): tested by every ray
  const isBig = (x0, z0, x1, z1) => x1 - x0 > 60 || z1 - z0 > 60;
  for (const b of boxes) (isBig(b.min.x, b.min.z, b.max.x, b.max.z) ? big.push(b) : put(b.min.x, b.min.z, b.max.x, b.max.z, b));
  for (const t of tris) {
    const x0 = Math.min(t[0], t[3], t[6]), x1 = Math.max(t[0], t[3], t[6]);
    const z0 = Math.min(t[2], t[5], t[8]), z1 = Math.max(t[2], t[5], t[8]);
    if (isBig(x0, z0, x1, z1)) { big.push({ tri: t }); continue; }
    put(x0, z0, x1, z1, { tri: t });
  }
  return { boxes, tris, grid, big };
}

function makeBox(pos, q, half, round = false) {
  const inv = q.clone().invert();
  // world-space AABB
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    v.set(sx * half.x, sy * half.y, sz * half.z).applyQuaternion(q).add(pos);
    min.min(v);
    max.max(v);
  }
  return { pos, q, inv, half, min, max, round };
}

const _o = new Vector3();
const _d = new Vector3();

// Vertical ray from (x, y, z) going `dir` (-1 down, +1 up). Returns { y } of the first surface hit, { inside: true } if
// the start point is inside a solid box, or null when nothing is hit within `maxT`.
export function vray(snap, x, y, z, dir, maxT = 4) {
  const cell = snap.grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
  const items = cell ? cell.concat(snap.big) : snap.big;
  let best = Infinity;
  for (const it of items) {
    if (it.tri) {
      const hy = triY(it.tri, x, z);
      if (hy === null) continue;
      const t = (hy - y) * dir;
      if (t >= -1e-4 && t < best) best = t;
      continue;
    }
    if (x < it.min.x || x > it.max.x || z < it.min.z || z > it.max.z) continue;
    // ray in box space: slab test
    _o.set(x, y, z).sub(it.pos).applyQuaternion(it.inv);
    _d.set(0, dir, 0).applyQuaternion(it.inv);
    let t0 = -Infinity, t1 = Infinity;
    for (const ax of ['x', 'y', 'z']) {
      const h = it.half[ax];
      if (Math.abs(_d[ax]) < 1e-9) {
        if (_o[ax] < -h || _o[ax] > h) { t0 = Infinity; break; }
      } else {
        let a = (-h - _o[ax]) / _d[ax], b = (h - _o[ax]) / _d[ax];
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
      }
    }
    if (t0 > t1 || t1 < 0) continue;
    if (t0 < -1e-3) return { inside: true };
    if (t0 < best) best = t0;
  }
  return best <= maxT ? { y: y + dir * best } : null;
}

// Height of triangle t at (x, z), or null when (x, z) is outside it (in plan).
function triY(t, x, z) {
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
  const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
  const w = 1 - u - v;
  if (u < -1e-6 || v < -1e-6 || w < -1e-6) return null;
  return u * ay + v * by + w * cy;
}

// Drop beside a point: how far the ground falls from height y at (x, z) offset by (nx, nz) * off. The probe starts
// `from` above y (higher finds a surface that rises above the edge, like a bank behind its toe curb).
// null when blocked (that spot is inside something) or there's no ground within 4 m.
export function dropBeside(snap, x, y, z, nx, nz, off = 0.3, from = 0.04) {
  const h = vray(snap, x + nx * off, y + from, z + nz * off, -1, 4 + from);
  if (!h || h.inside) return null;
  return y - h.y;
}

// --- Top edges of upright boxes that make curbs and ledges ---
// opts: { minLen, minDrop, maxDrop, curbMax, clear, noGrind(x, z) }
export function scanBoxEdges(snap, opts) {
  const out = [];
  const up = new Vector3(0, 1, 0);
  const ax = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  const names = ['x', 'y', 'z'];
  for (const b of snap.boxes) {
    if (b.round) continue; // cylinders: lamp posts, tree trunks
    // which local axis is vertical?
    let vi = -1;
    for (let i = 0; i < 3; i++) if (Math.abs(ax[i].clone().applyQuaternion(b.q).dot(up)) > 0.995) vi = i;
    if (vi < 0) continue; // tilted (rail colliders, sloped faces): not a box top
    const [i1, i2] = [0, 1, 2].filter((i) => i !== vi);
    const h1 = b.half[names[i1]], h2 = b.half[names[i2]];
    if (Math.min(h1, h2) < 0.06) continue; // too thin to be a ledge
    const top = b.max.y;
    const e1 = ax[i1].clone().applyQuaternion(b.q).setY(0).normalize();
    const e2 = ax[i2].clone().applyQuaternion(b.q).setY(0).normalize();
    const c = b.pos;
    // the four top edges: along e2 at ±h1 on e1, along e1 at ±h2 on e2
    const edges = [];
    for (const s of [-1, 1]) {
      edges.push({ n: e1.clone().multiplyScalar(s), mid: c.clone().addScaledVector(e1, s * h1), dir: e2, half: h2 });
      edges.push({ n: e2.clone().multiplyScalar(s), mid: c.clone().addScaledVector(e2, s * h2), dir: e1, half: h1 });
    }
    for (const ed of edges) {
      if (ed.half * 2 < 0.5) continue; // pieces shorter than this can't add up to a grind even when merged
      const drops = [];
      let ok = true;
      for (const t of [-0.8, 0, 0.8]) {
        const p = ed.mid.clone().addScaledVector(ed.dir, t * ed.half);
        if (opts.noGrind(p.x, p.z)) { ok = false; break; }
        const d = dropBeside(snap, p.x, top, p.z, ed.n.x, ed.n.z, 0.3);
        if (d === null) { ok = false; break; }
        // the edge must really be the top here (nothing sitting on it) ...
        const onTop = vray(snap, p.x - ed.n.x * 0.12, top + 0.04, p.z - ed.n.z * 0.12, -1, 0.2);
        if (!onTop || onTop.inside || Math.abs(onTop.y - top) > 0.03) { ok = false; break; }
        // ... and open above (room for a skater)
        const above = vray(snap, p.x, top + 0.05, p.z, 1, opts.clear);
        if (above) { ok = false; break; }
        // A step in a flight: the ground keeps dropping one tread further out. Only the last (bottom) step of a
        // flight is grindable, so you don't catch every nosing riding down the stairs.
        if (opts.lastStepOnly) {
          const further = dropBeside(snap, p.x, top, p.z, ed.n.x, ed.n.z, 0.75);
          if (further !== null && further > d + 0.08) { ok = false; break; }
        }
        drops.push(d);
      }
      if (!ok) continue;
      const lo = Math.min(...drops), hi = Math.max(...drops);
      if (lo < opts.minDrop || hi > opts.maxDrop || hi - lo > 0.12) continue;
      const a = ed.mid.clone().addScaledVector(ed.dir, -ed.half).setY(top);
      const bb = ed.mid.clone().addScaledVector(ed.dir, ed.half).setY(top);
      out.push({ a, b: bb, n: ed.n.clone(), height: (lo + hi) / 2, top });
    }
  }
  return mergeCollinear(out).filter((e) => e.a.distanceTo(e.b) >= opts.minLen);
}

// Join edges that continue each other (same top, parallel, in line, touching): pieces of one long curb.
function mergeCollinear(list) {
  const used = new Array(list.length).fill(false);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let { a, b } = list[i];
    const e = list[i];
    let grew = true;
    while (grew) {
      grew = false;
      const dir = b.clone().sub(a).normalize();
      for (let k = 0; k < list.length; k++) {
        if (used[k]) continue;
        const o = list[k];
        if (Math.abs(o.top - e.top) > 0.03) continue;
        const od = o.b.clone().sub(o.a).normalize();
        if (Math.abs(od.dot(dir)) < 0.999) continue;
        const off = o.a.clone().sub(a);
        if (off.clone().sub(dir.clone().multiplyScalar(off.dot(dir))).length() > 0.06) continue;
        // projections along dir
        const ta = 0, tb = b.clone().sub(a).dot(dir);
        const p0 = o.a.clone().sub(a).dot(dir), p1 = o.b.clone().sub(a).dot(dir);
        const lo = Math.min(p0, p1), hi = Math.max(p0, p1);
        if (lo > tb + 0.15 || hi < ta - 0.15) continue;
        const nlo = Math.min(ta, lo), nhi = Math.max(tb, hi);
        const base = a.clone();
        a = base.clone().addScaledVector(dir, nlo);
        b = base.clone().addScaledVector(dir, nhi);
        used[k] = true;
        grew = true;
      }
    }
    out.push({ ...e, a, b });
  }
  return out;
}
