// Grinding: following a grind line (lines.js) with the board locked to it. Pure logic; Skateboard.jsx applies the
// result to the physics body and the board / rider visuals.
//
// One set of rules for every surface (rail, ledge, curb):
//  - Lock on from the air (an ollie, or rolling off something) when the board is close to a line (GRIND_SNAP) and
//    travelling roughly along it (GRIND_MAX_ANGLE). It eases onto the line over GRIND_SNAP_TIME.
//  - The trick is picked in the first GRIND_WINDOW seconds: no gesture = 50-50, a half circle = boardslide,
//    a half circle started but not finished = bail.
//  - Short lines (< GRIND_LONG) ride to the end by themselves. Long ones need balancing (tilt the phone) and get the
//    side camera.
//  - At the end you pop off and land rolling; an ollie gets you out early.
import { clamp01 } from '../util.js';
import {
  GRAVITY, GRIND_BALANCE, GRIND_BOARDSLIDE_DRAG, GRIND_DRAG, GRIND_DROP_IN, GRIND_MAX_ANGLE, GRIND_MAX_SPEED,
  GRIND_MIN_ENTRY, GRIND_MIN_SPEED, GRIND_PRE, GRIND_REACH, GRIND_SLOPE, GRIND_SNAP, GRIND_SNAP_TIME, GRIND_WINDOW,
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
  const cosMax = Math.cos((GRIND_MAX_ANGLE * Math.PI) / 180);
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
    const c = (ux * t[0] + uz * t[2]) / th;
    if (Math.abs(c) < cosMax) continue;
    const dir = c > 0 ? 1 : -1;
    const left = dir > 0 ? line.length - n.s : n.s;
    if (left < 0.4) continue;
    const along = sp * Math.abs(c);
    if (along < GRIND_MIN_ENTRY) continue;
    const score = n.d + Math.abs(dy) * 0.5;
    if (!best || score < best.score) best = { line, s: n.s, dir, along, score };
  }
  return best;
}

// Where the board's centre goes on the line. half = the board collider's half height.
export function seat(g, half) {
  const { p, t } = at(g.line, g.s);
  const line = g.line;
  const lift = half + (line.type === 'rail' ? 0.035 : 0.012);
  let x = p[0], z = p[2];
  // Ledge / curb 50-50: the trucks ride the edge with the board over the top.
  if (g.kind === '5050' && line.inner) (x += line.inner[0] * 0.07), (z += line.inner[1] * 0.07);
  return { c: [x, p[1] + lift, z], t };
}

export function startGrind(hit, center, half, now) {
  const g = { line: hit.line, s: hit.s, dir: hit.dir, speed: hit.along, t: 0, kind: '5050', decided: false, lockAt: now, snapT: 0, bal: null, slideSign: 1 };
  const { c } = seat(g, half);
  g.offset = [center[0] - c[0], center[1] - c[1], center[2] - c[2]];
  return g;
}

// One frame of grinding. inp = { now, arcAt, arcDir, partialAt, steer, live, ollie }.
// Returns { end } (null while it carries on: 'off' end of the line, 'ollie' popped out, 'stall' too slow, 'bail'),
// plus the board centre { c } and travel tangent { t } (unit, including the slope) to put it on.
export function stepGrind(g, dt, inp, half) {
  g.t += dt;
  const line = g.line;
  // Trick choice in the window.
  if (!g.decided) {
    const since = g.lockAt - GRIND_PRE * 1000;
    if (inp.arcAt >= since) {
      g.kind = 'boardslide';
      g.slideSign = inp.arcDir < 0 ? -1 : 1;
      g.decided = true;
      g.changed = true;
    } else if (inp.partialAt >= since) {
      return { end: 'bail' };
    } else if (g.t >= GRIND_WINDOW) g.decided = true;
  }
  // Speed: surface drag, and gravity along the slope.
  const here = at(line, g.s);
  const down = -here.t[1] * g.dir; // sine of the slope, + going downhill
  g.speed += GRAVITY * GRIND_SLOPE * down * dt;
  g.speed *= 1 - GRIND_DRAG[line.type] * (g.kind === 'boardslide' ? GRIND_BOARDSLIDE_DRAG : 1) * dt;
  g.speed = Math.min(GRIND_MAX_SPEED, g.speed);
  if (g.speed < GRIND_MIN_SPEED) return { end: 'stall' };
  g.s += g.dir * g.speed * dt;
  if (inp.ollie) return { end: 'ollie' };
  if (g.s <= 0 || g.s >= line.length) {
    g.s = Math.max(0, Math.min(line.length, g.s));
    return { end: 'off' };
  }
  // Long lines: balance. The green zone drifts; tilting the phone moves the marker (keyboard: it balances itself).
  if (line.long) {
    const diff = GRIND_BALANCE[g.kind];
    if (!g.bal) g.bal = { t: 0, out: 0, ph: [0, 1, 2, 3].map(() => Math.random() * 6.28) };
    const b = g.bal;
    b.t += dt * diff.drift;
    const wave = (f1, p1, f2, p2) => 0.6 * Math.sin(f1 * b.t + p1) + 0.4 * Math.sin(f2 * b.t + p2);
    b.centre = 0.5 + diff.swing * (wave(1, b.ph[0], 2.3, b.ph[1]) - wave(0, b.ph[0], 0, b.ph[1]));
    let marker = inp.live ? 0.5 + inp.steer * 0.5 : b.centre;
    marker = clamp01(marker + diff.sway * wave(1.7, b.ph[2], 3.1, b.ph[3]));
    const off = marker - b.centre;
    b.out = Math.abs(off) > diff.zone ? b.out + dt : 0;
    if (b.out >= diff.tolerance || marker <= 0.02 || marker >= 0.98) return { end: 'bail' };
    b.marker = marker;
    b.zone = { c: b.centre, w: diff.zone, out: b.out / diff.tolerance };
    b.balance = clamp01(0.5 + off / (2 * diff.zone));
  }
  // Ease onto the line from where the board locked on.
  g.snapT += dt;
  const k = clamp01(g.snapT / GRIND_SNAP_TIME);
  const e = 1 - k * k * (3 - 2 * k);
  const { c, t } = seat(g, half);
  return { end: null, c: [c[0] + g.offset[0] * e, c[1] + g.offset[1] * e, c[2] + g.offset[2] * e], t };
}

export const grindName = (g) => (g.kind === 'boardslide' ? 'BOARDSLIDE' : '50-50');
