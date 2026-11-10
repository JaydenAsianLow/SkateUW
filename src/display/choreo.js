// Off-board choreography: bails (by kind and severity), getting up, walking / running with the board in hand,
// stepping off (tail kick into the hand) and dropping back in.
//
// Everything is in "rider space" (see RiderModel.jsx): ground y = 0, board nose toward -Z, the rider standing on the
// board faces +X (toe side). Off the board the rider walks toward -Z (the travel direction).
//
// A pose is a plain object of joint targets that RiderModel turns into bone rotations:
//   hips            Hips joint position
//   up, front       pelvis frame: up = toward the head, front = belly direction (any orientation, even lying down)
//   bend, twist     forward curl of the spine (rad), chest yaw relative to the pelvis (rad, yawDir convention)
//   headPitch/Yaw   head nod (+ = chin down) and turn relative to the chest
//   hands[2]        wrist targets [left, right]; elbows[2] = direction each elbow points
//   ankles[2]       ankle targets [left, right]; knees[2] = direction each knee points
//   toes[2], soles[2]  foot direction and the foot's up (instep) direction
//   board           { p, q } board pose in rider space (p = model origin on the ground), or null = not ours
//   grip            { hand, local, w }: hand `hand` holds the board at board-local point `local` (w = 0..1)
//   root            [x, z] root motion: where the body (physics) should be, in rider space at the track's start
//
// A track is a list of timed keyframes; evalTrack() interpolates them and subtracts the root motion, so the
// physics body follows the rider around (no teleports) while the pose stays relative to it.

import { DECK_TOP } from './look.js';
import { clamp01, smooth } from './util.js';

export const ANK = 0.085; // ankle height of a flat foot (from the rig)
const STANCE_ANK = DECK_TOP + ANK;
const UP = [0, 1, 0];
const WALK_FACE = -Math.PI / 2; // off the board the rider faces the nose direction (-Z)

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const yd = (a) => [Math.cos(a), 0, Math.sin(a)]; // yaw angle -> horizontal direction (0 = +X, -π/2 = nose)
// Torso leaning `p` rad forward (+) / back (-) while facing `face`.
const tiltUp = (face, p) => [Math.cos(face) * Math.sin(p), Math.cos(p), Math.sin(face) * Math.sin(p)];
const tiltFront = (face, p) => [Math.cos(face) * Math.cos(p), -Math.sin(p), Math.sin(face) * Math.cos(p)];
const torso = (face, p) => ({ up: tiltUp(face, p), front: tiltFront(face, p) });

// Body frame from up / front: U up, F front, L the character's left.
function frame(up, front) {
  const U = norm(up);
  const d = dot(front, U);
  const F = norm([front[0] - U[0] * d, front[1] - U[1] * d, front[2] - U[2] * d]);
  return { U, F, L: cross(U, F) };
}
// Point at `l` left, `u` up, `f` forward of `h` in body frame `fr`.
const rel = (h, fr, l, u, f) => [0, 1, 2].map((i) => h[i] + fr.L[i] * l + fr.U[i] * u + fr.F[i] * f);
const at = (x, y, z) => [x, y, z];

