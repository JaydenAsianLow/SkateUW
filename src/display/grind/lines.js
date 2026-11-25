// Grind lines: every edge or bar the board can grind, built once when the level loads.
//   { id, name, type: 'rail' | 'ledge' | 'curb', pts: [[x, y, z], ...], cum, height, length, long, inner, source }
// `pts` is a path (two points for a straight line, more for one with bends). `height` is how far the line sits
// above the ground beside it; `cum` the length along the path at each point; `inner` (ledges, curbs) which way, in
// plan, the top surface is from the edge. Rails come from the level pieces (RAIL_* lines in the Blender scripts, the stair rails
// in Ground.jsx); ledges and curbs are also found by scanning the colliders (scan.js).
import { grindLines } from '../redSquare/Glb.jsx';
import { POI } from '../redSquare/osm.js';
import LANDMARKS from '../../../public/map/rs-landmarks.json';
import { pointInPolygon } from '../redSquare/geo.js';
import { dropBeside, scanBoxEdges, snapshot } from './scan.js';
import { buildGrid } from './grinding.js';
import { GRIND_CURB_MAX, GRIND_LONG, GRIND_MAX_DROP, GRIND_MIN_DROP, GRIND_MIN_LEN } from '../tuning.js';

export const RAIL = 'rail';
export const LEDGE = 'ledge';
export const CURB = 'curb';

export const grind = { lines: [], ready: false };

// Art and landmarks, never grindable: the monoliths, Broken Obelisk, the George Washington statue.
const NO_GRIND = [
  ...LANDMARKS.monoliths.map((poly) => ({ poly, pad: 0.6 })),
  { c: LANDMARKS.obelisk.center, r: 4.2 },
  { c: POI.georgeWashington, r: 2.8 },
];
export function noGrind(x, z) {
  for (const zn of NO_GRIND) {
    if (zn.c && Math.hypot(x - zn.c[0], z - zn.c[1]) < zn.r) return true;
    if (zn.poly) {
      if (pointInPolygon([x, z], zn.poly)) return true;
      for (let i = 0; i < zn.poly.length; i++) {
        const a = zn.poly[i], b = zn.poly[(i + 1) % zn.poly.length];
        if (segDist(x, z, a, b) < zn.pad) return true;
      }
    }
  }
  return false;
}
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

// Authored lines that are not grind edges: the hill's crest is a smooth rounded top, not an edge; Suzzallo's
// balustrade is 0.9 m above its terrace and 2.1 m above the plaza (out of reach).
const SKIP_AUTHORED = /hill_crest|balustrade/;

function authoredType(piece, name) {
  if (piece === 'stairs' || piece === 'rails' || /rail/i.test(name)) return RAIL;
  if (/curb/i.test(name)) return CURB;
  return LEDGE;
}

const pathLength = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]), 0);

// Height above the ground on the lower side, measured at the middle of the first segment, and for an edge (ground
// on one side, a top surface on the other) which way the top is: inner = [x, z] unit vector, null for a bar.
function measure(snap, pts) {
  const [a, b] = pts;
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  const nx = -(b[2] - a[2]) / l, nz = (b[0] - a[0]) / l;
  const height = Math.max(dropBeside(snap, m[0], m[1], m[2], nx, nz, 0.3) ?? 0, dropBeside(snap, m[0], m[1], m[2], -nx, -nz, 0.3) ?? 0, 0);
  const d1 = dropBeside(snap, m[0], m[1], m[2], nx, nz, 0.3, 0.5);
  const d2 = dropBeside(snap, m[0], m[1], m[2], -nx, -nz, 0.3, 0.5);
  // The top is the side whose ground is clearly higher (a solid beside the line counts as high: a wall, the bank).
  const h1 = d1 ?? -1, h2 = d2 ?? -1;
  let inner = null;
  if (h1 < h2 - 0.08) inner = [nx, nz];
  else if (h2 < h1 - 0.08) inner = [-nx, -nz];
  return { height, inner };
}

// Cumulative length at each point of the path (for following it: grinding.js).
function withPath(l) {
  l.cum = [0];
  for (let i = 1; i < l.pts.length; i++) l.cum.push(l.cum[i - 1] + Math.hypot(...[0, 1, 2].map((k) => l.pts[i][k] - l.pts[i - 1][k])));
  return l;
}

// Distance from point p to the segment a-b (3D).
function distToSeg(p, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / l2));
  return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1], p[2] - a[2] - t * d[2]);
}

export function buildGrindLines(world, rapier) {
  const t0 = performance.now();
  const snap = snapshot(world, rapier);
  const lines = [];
  const add = (l) => {
    l.length = pathLength(l.pts);
    l.long = l.length >= GRIND_LONG;
    lines.push(withPath(l));
  };
  // 1. authored lines from the level pieces
  for (const [piece, list] of grindLines) {
    for (const item of list) {
      const { name } = item;
      const pts = item.pts ?? [item.a, item.b]; // a path (rails with bends), or a straight a-b line
      const a = pts[0], b = pts[pts.length - 1];
      if (SKIP_AUTHORED.test(name)) continue;
      if (noGrind(a[0], a[2]) && noGrind(b[0], b[2])) continue;
      const type = authoredType(piece, name);
      const { height, inner } = measure(snap, pts);
      add({ name: `${piece}/${name}`, type, pts, height, inner: type === RAIL ? null : inner, source: 'authored' });
    }
  }
  // 2. scanned box edges (curbs, ledges, step edges, benches) not already covered by an authored line
  const scanned = scanBoxEdges(snap, {
    minLen: GRIND_MIN_LEN,
    minDrop: GRIND_MIN_DROP,
    maxDrop: GRIND_MAX_DROP,
    clear: 1.2,
    noGrind,
    lastStepOnly: true,
  });
  const authored = lines.slice();
  for (const e of scanned) {
    const a = e.a.toArray(), b = e.b.toArray();
    // Already an authored line: both ends within 0.8 m of it in plan, at about the same height, and parallel.
    const dup = authored.some((l) => {
      const [p, q] = [l.pts[0], l.pts[l.pts.length - 1]];
      const near = (u) => distToSeg([u[0], p[1], u[2]], p, [q[0], p[1], q[2]]) < 0.8 && Math.abs(u[1] - (p[1] + q[1]) / 2) < 0.15;
      const lx = q[0] - p[0], lz = q[2] - p[2], ex = b[0] - a[0], ez = b[2] - a[2];
      const par = Math.abs(lx * ex + lz * ez) / ((Math.hypot(lx, lz) * Math.hypot(ex, ez)) || 1) > 0.98;
      return par && near(a) && near(b);
    });
    if (dup) continue;
    add({ name: 'scan', type: e.height <= GRIND_CURB_MAX ? CURB : LEDGE, pts: [a, b], height: e.height, inner: [-e.n.x, -e.n.z], source: 'scan' });
  }
  const tag = { [RAIL]: 'R', [LEDGE]: 'L', [CURB]: 'C' };
  const count = { R: 0, L: 0, C: 0 };
  for (const l of lines) l.id = tag[l.type] + ++count[tag[l.type]];
  grind.lines = lines;
  grind.grid = buildGrid(lines);
  grind.ready = true;
  grind.buildMs = performance.now() - t0;
  grind.stats = { boxes: snap.boxes.length, tris: snap.tris.length };
  return lines;
}
