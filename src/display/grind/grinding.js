// Grinding: following a grind line (lines.js) with the board locked to it. Pure logic; Skateboard.jsx applies the
// result to the physics body and the board / rider visuals.
//
// One set of rules for every surface (rail, ledge, curb):
//  - Lock on from the air (an ollie, or rolling off something) when the board is close to a line (GRIND_SNAP) and
//    at any angle (across a rail locks on too). It eases onto the line over GRIND_SNAP_TIME.
//  - The trick is picked once, in the grind window (from the ollie's pop to GRIND_WINDOW s after locking on), and
//    then locked: ollied on + a half circle (the frontside / backside 180 finger movement) = boardslide; no jump or no
//    gesture = 50-50; a half circle given up halfway in the window, or any half circle after it, = bail.
//  - A grind that will last more than GRIND_TIMING.minTime (the line left / your speed when you lock on) gets the
//    timing bar: tap (phone button, Space) each time the moving marker is in the green; a miss counts, too many bail.
//    Shorter ones (stair sets, handrails) play by themselves.
//  - At the end you pop off and land rolling; an ollie gets you out early. Locked on slowly (under GRIND_HOP_SPEED)
//    it's a short hop on, hop off; any grind slower than GRIND_MIN_SPEED for GRIND_SLOW_TIME hops off. Never stuck.
import { clamp01 } from '../util.js';
import { RAIL_R } from '../redSquare/bars.js';
import {
  GRAVITY, GRIND_TIMING, GRIND_BOARDSLIDE_DRAG, GRIND_CORNER, GRIND_CORNER_KEEP, GRIND_CORNER_TURN, GRIND_CURB_ANGLE,
  GRIND_CURB_MAX, GRIND_CURB_TOWARD, GRIND_DRAG, GRIND_DROP_IN, GRIND_MAX_SPEED, GRIND_MIN_ENTRY, GRIND_SQUARE_KEEP,
  GRIND_HOP_DIST, GRIND_HOP_SLIDE, GRIND_HOP_SPEED, GRIND_SLOW_TIME, GRIND_MIN_SPEED, GRIND_NEAR, GRIND_PRE, GRIND_REACH, GRIND_SLOPE, GRIND_SNAP, GRIND_SNAP_TIME, GRIND_STUCK, GRIND_WINDOW,
} from '../tuning.js';

// Point and unit tangent at distance s along a line's path.
export function at(line, s) {
  const { pts, cum } = line;
  const L = cum[cum.length - 1];
  s = Math.max(0, Math.min(L, s));
  let i = 0;
  while (i < pts.length - 2 && cum[i + 1] < s) i++;
  const a = pts[i], b = pts[i + 1];
  const len = cum[i + 1] - cum[i] || 1;
  const k = (s - cum[i]) / len;
  return {
    p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
    t: [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len],
    seg: i,
  };
}

// Closest point of a line to (x, z) in plan: { s, d (plan distance), y (line height there) }.
export function nearest(line, x, z) {
  const { pts, cum } = line;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const l2 = dx * dx + dz * dz || 1e-9;
    const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2));
    const px = a[0] + dx * k, pz = a[2] + dz * k;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { s: cum[i] + (cum[i + 1] - cum[i]) * k, d, y: a[1] + (b[1] - a[1]) * k };
  }
  return best;
}

// Look for a line to lock onto. b = { x, z, bottom (y of the board's underside), vx, vy, vz, popped }.
export function findEntry(lines, b, skip) {
  const sp = Math.hypot(b.vx, b.vz);
  if (sp < GRIND_MIN_ENTRY) return null;
  const ux = b.vx / sp, uz = b.vz / sp;
  const reach = GRIND_SNAP + sp * 0.06; // a little lead at speed so the board locks before its nose hits a ledge
  let best = null;
  for (const line of lines) {
    if (skip && skip(line)) continue;
    const n = nearest(line, b.x, b.z);
    if (n.d > reach) continue;
    const dy = b.bottom - n.y; // + above the line
    if (dy > (b.popped ? 0.6 : GRIND_DROP_IN)) continue;
    if (dy < -(b.popped ? GRIND_REACH : 0.04)) continue;
    if (dy < 0 && b.vy < -1.5) continue; // already falling past it from below
    const { t } = at(line, n.s);
    const th = Math.hypot(t[0], t[2]) || 1;
    // Any approach angle locks on (ollie across a rail, or along it). Which way you go: the way you were heading;
    // coming in square-on, the longer way; if that way has no room, the other.
    const c = (ux * t[0] + uz * t[2]) / th;
    let dir = c > 0 ? 1 : -1;
    if (Math.abs(c) < 0.25) dir = line.length - n.s >= n.s ? 1 : -1;
    let left = dir > 0 ? line.length - n.s : n.s;
    if (left < 0.4) (dir = -dir), (left = dir > 0 ? line.length - n.s : n.s);
    if (left < 0.4) continue;
    const along = sp * Math.max(Math.abs(c), GRIND_SQUARE_KEEP); // a square-on entry keeps most of its speed
    const score = n.d + Math.abs(dy) * 0.5;
    if (!best || score < best.score) best = { line, s: n.s, dir, along, score };
  }
  return best;
}