// --- Board poses (quaternions as [x, y, z, w]).
const qAxis = (ax, ang) => {
  const s = Math.sin(ang / 2);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)];
};
export function qRotate(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
const boardPt = (b, local) => {
  const r = qRotate(b.q, local);
  return [b.p[0] + r[0], b.p[1] + r[1], b.p[2] + r[2]];
};
const FLAT = (z = 0) => ({ p: [0, 0, z], q: [0, 0, 0, 1] });
const NOSE_GRIP = [0, 0.15, -0.45]; // wrist wrapped over the nose
const EDGE_GRIP = [-0.17, 0.094, 0]; // wrist over the deck's edge at the middle (carry)
const TAIL_FOOT = [0, DECK_TOP + 0.02 + ANK, 0.33]; // ankle of a foot standing on the kicktail
// Carried at the left side: nose forward, deck on edge with the grip toward the leg, wheels out.
const CARRY_Q = qAxis([0, 0, 1], -Math.PI / 2);
const carryBoard = (wrist) => {
  const g = qRotate(CARRY_Q, EDGE_GRIP);
  return { p: [wrist[0] - g[0], wrist[1] - g[1], wrist[2] - g[2]], q: CARRY_Q };
};
// Tail pressed down: nose up `th` rad, pivoting on the back wheels and then on the tail tip.
function tailPress(th, z = 0) {
  const q = qAxis([1, 0, 0], th);
  const piv = [0, 0, z + 0.2];
  const r = qRotate(q, [0, 0, -0.2]);
  const p = [piv[0] + r[0], piv[1] + r[1], piv[2] + r[2]];
  const tip = qRotate(q, [0, 0.125, 0.4]);
  if (p[1] + tip[1] < 0) p[1] -= p[1] + tip[1];
  return { p, q };
}

// --- Base poses.
const P = (base, over) => ({ ...base, ...over });

// Riding stance (an approximation of RiderModel's skate pose, which is blended in/out at the ends of a track).
export const STANCE = {
  root: [0, 0],
  hips: [-0.045, 0.86, 0.045],
  ...torso(-0.25, 0.05),
  bend: 0.25,
  twist: -0.25,
  headPitch: 0.12,
  headYaw: -1.05,
  hands: [at(0.1, 0.8, -0.4), at(0.03, 0.8, 0.42)],
  elbows: [norm([-1, 0, -0.4]), norm([-1, 0, 0.4])],
  ankles: [at(-0.05, STANCE_ANK, -0.2), at(-0.05, STANCE_ANK, 0.25)],
  knees: [norm([0.93, 0, -0.36]), [1, 0, 0]],
  toes: [norm([0.9, 0, -0.43]), norm([0.99, 0, 0.15])],
  soles: [UP, UP],
  board: null,
  grip: null,
};
const CROUCH = P(STANCE, { hips: [-0.06, 0.74, 0.045], bend: 0.5 });

// Move every position in a pose by (dx, dz).
function shift(p, dx, dz) {
  const s = (v) => [v[0] + dx, v[1], v[2] + dz];
  return {
    ...p,
    root: [p.root[0] + dx, p.root[1] + dz],
    hips: s(p.hips),
    hands: p.hands.map(s),
    ankles: p.ankles.map(s),
    board: p.board && { p: s(p.board.p), q: p.board.q },
  };
}

// --- Walking / running: one gait blended by speed (idle -> walk -> run, no switch).
// A cycle (two steps) takes cycleTime(v); the run is a snappy 0.5 s loop (12 frames at 24 fps). The stride is
// speed x cycle time, so a planted foot moves back at exactly the ground speed and never slides. Below V0 the
// cadence slows too, so the steps shrink smoothly to standing still.
const runBlend = (v) => smooth(clamp01((v - 1.6) / 1.8)); // 0 walk .. 1 run
const cycleTime = (v) => 1.05 + (0.5 - 1.05) * runBlend(v);
const V0 = 0.6;
export const strideLength = (v) => {
  const a = Math.abs(v);
  return a >= V0 ? a * cycleTime(a) : V0 * cycleTime(V0) * Math.sqrt(a / V0);
};
export const walkRate = (v) => {
  const a = Math.abs(v);
  return a < 1e-4 ? 0 : a / strideLength(a); // cycles per second
};
const CARRY_WRIST = [0.32, 0.8, 0]; // right wrist holding the board at the side

// phase: 0..1 per cycle (left foot lands at 0); v: m/s (negative = backwards); turn: rad/s (lean into it, and turning
// on the spot still steps); carry: board in the right hand.
export function walkPose(phase, v, carry, turn = 0) {
  const sp = Math.abs(v);
  const run = runBlend(sp);
  const go = clamp01(sp / V0); // idle -> moving
  const L = strideLength(sp);
  const sf = 0.62 - 0.24 * run; // share of the cycle a foot is planted (walk: double support, run: flight)
  const liftH = (0.08 + 0.13 * run) * Math.max(go, clamp01(Math.abs(turn) / 2.5) * 0.6);
  // Each foot loops: plant (slides back under the body at ground speed, heel peels up at the end) -> push off ->
  // lift (early peak, the run kicks the heel up behind) -> swing forward -> reach -> plant.
  const legs = [phase, phase + 0.5].map((ph) => {
    const u = ((ph % 1) + 1) % 1;
    if (u < sf) {
      const a = u / sf;
      const peel = smooth(clamp01((a - 0.7) / 0.3)) * go; // heel comes up before push-off
      const strike = (1 - run) * go * 0.25 * (1 - clamp01(a / 0.12)); // walk: lands heel first, toes up
      return { f: (sf * L) / 2 - a * sf * L, y: 0.05 * peel, pitch: strike - 0.45 * peel };
    }
    const a = (u - sf) / (1 - sf);
    const reach = (1 - run) * go * 0.25 * smooth(clamp01((a - 0.7) / 0.3)); // toes come up to meet the ground
    return { f: -(sf * L) / 2 + smooth(a) * sf * L, y: liftH * Math.sin(Math.PI * a ** 0.7), pitch: reach - 0.35 * Math.sin(Math.PI * a) * go };
  });
  // Centre of gravity: over the planted foot side to side; lowest just after each landing, highest at push-off.
  const step = (((phase * 2) % 1) + 1) % 1;
  const bob = (0.014 + 0.03 * run) * go;
  const hips = [
    -Math.cos(Math.PI * 2 * (phase - sf / 2)) * 0.022 * (1 - 0.6 * run) * go,
    0.885 - 0.05 * run - 0.012 * go - Math.cos(Math.PI * 2 * (step - 0.1)) * bob,
    0,
  ];
  // Twist: the pelvis turns with the forward leg, the chest the other way; arms opposite the legs.
  const s = Math.cos(Math.PI * 2 * phase) * go; // +1 left leg forward
  const pelvisYaw = WALK_FACE + s * (0.1 + 0.08 * run);
  const chestYaw = WALK_FACE - s * (0.12 + 0.1 * run);
  const lean = 0.03 + 0.05 * go + 0.2 * run;
  const t = torso(pelvisYaw, lean);
  const side = Math.max(-0.22, Math.min(0.22, turn * sp * 0.06)); // lean into turns (turn > 0 = left = -X)
  t.up = norm([t.up[0] - side, t.up[1], t.up[2]]);
  // Free arm: swings in an arc (rises at both ends, more in front); running bends the elbow and pumps harder.
  const arm = (sgn, sw) => {
    const k = Math.sign(sw) * Math.abs(sw) ** 0.8;
    return [
      hips[0] + sgn * (0.21 - Math.max(0, k) * 0.06 * run),
      0.82 + 0.12 * run + k * k * (k > 0 ? 0.06 + 0.16 * run : 0.03),
      -k * (0.15 + 0.17 * run),
    ];
  };
  const left = arm(-1, -s);
  const right = carry ? [CARRY_WRIST[0] + hips[0] * 0.5, CARRY_WRIST[1] - bob * 0.5, 0.025 * s] : arm(1, s);
  const foot = (pitch, k) => ({ toe: norm([k ? 0.08 : -0.08, Math.sin(pitch), -Math.cos(pitch)]), sole: norm([0, Math.cos(pitch), Math.sin(pitch)]) });
  const feet = legs.map(({ pitch }, k) => foot(pitch, k));
  return {
    root: [0, 0],
    hips,
    ...t,
    bend: 0.04 + 0.12 * run,
    twist: chestYaw - pelvisYaw,
    headPitch: 0.1 - lean * 0.5,
    headYaw: s * 0.06,
    hands: [left, right],
    elbows: [norm([-0.35, -0.1 - 0.5 * run, 1]), carry ? norm([0.6, 0, 0.6]) : norm([0.35, -0.1 - 0.5 * run, 1])],
    ankles: legs.map(({ f, y }, k) => [hips[0] * 0.3 + (k ? 0.1 : -0.1), ANK + y, -f]),
    knees: [norm([-0.12, 0, -1]), norm([0.12, 0, -1])],
    toes: feet.map((f) => f.toe),
    soles: feet.map((f) => f.sole),
    board: carry ? carryBoard(right) : null,
    grip: carry ? { hand: 1, local: EDGE_GRIP, w: 1 } : null,
  };
}
const idle = (x, z, carry = false) => shift(walkPose(0, 0, carry), x, z);

// --- Interpolation.
function lerpPose(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (a == null || b == null) return t < 0.5 ? a : b;
  if (Array.isArray(a)) return a.map((x, i) => lerpPose(x, b[i], t));
  if (typeof a !== 'object') return t < 0.5 ? a : b;
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'q') {
      const s = dot(a.q, b.q) + a.q[3] * b.q[3] < 0 ? -1 : 1; // shortest way round
      const q = a.q.map((x, i) => x + (b.q[i] * s - x) * t);
      const l = Math.hypot(...q) || 1;
      out.q = q.map((x) => x / l);
    } else if (k === 'hand') out.hand = a.hand;
    else out[k] = lerpPose(a[k], b[k], t);
  }
  return out;
}

// keys: [[time, pose, ease?], ...]; ease 'lin' | 'in' | 'out' | default smoothstep.
const EASE = { lin: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t) };
function sample(track, t) {
  const ks = track.keys;
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 0; i < ks.length - 1; i++) {
    const [t0, a] = ks[i];
    const [t1, b, ease] = ks[i + 1];
    if (t < t1) return lerpPose(a, b, (EASE[ease] ?? smooth)((t - t0) / (t1 - t0)));
  }
  return ks[ks.length - 1][1];
}

export const rootAt = (track, t) => sample(track, Math.min(t, track.dur)).root;

// The pose at time t, relative to the root (what the rider should show with the body at root(t)).
export function evalTrack(track, t) {
  const p = sample(track, Math.min(t, track.dur));
  return finish(p);
}

// Attach the gripping hand to the board, then make everything relative to the root.
export function finish(p) {
  let hands = p.hands;
  if (p.grip && p.board && p.grip.w > 0) {
    hands = hands.slice();
    hands[p.grip.hand] = lerp3(hands[p.grip.hand], boardPt(p.board, p.grip.local), clamp01(p.grip.w));
  }
  return shift({ ...p, hands }, -p.root[0], -p.root[1]);
}

// Blend weight of the off-board pose (vs. the live skate pose) over a track.
export function trackWeight(track, t) {
  let w = 1;
  if (track.blendIn) w = Math.min(w, t / track.blendIn);
  if (track.blendOut) w = Math.min(w, (track.dur - t) / track.blendOut);
  return clamp01(w);
}

// --- Bails. severity 0 (slow) .. 1 (fast). Each ends standing at the track's last root.