// Riding up to a curb's edge on the ground, at a shallow angle and heading into it: lock on without an ollie.
// b = { x, z, bottom, vx, vz }.
export function findCurbEntry(lines, b, skip) {
  const sp = Math.hypot(b.vx, b.vz);
  if (sp < GRIND_MIN_ENTRY) return null;
  const ux = b.vx / sp, uz = b.vz / sp;
  const cosMax = Math.cos((GRIND_CURB_ANGLE * Math.PI) / 180);
  let best = null;
  for (const line of lines) {
    if (!line.inner || line.height > GRIND_CURB_MAX + 0.02 || (skip && skip(line))) continue;
    const n = nearest(line, b.x, b.z);
    if (n.d > GRIND_SNAP) continue;
    const dy = b.bottom - n.y;
    if (dy > -0.05 || dy < -(line.height + 0.08)) continue; // on the low side, beside it
    const { p, t } = at(line, n.s);
    // on the open side of the edge (not on top of it), moving toward it
    const ox = b.x - p[0], oz = b.z - p[2];
    if (ox * line.inner[0] + oz * line.inner[1] > 0) continue;
    const toward = -(ux * sp * ox + uz * sp * oz) / (Math.hypot(ox, oz) || 1);
    if (toward < GRIND_CURB_TOWARD) continue;
    const th = Math.hypot(t[0], t[2]) || 1;
    const c = (ux * t[0] + uz * t[2]) / th;
    if (Math.abs(c) < cosMax) continue;
    const dir = c > 0 ? 1 : -1;
    if ((dir > 0 ? line.length - n.s : n.s) < 0.6) continue;
    if (!best || n.d < best.d) best = { line, s: n.s, dir, along: sp * Math.abs(c), d: n.d };
  }
  return best;
}

// At the end of a line: another line starting right there (a pad's next edge), turning at most GRIND_CORNER_TURN.
export function findCorner(lines, g) {
  const { p, t } = at(g.line, g.s);
  const th = Math.hypot(t[0], t[2]) || 1;
  const fx = (t[0] * g.dir) / th, fz = (t[2] * g.dir) / th;
  const cosTurn = Math.cos((GRIND_CORNER_TURN * Math.PI) / 180);
  let best = null;
  for (const line of lines) {
    if (line === g.line) continue;
    for (const end of [0, 1]) {
      const q = end ? line.pts[line.pts.length - 1] : line.pts[0];
      const d = Math.hypot(q[0] - p[0], q[2] - p[2]);
      if (d > GRIND_CORNER || Math.abs(q[1] - p[1]) > 0.15) continue;
      const s = end ? line.length : 0;
      const dir = end ? -1 : 1;
      const t2 = at(line, s).t;
      const h2 = Math.hypot(t2[0], t2[2]) || 1;
      if ((fx * t2[0] * dir + fz * t2[2] * dir) / h2 < cosTurn) continue;
      if (!best || d < best.d) best = { line, s, dir, d };
    }
  }
  return best;
}

// Carry a grind round a corner onto the next line: same trick, a little slower, already decided.
export function continueGrind(g, next, center, half, now) {
  const g2 = { ...g, line: next.line, s: next.s, s0: next.s, dir: next.dir, speed: g.speed * GRIND_CORNER_KEEP, t: 0, decided: true, lockAt: now, snapT: 0, far: 0 };
  const { c } = seat(g2, half);
  g2.offset = [center[0] - c[0], center[1] - c[1], center[2] - c[2]];
  return g2;
}

// How far above a line the board's underside rides: rail lines run along the bar's centre, so on top of the bar
// (its radius) plus a little; ledge and curb lines are the stone's top edge.
export const seatLift = (type) => (type === 'rail' ? RAIL_R + 0.008 : 0.012);

// Where the board's centre goes on the line. half = the board collider's half height.
export function seat(g, half) {
  const { p, t } = at(g.line, g.s);
  const line = g.line;
  const lift = half + seatLift(line.type);
  let x = p[0], z = p[2];
  // Ledge / curb 50-50: the trucks ride the edge with the board over the top.
  if (g.kind === '5050' && line.inner) (x += line.inner[0] * 0.07), (z += line.inner[1] * 0.07);
  return { c: [x, p[1] + lift, z], t };
}