// Manual: leaned too far back. The board shoots out forward; you land on your backside (fast: flat on your back,
// legs up), then sit up, roll forward onto your feet and stand.
function backFall(s) {
  const face = -1.15;
  const fw = yd(face);
  const lft = cross(UP, fw);
  const k0 = P(STANCE, { hips: [-0.03, 0.8, 0.2], ...torso(-0.25, -0.3), bend: -0.1 });

  const h1 = [0.0, 0.64, 0.3];
  const f1 = frame(tiltUp(-0.8, -0.55), tiltFront(-0.8, -0.55));
  const k1 = P(k0, {
    root: [0, 0.15],
    hips: h1,
    up: f1.U,
    front: f1.F,
    bend: 0.2,
    twist: -0.2,
    headPitch: -0.2,
    headYaw: -0.5,
    hands: [rel(h1, f1, 0.34, 0.45, 0.3), rel(h1, f1, -0.34, 0.45, 0.3)],
    elbows: [[0, -1, 0], [0, -1, 0]],
    ankles: [at(0.05, 0.3 + 0.12 * s, -0.36), at(0.1, 0.38 + 0.12 * s, -0.05)],
    knees: [norm([0.4, 0.6, -0.6]), norm([0.4, 0.6, -0.6])],
    toes: [norm([0.4, 0.5, -1]), norm([0.4, 0.5, -1])],
    soles: [norm([0, 1, 0.5]), norm([0, 1, 0.5])],
  });

  // Impact: butt on the ground, legs out toward the board, hands behind (fast: arms flung out, back hits too).
  const h2 = [0.03, 0.13, 0.36];
  const p2 = -0.6 - 0.6 * s;
  const f2 = frame(tiltUp(face, p2), tiltFront(face, p2));
  const legOut = (lat, lift) => [h2[0] + fw[0] * (0.64 + 0.1 * s) + lft[0] * lat, 0.09 + lift, h2[2] + fw[2] * (0.64 + 0.1 * s) + lft[2] * lat];
  const handBehind = (lat) => lerp3(
    [h2[0] - fw[0] * 0.24 + lft[0] * lat, 0.08, h2[2] - fw[2] * 0.24 + lft[2] * lat],
    [h2[0] - fw[0] * 0.5 + lft[0] * lat * 1.7, 0.07, h2[2] - fw[2] * 0.5 + lft[2] * lat * 1.7],
    s,
  );
  const legFeet = {
    knees: [norm([fw[0], 1, fw[2]]), norm([fw[0], 1, fw[2]])],
    toes: [norm([fw[0] * 0.5, 0.85, fw[2] * 0.5]), norm([fw[0] * 0.5, 0.85, fw[2] * 0.5])],
    soles: [norm([-fw[0], 0.5, -fw[2]]), norm([-fw[0], 0.5, -fw[2]])],
  };
  const k2 = {
    ...k1,
    root: [0.03, 0.36],
    hips: h2,
    up: f2.U,
    front: f2.F,
    bend: 0.25 - 0.25 * s,
    twist: 0,
    headPitch: 0.3 - 0.6 * s,
    headYaw: 0,
    hands: [handBehind(0.27), handBehind(-0.27)],
    elbows: [norm([-fw[0], 1, -fw[2]]), norm([-fw[0], 1, -fw[2]])],
    ankles: [legOut(0.11, 0.3 * s), legOut(-0.11, 0.36 * s)],
    ...legFeet,
  };
  // Settle: slow = sitting, leaning back on the hands; fast = flat on the back, legs come down.
  const p3 = -0.5 - 0.95 * s;
  const f3 = frame(tiltUp(face, p3), tiltFront(face, p3));
  const k3 = { ...k2, hips: [h2[0], 0.13 - 0.01 * s, h2[2]], up: f3.U, front: f3.F, bend: 0.25 - 0.3 * s, headPitch: 0.25 - 0.1 * s, ankles: [legOut(0.12, 0.06 * s), legOut(-0.1, 0.1 * s)] };
  const down = 0.35 + 0.8 * s;
  const k4 = { ...k3, headPitch: 0.35, ankles: [legOut(0.13, 0), legOut(-0.1, 0.02)] };

  // Getting up: sit up, feet in, rock forward into a crouch, stand.
  const fIn = (lat) => [h2[0] + fw[0] * 0.44 + lft[0] * lat, ANK, h2[2] + fw[2] * 0.44 + lft[2] * lat];
  const fs = frame(tiltUp(face, -0.2), tiltFront(face, -0.2));
  const g1 = {
    ...k4,
    up: fs.U,
    front: fs.F,
    bend: 0.35,
    headPitch: 0.25,
    hands: [[h2[0] - fw[0] * 0.08 + lft[0] * 0.27, 0.08, h2[2] - fw[2] * 0.08 + lft[2] * 0.27], [h2[0] - fw[0] * 0.08 - lft[0] * 0.27, 0.08, h2[2] - fw[2] * 0.08 - lft[2] * 0.27]],
    ankles: [fIn(0.14), fIn(-0.14)],
    knees: [norm([fw[0], 1.4, fw[2]]), norm([fw[0], 1.4, fw[2]])],
    toes: [fw, fw],
    soles: [UP, UP],
  };
  const E = [h2[0] + fw[0] * 0.4, h2[2] + fw[2] * 0.4];
  const hc = [E[0], 0.5, E[1] + 0.12];
  const fc = frame(tiltUp(WALK_FACE, 0.8), tiltFront(WALK_FACE, 0.8));
  const g2 = {
    ...g1,
    root: [E[0], (h2[2] + E[1]) / 2],
    hips: hc,
    up: fc.U,
    front: fc.F,
    bend: 0.3,
    headPitch: -0.3,
    hands: [rel(hc, fc, 0.14, 0.15, 0.36), rel(hc, fc, -0.14, 0.15, 0.36)],
    elbows: [norm([-0.6, 0, 1]), norm([0.6, 0, 1])],
    ankles: [at(E[0] - 0.13, ANK, E[1]), at(E[0] + 0.13, ANK, E[1] + 0.04)],
    knees: [norm([-0.25, 0, -1]), norm([0.25, 0, -1])],
    toes: [norm([-0.1, 0, -1]), norm([0.1, 0, -1])],
  };
  // Rock forward: chest over the knees, hands down ahead of the feet, hips come off the ground only once the
  // weight is over the feet (rising straight out of the sit looked like floating).
  const hr = [h2[0] + fw[0] * 0.28, 0.3, h2[2] + fw[2] * 0.28];
  const fr = frame(tiltUp(-1.35, 0.9), tiltFront(-1.35, 0.9));
  const handAhead = (lat) => [h2[0] + fw[0] * 0.68 + lft[0] * lat, 0.09, h2[2] + fw[2] * 0.68 + lft[2] * lat];
  const g15 = {
    ...g1,
    root: [hr[0], hr[2]],
    hips: hr,
    up: fr.U,
    front: fr.F,
    bend: 0.35,
    headPitch: -0.2,
    hands: [handAhead(0.3), handAhead(-0.3)],
    elbows: [norm([-fw[0], 0.3, -fw[2]]), norm([-fw[0], 0.3, -fw[2]])],
  };
  const t2 = 0.34;
  const t3 = 0.5;
  const tUp = t3 + down;
  const keys = [
    [0, k0],
    [0.14, k1, 'out'],
    [t2, k2, 'in'],
    [t3, k3, 'out'],
    [tUp, k4],
    [tUp + 0.45 + 0.25 * s, g1],
    [tUp + 0.85 + 0.25 * s, g15],
    [tUp + 1.2 + 0.25 * s, g2],
    [tUp + 1.7 + 0.25 * s, idle(E[0], E[1])],
  ];
  return { keys, dur: keys[keys.length - 1][0], blendIn: 0.1 };
}

// Slow trick bail: stumble off the toe side onto hands and knees, then get up.
function sideFall() {
  const k0 = CROUCH;
  const h1 = [0.22, 0.66, 0.0];
  const f1 = frame(tiltUp(-0.1, 0.55), tiltFront(-0.1, 0.55));
  const k1 = P(k0, {
    root: [0.15, 0],
    hips: h1,
    up: f1.U,
    front: f1.F,
    bend: 0.4,
    twist: 0,
    headPitch: -0.1,
    headYaw: -0.2,
    hands: [rel(h1, f1, 0.22, 0.2, 0.45), rel(h1, f1, -0.22, 0.2, 0.45)],
    elbows: [norm([-0.5, -1, 0]), norm([-0.5, -1, 0])],
    ankles: [at(0.34, ANK, -0.22), at(0.12, 0.26, 0.22)],
    knees: [norm([1, 0, -0.3]), norm([1, 0, 0.2])],
    toes: [norm([1, 0, -0.3]), norm([1, -0.3, 0.2])],
  });
  const h2 = [0.42, 0.45, -0.02];
  const f2 = frame(tiltUp(0, 1.25), tiltFront(0, 1.25));
  const k2 = {
    ...k1,
    root: [0.42, 0],
    hips: h2,
    up: f2.U,
    front: f2.F,
    bend: 0.25,
    headPitch: -0.45,
    headYaw: 0,
    hands: [at(0.92, 0.1, -0.2), at(0.92, 0.1, 0.18)],
    elbows: [norm([-1, 0, -0.5]), norm([-1, 0, 0.5])],
    ankles: [at(0.08, 0.1, -0.13), at(0.08, 0.1, 0.12)],
    knees: [norm([1, -0.4, 0]), norm([1, -0.4, 0])],
    toes: [norm([-1, -0.25, 0]), norm([-1, -0.25, 0])],
    soles: [[0, -1, 0], [0, -1, 0]],
  };
  const k3 = { ...k2, hips: [0.4, 0.44, -0.02], headPitch: 0.2 };
  // Up onto one knee, left foot planted forward, hand on the knee, then stand.
  const hk = [0.42, 0.52, 0.0];
  const fk = frame(tiltUp(-0.6, 0.35), tiltFront(-0.6, 0.35));
  const g1 = {
    ...k3,
    hips: hk,
    up: fk.U,
    front: fk.F,
    bend: 0.3,
    headPitch: 0.1,
    headYaw: -0.4,
    hands: [at(0.66, 0.5, -0.2), at(0.45, 0.42, 0.26)],
    elbows: [norm([-1, 0, 0]), norm([-0.3, 0, 1])],
    ankles: [at(0.68, ANK, -0.2), at(0.08, 0.1, 0.12)],
    knees: [norm([1, 0.3, -0.4]), norm([1, -0.4, 0])],
    toes: [norm(yd(-0.6)), norm([-1, -0.25, 0])],
    soles: [UP, [0, -1, 0]],
  };
  const E = [0.5, -0.08];
  const keys = [
    [0, k0],
    [0.16, k1, 'out'],
    [0.38, k2, 'in'],
    [0.85, k3],
    [1.25, g1],
    [1.8, idle(E[0], E[1])],
  ];
  return { keys, dur: 1.8, blendIn: 0.08 };
}