// popAt: when the ollie that got you here popped (performance.now() ms), or null if you rolled / rode on.
export function startGrind(hit, center, half, now, popAt = null) {
  const g = { line: hit.line, s: hit.s, dir: hit.dir, speed: hit.along, t: 0, kind: '5050', decided: false, lockAt: now, popAt, snapT: 0, slideSign: 1, hop: hit.along < GRIND_HOP_SPEED, bonus: 0, timing: null };
  // Long grind (by how long it will take at this speed): the timing bar.
  const left = hit.dir > 0 ? hit.line.length - hit.s : hit.s;
  if (!g.hop && left / Math.max(hit.along, 0.1) > GRIND_TIMING.minTime) g.timing = { m: 0, v: 1, misses: 0, hits: 0, tapped: false, wasIn: false, hist: [], flash: null };
  const { c } = seat(g, half);
  g.offset = [center[0] - c[0], center[1] - c[1], center[2] - c[2]];
  return g;
}

// One frame of grinding. inp = { now, arcAt, arcDir, partialAt, steer, live, ollie, gap (m between the board and
// where it should be) }.
// Returns { end } (null while it carries on: 'off' end of the line, 'ollie' popped out, 'stall' too slow, 'bail'),
// plus the board centre { c } and travel tangent { t } (unit, including the slope) to put it on.
export function stepGrind(g, dt, inp, half) {
  g.t += dt;
  const line = g.line;
  // Never trapped: if the board can't follow the line (something in the way) for GRIND_STUCK seconds, let go.
  g.far = inp.gap > 0.5 ? (g.far ?? 0) + dt : 0;
  if (g.far > GRIND_STUCK) return { end: 'stall' };
  // Trick choice, once, in the grind window: from the pop of the ollie that got you here (or GRIND_PRE s before
  // locking on, for a roll-on) to GRIND_WINDOW s after. Then the trick is locked: a 50-50 never turns into a slide.
  const from = g.popAt ?? g.lockAt - GRIND_PRE * 1000;
  const late = g.lockAt + GRIND_WINDOW * 1000; // half circles after this bail
  if (!g.decided) {
    if (g.popAt != null && inp.arcAt >= from && inp.arcAt <= late) {
      g.kind = 'boardslide';
      g.slideSign = inp.arcDir < 0 ? -1 : 1;
      g.changed = true;
      g.decided = true;
    } else if (inp.partialAt >= from) {
      return { end: 'bail' }; // a half circle given up halfway
    } else if (g.t >= GRIND_WINDOW) {
      g.decided = true; // nothing in the window: it stays a 50-50
    }
  }
  if (g.decided && (inp.arcAt > late || inp.partialAt > late)) return { end: 'bail' }; // too late: you lose it
  // Speed: surface drag, and gravity along the slope.
  const here = at(line, g.s);
  const down = -here.t[1] * g.dir; // sine of the slope, + going downhill
  g.speed += GRAVITY * GRIND_SLOPE * down * dt;
  g.speed *= 1 - GRIND_DRAG[line.type] * (g.kind === 'boardslide' ? GRIND_BOARDSLIDE_DRAG : 1) * dt;
  g.speed = Math.max(0, Math.min(GRIND_MAX_SPEED, g.speed));
  // Never stuck on a line: locked on slowly, it's a short hop on, hop off (slide GRIND_HOP_DIST, then off to the
  // side, landing rolling); and any grind that stays slower than GRIND_MIN_SPEED for GRIND_SLOW_TIME hops off too.
  if (g.hop) g.speed = Math.max(g.speed, GRIND_HOP_SLIDE);
  g.slowT = g.speed < GRIND_MIN_SPEED ? (g.slowT ?? 0) + dt : 0;
  if (g.slowT >= GRIND_SLOW_TIME) return { end: 'stall' };
  g.s += g.dir * g.speed * dt;
  g.went = (g.went ?? 0) + g.speed * dt;
  if (g.hop && g.went >= GRIND_HOP_DIST) return { end: 'stall' };
  if (inp.ollie) return { end: 'ollie' };
  if (g.s <= 0 || g.s >= line.length) {
    g.s = Math.max(0, Math.min(line.length, g.s));
    return { end: 'off' };
  }
  // Long grinds: the timing bar.
  if (g.timing) {
    stepTiming(g, dt, inp);
    if (g.timing.misses >= GRIND_TIMING.misses) return { end: 'bail' };
  }
  // Ease onto the line from where the board locked on.
  g.snapT += dt;
  const k = clamp01(g.snapT / GRIND_SNAP_TIME);
  const e = 1 - k * k * (3 - 2 * k);
  const { c, t } = seat(g, half);
  return { end: null, c: [c[0] + g.offset[0] * e, c[1] + g.offset[1] * e, c[2] + g.offset[2] * e], t, seat: c };
}

// The timing bar: the marker sweeps 0..1 and back, faster the longer the grind lasts; the green zone is the middle
// (narrower for a boardslide). Each pass through the green needs one tap: a tap in it = good (points), a tap
// outside it or a pass with no tap = a miss. A phone tap is judged against where the marker was GRIND_TIMING.latency
// s earlier (what you saw when you tapped: the tap takes that long to arrive). Sets g.timing.event = 'good' | 'miss'.
function stepTiming(g, dt, inp) {
  const T = GRIND_TIMING;
  const tm = g.timing;
  tm.event = null;
  tm.m += (tm.v * (1 + T.speedup * g.t) * dt) / T.sweep;
  if (tm.m > 1) (tm.m = 2 - tm.m), (tm.v = -1);
  if (tm.m < 0) (tm.m = -tm.m), (tm.v = 1);
  tm.hist.push(inp.now, tm.m);
  while (tm.hist.length > 2 && tm.hist[0] < inp.now - 500) tm.hist.splice(0, 2);
  const back = inp.now - (inp.live ? T.latency * 1000 : 0);
  let mj = tm.m;
  for (let i = tm.hist.length - 2; i >= 0; i -= 2) if (tm.hist[i] <= back) { mj = tm.hist[i + 1]; break; }
  tm.zw = T.zone[g.kind];
  const inZone = Math.abs(mj - 0.5) <= tm.zw;
  if (inp.tap) {
    if (inZone && !tm.tapped) (tm.tapped = true), tm.hits++, (g.bonus += T.points), (tm.event = 'good');
    else if (!inZone) tm.misses++, (tm.event = 'miss');
  }
  if (tm.wasIn && !inZone) {
    if (!tm.tapped) tm.misses++, (tm.event = 'miss'); // went through the green without a tap
    tm.tapped = false;
  }
  tm.wasIn = inZone;
  if (tm.event) tm.flash = { kind: tm.event, at: inp.now };
}

export const grindName = (g) => (g.kind === 'boardslide' ? 'BOARDSLIDE' : '50-50');

// Scuff marks left on ledges and curbs (drawn by GrindLines.jsx as one instanced mesh, oldest replaced first).
// Each: { x, y, z, yaw, len }. Added once per grind, never per frame.
export const scuffs = { list: [], version: 0, max: 48 };
export function addScuff(line, s0, s1) {
  if (line.type === 'rail' || Math.abs(s1 - s0) < 0.3) return;
  const [lo, hi] = s0 < s1 ? [s0, s1] : [s1, s0];
  const inn = line.inner ?? [0, 0];
  for (let i = 0; i < line.pts.length - 1; i++) {
    const a = Math.max(lo, line.cum[i]), b = Math.min(hi, line.cum[i + 1]);
    if (b - a < 0.2) continue;
    const pa = at(line, a).p, pb = at(line, b).p;
    scuffs.list.push({
      // just above the top (authored edge lines sit up to 2 cm under the stone), a few cm in from the edge
      x: (pa[0] + pb[0]) / 2 + inn[0] * 0.04, y: (pa[1] + pb[1]) / 2 + 0.022, z: (pa[2] + pb[2]) / 2 + inn[1] * 0.04,
      yaw: Math.atan2(pb[0] - pa[0], pb[2] - pa[2]), len: b - a,
    });
  }
  while (scuffs.list.length > scuffs.max) scuffs.list.shift();
  scuffs.version++;
}

// --- Spatial lookup: each line goes into the grid cells (GRIND_NEAR wide) its segments pass through, once at load.
// During play only the lines in the cells around the skater are checked.
export function buildGrid(lines, cell = GRIND_NEAR) {
  const grid = new Map();
  for (const line of lines) {
    for (let i = 0; i < line.pts.length - 1; i++) {
      const a = line.pts[i], b = line.pts[i + 1];
      const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const z0 = Math.floor(Math.min(a[2], b[2]) / cell), z1 = Math.floor(Math.max(a[2], b[2]) / cell);
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const k = x * 65536 + z;
          if (!grid.has(k)) grid.set(k, []);
          const list = grid.get(k);
          if (list[list.length - 1] !== line) list.push(line);
        }
    }
  }
  return { cell, map: grid };
}
// The lines with a segment in the 3 x 3 cells around (x, z): everything within GRIND_NEAR (and a bit more).
const _near = [];
let _stamp = 0;
export function nearby(g, x, z) {
  const { cell, map } = g.grid;
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  _near.length = 0;
  _stamp++;
  for (let i = cx - 1; i <= cx + 1; i++)
    for (let k = cz - 1; k <= cz + 1; k++) {
      const list = map.get(i * 65536 + k);
      if (!list) continue;
      for (const line of list) if (line._seen !== _stamp) (line._seen = _stamp), _near.push(line);
    }
  return _near;
}