// Fast trick bail: thrown forward onto your left side, tumble (a full roll when really fast) and slide face down,
// then push up, crouch and stand.
function slam(s) {
  const roll = s > 0.72;
  const k0 = CROUCH;
  const h1 = [0.05, 0.62, -0.3];
  const f1 = frame([0.25, 0.75, -0.6], [1, 0, 0]);
  const k1 = P(k0, {
    root: [0.03, -0.3],
    hips: h1,
    up: f1.U,
    front: f1.F,
    bend: 0.3,
    twist: 0,
    headPitch: 0.2,
    headYaw: -0.3,
    hands: [rel(h1, f1, 0.35, 0.35, 0.25), rel(h1, f1, -0.2, 0.42, 0.35)],
    elbows: [norm([0, -1, 0.3]), norm([0, -1, 0.3])],
    ankles: [at(0.0, 0.34, -0.05), at(0.02, 0.42, 0.25)],
    knees: [[1, 0, 0], [1, 0, 0]],
    toes: [norm([1, -0.3, 0]), norm([1, -0.3, 0])],
  });
  // Lying along the travel direction, head first; the frame decides which side is down.
  const lying = (h, front, hands, legs) => {
    const fr = frame([0, 0.04, -1], front);
    return {
      hips: h,
      up: fr.U,
      front: fr.F,
      bend: 0.15,
      twist: 0,
      headPitch: 0,
      headYaw: 0,
      hands: hands(fr),
      ankles: legs(fr),
      knees: [fr.F, fr.F],
      toes: [fr.F, fr.F],
      soles: [fr.U, fr.U],
    };
  };
  const z2 = -0.48;
  const k2 = {
    ...k1,
    root: [0.05, z2],
    ...lying([0.05, 0.15, z2], [1, 0.15, 0], (fr) => [rel([0.05, 0.15, z2], fr, 0.06, 0.72, 0.05), rel([0.05, 0.15, z2], fr, 0.08, 0.32, 0.3)], (fr) => [rel([0.05, 0.15, z2], fr, 0.06, -0.76, 0.06), rel([0.05, 0.15, z2], fr, -0.1, -0.74, 0.14)]),
    elbows: [norm([0, 0, 1]), norm([0, 1, 0])],
  };
  const z3 = -0.64;
  const k3 = {
    ...k2,
    root: [0.05, z3],
    ...lying([0.05, 0.13, z3], [0, 1, 0], (fr) => [rel([0.05, 0.13, z3], fr, 0.5, 0.25, -0.02), rel([0.05, 0.13, z3], fr, -0.5, 0.25, -0.02)], (fr) => [rel([0.05, 0.13, z3], fr, 0.13, -0.74, 0.12), rel([0.05, 0.13, z3], fr, -0.13, -0.74, 0.18)]),
    elbows: [[0, 0, 1], [0, 0, 1]],
  };
  const z4 = -0.78;
  const k4 = {
    ...k3,
    root: [0.05, z4],
    ...lying([0.05, 0.15, z4], [-1, 0.15, 0], (fr) => [rel([0.05, 0.15, z4], fr, -0.08, 0.32, 0.3), rel([0.05, 0.15, z4], fr, -0.06, 0.72, 0.05)], (fr) => [rel([0.05, 0.15, z4], fr, 0.1, -0.74, 0.14), rel([0.05, 0.15, z4], fr, -0.06, -0.76, 0.06)]),
    elbows: [norm([0, 1, 0]), norm([0, 0, 1])],
  };
  const z5 = roll ? -0.92 : -0.66;
  const h5 = [0.05, 0.15, z5];
  const fr5 = frame([0, 0.04, -1], [0, -1, 0]);
  const k5 = {
    ...k4,
    root: [0.05, z5],
    hips: h5,
    up: fr5.U,
    front: fr5.F,
    bend: 0.1,
    twist: 0,
    headPitch: -0.35,
    headYaw: 0,
    hands: [rel(h5, fr5, 0.25, 0.34, 0.07), rel(h5, fr5, -0.25, 0.34, 0.07)],
    elbows: [norm([-0.6, 0.6, 0.3]), norm([0.6, 0.6, 0.3])],
    ankles: [rel(h5, fr5, 0.11, -0.78, 0.04), rel(h5, fr5, -0.11, -0.78, 0.04)],
    knees: [fr5.F, fr5.F],
    toes: [norm([0, -0.3, 1]), norm([0, -0.3, 1])],
    soles: [[0, -1, 0], [0, -1, 0]],
  };
  const down = 0.4 + 0.5 * s;
  const k6 = { ...k5, headPitch: -0.1 };
  // Push up (chest up, knees down), crouch with the feet under you, stand.
  const hp = [0.05, 0.36, z5 + 0.06];
  const fp = frame([0, 0.6, -0.8], [0, -0.8, -0.6]);
  const g1 = {
    ...k6,
    hips: hp,
    up: fp.U,
    front: fp.F,
    bend: 0.25,
    headPitch: -0.3,
    ankles: [at(-0.06, 0.1, z5 + 0.72), at(0.16, 0.1, z5 + 0.72)],
    knees: [[0, -1, -0.3], [0, -1, -0.3]],
  };
  // All fours: hips back over the knees (the shins stay where they are), hands planted.
  const h4 = [0.05, 0.46, z5 + 0.3];
  const f4 = frame(tiltUp(WALK_FACE, 1.15), tiltFront(WALK_FACE, 1.15));
  const g2 = {
    ...g1,
    root: [0.05, z5 + 0.2],
    hips: h4,
    up: f4.U,
    front: f4.F,
    bend: 0.3,
    headPitch: -0.4,
    hands: [at(-0.17, 0.1, z5 - 0.22), at(0.27, 0.1, z5 - 0.22)],
    elbows: [norm([-0.3, 0.2, 1]), norm([0.3, 0.2, 1])],
    knees: [norm([0, -1, -0.5]), norm([0, -1, -0.5])],
  };
  // Lunge: left foot planted under the chest, right knee still down, hand on the knee.
  const hl = [0.05, 0.5, z5 + 0.38];
  const fl = frame(tiltUp(WALK_FACE, 0.55), tiltFront(WALK_FACE, 0.55));
  const lf = at(-0.07, ANK, z5 + 0.12);
  const g3 = {
    ...g2,
    root: [0.05, z5 + 0.25],
    hips: hl,
    up: fl.U,
    front: fl.F,
    bend: 0.25,
    headPitch: 0,
    hands: [at(-0.09, 0.5, z5 + 0.14), at(0.27, 0.42, z5 + 0.36)],
    elbows: [norm([-0.6, 0, 1]), norm([0.4, 0, 1])],
    ankles: [lf, at(0.16, 0.1, z5 + 0.72)],
    knees: [norm([-0.1, 0.4, -1]), norm([0, -1, -0.5])],
    toes: [norm([-0.1, 0, -1]), norm([0, -0.25, 1])],
    soles: [UP, [0, -1, 0]],
  };
  // Push up off the front foot, swinging the back foot through.
  const E = [0.05, z5 + 0.16];
  const g4 = {
    ...g3,
    root: [0.05, z5 + 0.2],
    hips: [0.05, 0.74, z5 + 0.2],
    ...torso(WALK_FACE, 0.3),
    bend: 0.15,
    hands: [at(-0.2, 0.7, z5 + 0.12), at(0.24, 0.72, z5 + 0.26)],
    ankles: [lf, at(0.12, 0.26, z5 + 0.38)],
    knees: [norm([-0.1, 0, -1]), norm([0.1, 0.3, -1])],
    toes: [norm([-0.1, 0, -1]), norm([0.1, -0.4, -1])],
    soles: [UP, UP],
  };
  const keys = [[0, k0], [0.12, k1, 'out'], [0.26, k2, 'in']];
  let t = 0.26;
  if (roll) keys.push([(t += 0.14), k3, 'lin'], [(t += 0.14), k4, 'lin']);
  keys.push([(t += roll ? 0.14 : 0.18), k5, roll ? 'out' : undefined]);
  keys.push([(t += down), k6], [(t += 0.4), g1], [(t += 0.4), g2], [(t += 0.35), g3], [(t += 0.3), g4, 'out'], [(t += 0.3), idle(E[0], E[1])]);
  return { keys, dur: t, blendIn: 0.08 };
}

// kind: 'back' (manual, too far back) | 'side' (slow trick bail) | 'slam' (fast trick bail)
export function bailTrack(kind, severity) {
  const s = clamp01(severity);
  if (kind === 'back') return backFall(s);
  if (kind === 'slam') return slam(s);
  return sideFall();
}

// --- Get off: the front foot steps down on the heel side, the back foot stamps the tail so the nose pops up beside
// you, the right hand catches it and swings it down to the side (deck vertical). About 0.6 s. Board starts flat under
// the rider; you end up standing on the heel side holding it.
export function dismountTrack() {
  const g0 = { hand: 1, local: NOSE_GRIP, w: 0 };
  const d0 = P(STANCE, { board: FLAT(), grip: g0 });
  const d1 = P(d0, {
    root: [-0.08, 0],
    hips: [-0.1, 0.84, 0.0],
    ...torso(-0.8, 0.05),
    twist: -0.1,
    headYaw: -0.6,
    ankles: [at(-0.24, 0.3, -0.16), d0.ankles[1]],
    knees: [norm([0.3, 0, -1]), d0.knees[1]],
    toes: [norm(yd(-1.3)), d0.toes[1]],
  });
  const flat = FLAT();
  const d2 = P(d1, {
    root: [-0.22, 0.03],
    hips: [-0.25, 0.82, 0.04],
    ...torso(-1.3, 0.1),
    twist: 0,
    headYaw: 0.2,
    headPitch: 0.3,
    ankles: [at(-0.4, ANK, -0.05), boardPt(flat, TAIL_FOOT)],
    knees: [norm([-0.1, 0, -1]), norm([0.4, 0, -1])],
    toes: [norm(yd(-1.6)), norm([0.2, 0, -1])],
  });
  const up = tailPress(1.28);
  const tail = boardPt(up, TAIL_FOOT);
  const d3 = P(d2, {
    root: [-0.28, 0.06],
    hips: [-0.28, 0.76, 0.08],
    ...torso(WALK_FACE, 0.25),
    bend: 0.3,
    headPitch: 0.35,
    headYaw: 0.3,
    hands: [at(-0.5, 0.82, 0.0), at(-0.02, 0.75, 0.14)],
    ankles: [d2.ankles[0], [tail[0] - 0.02, Math.max(ANK, tail[1]), tail[2] - 0.03]],
    toes: [d2.toes[0], norm([0.15, -0.6, -1])],
    board: up,
    grip: { ...g0, w: 0.85 },
  });
  const d4 = P(d3, { grip: { ...g0, w: 1 } });
  const E = [-0.3, 0.05];
  const end = idle(E[0], E[1], true);
  const keys = [
    [0, d0],
    [0.1, d1, 'out'],
    [0.22, d2, 'in'],
    [0.34, d3, 'in'],
    [0.39, d4],
    [0.6, end],
  ];
  return { keys, dur: 0.6, blendIn: 0.1 };
}

// --- Picking the board up off the ground (walked within ~1 m of it after a bail): step to it, squat, grab the near
// edge with the right hand, stand up with it at the side. start: the walk pose now; b: the board in rider space
// { x, y, z, yaw } (yaw relative to the rider, nose = -Z at 0). timing: { dur, grab } to follow a mocap pick-up clip.
export function pickupTrack(start, b, timing = { dur: 0.6, grab: 0.26 }) {
  // The board looks the same both ways round: turn it so its local -X edge is the one nearest the rider.
  const R = [b.x - 0.2, b.z + 0.24]; // stand here: board under the right shoulder, a little ahead
  let yaw = b.yaw;
  const toRider = [R[0] - b.x, R[1] - b.z];
  const lx = Math.cos(yaw) * toRider[0] - Math.sin(yaw) * toRider[1]; // rider direction in board-local X
  if (lx > 0) yaw += Math.PI;
  const board0 = { p: [b.x, b.y, b.z], q: qAxis([0, 1, 0], yaw) };
  const g = { hand: 1, local: [-0.14, 0.22, 0], w: 0 };
  const k0 = { ...start, board: board0, grip: g };
  const hc = [R[0], 0.47, R[1] + 0.1];
  const fc = frame(tiltUp(WALK_FACE, 0.95), tiltFront(WALK_FACE, 0.95));
  const k1 = {
    ...k0,
    root: R,
    hips: hc,
    up: fc.U,
    front: fc.F,
    bend: 0.45,
    twist: 0.1,
    headPitch: 0.2,
    headYaw: 0.2,
    hands: [at(R[0] - 0.14, 0.46, R[1] - 0.18), start.hands[1]],
    elbows: [norm([-0.6, 0, 1]), norm([0.5, 0.3, 0.6])],
    ankles: [at(R[0] - 0.13, ANK, R[1] + 0.02), at(R[0] + 0.13, ANK, R[1] + 0.12)],
    knees: [norm([-0.3, 0, -1]), norm([0.3, 0, -1])],
    toes: [norm([-0.15, 0, -1]), norm([0.15, 0, -1])],
    soles: [UP, UP],
    grip: { ...g, w: 1 },
  };
  const end = idle(R[0], R[1], true);
  const k2 = {
    ...lerpPose(k1, end, 0.5),
    board: { p: lerp3(board0.p, end.board.p, 0.5), q: lerpPose(board0, end.board, 0.5).q },
    grip: { hand: 1, local: lerp3(g.local, EDGE_GRIP, 0.5), w: 1 },
  };
  const { dur } = timing;
  const grab = Math.min(dur * 0.8, Math.max(dur * 0.2, timing.grab));
  const keys = [
    [0, k0],
    [grab, k1, 'out'],
    [grab + (dur - grab) * 0.45, k2, 'in'],
    [dur, end, 'out'],
  ];
  return { keys, dur, blendIn: 0 };
}

// --- On the move. Turn a whole pose half round (riding fakie: the rider's stance faces the other way).
function rotY180(p) {
  const r = (v) => [-v[0], v[1], -v[2]];
  return {
    ...p,
    hips: r(p.hips),
    up: r(p.up),
    front: r(p.front),
    hands: p.hands.map(r),
    elbows: p.elbows.map(r),
    ankles: p.ankles.map(r),
    knees: p.knees.map(r),
    toes: p.toes.map(r),
    soles: p.soles.map(r),
    board: p.board && { p: r(p.board.p), q: [p.board.q[2], p.board.q[3], -p.board.q[0], -p.board.q[1]] }, // (0,1,0,0) * q
  };
}

// Hop off while rolling: spring off the board, swing round to face forward, pop the board up into the right hand
// and land running (left foot first, phase 0 of the run, so the run carries straight on). v: landing speed (m/s).
// fakie: you were riding fakie, so the start is the stance turned half round. About 0.36 s.
export function runDismountTrack(v, fakie) {
  const g = { hand: 1, local: NOSE_GRIP, w: 0 };
  const start = fakie ? rotY180(STANCE) : STANCE;
  const d0 = { ...start, board: FLAT(), grip: g };
  const pop = { p: [0.12, 0.22, 0.05], q: qAxis([1, 0, 0], 1.1) };
  const d1 = {
    ...d0,
    hips: [0.0, 1.0, -0.05],
    ...torso(fakie ? -2.25 : -0.9, 0.15), // turning to face forward (-Z) from either stance
    bend: 0.25,
    twist: 0,
    headYaw: 0,
    headPitch: 0.1,
    hands: [at(-0.3, 1.0, -0.1), at(0.15, 0.75, 0.0)],
    elbows: [norm([-0.6, -0.5, 0.6]), norm([0.6, 0, 0.6])],
    ankles: [at(-0.08, 0.42, -0.15), at(0.06, 0.48, 0.18)],
    knees: [norm([0.2, 0.3, -1]), norm([0.2, 0.3, -1])],
    toes: [norm([0, -0.4, -1]), norm([0, -0.4, -1])],
    soles: [UP, UP],
    board: pop,
    grip: { ...g, w: 0.6 },
  };
  const end = walkPose(0, v, true);
  const d2 = { ...lerpPose(d1, end, 0.5), board: { p: lerp3(pop.p, end.board.p, 0.5), q: lerpPose(pop, end.board, 0.5).q }, grip: { hand: 1, local: lerp3(NOSE_GRIP, EDGE_GRIP, 0.5), w: 1 } };
  const keys = [
    [0, d0],
    [0.12, d1, 'out'],
    [0.24, d2],
    [0.36, end, 'in'],
  ];
  return { keys, dur: 0.36, blendIn: 0.06 };
}

// Jump on while running: toss the board down just ahead, jump, land on it in the riding stance. start: the run pose
// now (board in the right hand). About 0.42 s; the body keeps its speed.
export const RUN_GAP = 0.35;
export function runMountTrack(start) {
  const B = -RUN_GAP;
  const g = { hand: 1, local: EDGE_GRIP, w: 1 };
  const m0 = { ...start, grip: start.grip ?? g };
  const m1 = {
    ...m0,
    hips: [0, 0.8, 0.02],
    ...torso(WALK_FACE, 0.3),
    bend: 0.2,
    twist: 0,
    headPitch: 0.4,
    hands: [at(-0.25, 0.95, -0.2), at(0.2, 0.42, -0.25)],
    ankles: [at(-0.1, ANK, 0.02), at(0.1, 0.3, 0.3)],
    knees: [norm([-0.1, 0, -1]), norm([0.1, 0, -1])],
    toes: [norm([-0.08, 0, -1]), norm([0.08, -0.4, -1])],
    soles: [UP, UP],
    board: { p: [0.08, 0.14, B + 0.1], q: lerpPose({ q: CARRY_Q }, { q: [0, 0, 0, 1] }, 0.8).q },
    grip: { ...g, w: 0 },
  };
  const m2 = {
    ...m1,
    root: [0, B * 0.5],
    hips: [-0.02, 1.02, B * 0.6],
    ...torso(-1.0, 0.1),
    twist: -0.2,
    headYaw: -0.5,
    headPitch: 0.3,
    hands: [at(-0.2, 1.05, B - 0.3), at(0.15, 1.0, B + 0.35)],
    elbows: STANCE.elbows,
    ankles: [at(-0.05, 0.42, B - 0.2), at(-0.02, 0.45, B + 0.22)],
    knees: [norm([0.6, 0.3, -1]), norm([0.8, 0.3, -0.4])],
    toes: [norm(yd(-0.6)), norm(yd(-0.1))],
    board: FLAT(B),
  };
  const land = { ...shift(CROUCH, 0, B), board: FLAT(B), grip: { ...g, w: 0 } };
  const m4 = { ...shift(STANCE, 0, B), board: FLAT(B), grip: { ...g, w: 0 } };
  const keys = [
    [0, m0],
    [0.1, m1, 'out'],
    [0.22, m2, 'out'],
    [0.32, land, 'in'],
    [0.46, m4],
  ];
  return { keys, dur: 0.46, blendOut: 0.12 };
}

// --- Dropping back in. start: the walk pose at this moment (at the origin). carry: drop the board from the hand
// first; otherwise the board is already on the ground 0.55 m ahead. Ends in the riding stance on the board, with
// the body (root) moved onto it.
export const MOUNT_GAP = 0.55;
export function mountTrack(start, carry) {
  const B = -MOUNT_GAP;
  const board0 = FLAT(B);
  const g = { hand: 1, local: EDGE_GRIP, w: carry ? 1 : 0 };
  const m0 = { ...start, board: start.board ?? board0, grip: start.grip ?? { ...g, w: 0 } };
  const lower = {
    p: [0.17, 0.26, -0.32],
    q: lerpPose({ q: CARRY_Q }, { q: [0, 0, 0, 1] }, 0.45).q,
  };
  const m1 = P(m0, {
    hips: [0, 0.8, -0.08],
    ...torso(WALK_FACE, 0.3),
    bend: 0.25,
    headPitch: 0.45,
    hands: [at(-0.22, 0.8, -0.05), m0.hands[1]],
    ankles: [at(-0.1, ANK, -0.22), at(0.1, ANK, 0.12)],
    toes: [norm([-0.08, 0, -1]), norm([0.08, 0, -1])],
    soles: [UP, UP],
    board: lower,
    grip: { ...g, w: 1 },
  });
  const m2 = P(m1, { board: { p: [0, 0.05, B], q: [0, 0, 0, 1] }, grip: { ...g, w: 0 }, hands: [m1.hands[0], at(0.12, 0.5, -0.3)] });
  const m3 = P(m2, {
    root: [0, -0.1],
    hips: [0, 0.82, -0.2],
    ...torso(WALK_FACE, 0.18),
    hands: [at(-0.24, 0.78, -0.25), at(0.22, 0.8, -0.1)],
    ankles: [at(-0.06, 0.3, -0.5), at(0.1, ANK, 0.12)],
    board: board0,
  });
  const m4 = P(m3, {
    root: [0, -0.3],
    hips: [0.0, 0.84, -0.45],
    ...torso(-1.0, 0.1),
    twist: -0.2,
    headYaw: -0.55,
    headPitch: 0.2,
    hands: [at(-0.1, 0.8, -0.75), at(0.15, 0.82, -0.15)],
    elbows: STANCE.elbows,
    ankles: [at(-0.05, STANCE_ANK, B - 0.2), at(0.1, ANK, 0.0)],
    knees: [norm([0.6, 0, -1]), norm([0.4, 0, -1])],
    toes: [norm(yd(-0.8)), norm([0.1, 0, -1])],
  });
  const m5 = P(m4, {
    root: [0, -0.45],
    hips: [-0.02, 0.84, B + 0.02],
    ...torso(-0.5, 0.06),
    twist: -0.25,
    headYaw: -0.9,
    ankles: [at(-0.05, STANCE_ANK, B - 0.2), at(0.06, 0.32, B + 0.35)],
    knees: [STANCE.knees[0], norm([1, 0, -0.3])],
    toes: [STANCE.toes[0], norm(yd(-0.2))],
  });
  const m6 = { ...shift(STANCE, 0, B), board: board0, grip: { ...g, w: 0 } };
  const keys = carry
    ? [[0, m0], [0.16, m1], [0.28, m2, 'in'], [0.36, m3], [0.48, m4], [0.58, m5, 'out'], [0.7, m6, 'in']]
    : [[0, m0], [0.12, m3], [0.24, m4], [0.34, m5, 'out'], [0.46, m6, 'in']];
  const dur = keys[keys.length - 1][0];
  return { keys, dur, blendOut: 0.12 };
}
