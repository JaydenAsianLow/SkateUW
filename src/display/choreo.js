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

export const ANK = 0.085; // ankle height of a flat foot (from the rig)
const STANCE_ANK = DECK_TOP + ANK;
const UP = [0, 1, 0];
const WALK_FACE = -Math.PI / 2; // off the board the rider faces the nose direction (-Z)

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);
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

// --- Walking / running (procedural). phase: 0..1 per stride (two steps); v: m/s (negative = backwards);
// turn: rad/s, so turning on the spot still takes small steps. carry: board in the left hand.
export const strideLength = (v) => 0.9 + 0.35 * Math.abs(v);
export function walkPose(phase, v, carry, turn = 0) {
  const sp = Math.abs(v);
  const run = clamp01((sp - 2) / 1.6);
  const amp = clamp01(Math.max(sp / 0.9, Math.abs(turn) * 0.45));
  const L = strideLength(sp) * amp;
  const sf = 0.6 - 0.22 * run; // share of the stride a foot is on the ground
  const legs = [phase, phase + 0.5].map((ph) => {
    const u = ((ph % 1) + 1) % 1;
    if (u < sf) return { f: (sf * L) / 2 - (u / sf) * sf * L, lift: 0 }; // planted: slides back under the body
    const a = (u - sf) / (1 - sf);
    return { f: -(sf * L) / 2 + smooth(a) * sf * L, lift: Math.sin(Math.PI * a) * (0.07 + 0.16 * run) * amp };
  });
  const swing = legs[0].f / ((sf * strideLength(sp)) / 2 || 1); // -1..1, left leg forward = +1
  const bob = Math.cos(phase * Math.PI * 4) * (0.016 + 0.03 * run) * amp;
  const hips = [Math.sin(phase * Math.PI * 2) * 0.018 * amp * (1 - run), 0.88 - 0.05 * run - bob, 0];
  const lean = 0.03 + 0.05 * amp + 0.22 * run;
  const pelvisYaw = WALK_FACE + swing * 0.1 * amp;
  const t = torso(pelvisYaw, lean);
  const arm = (side, s) => [hips[0] + side * 0.21, 0.82 + 0.17 * run + Math.abs(s) * 0.03, -s * (0.12 + 0.22 * run) * amp];
  const right = arm(1, swing); // the right arm swings with the left leg
  const left = carry ? [-0.27, 0.8 - bob * 0.5, 0.03 * swing * amp] : arm(-1, -swing);
  return {
    root: [0, 0],
    hips,
    ...t,
    bend: 0.04 + 0.12 * run,
    twist: -swing * 0.2 * amp,
    headPitch: 0.1 - lean * 0.5,
    headYaw: swing * 0.08 * amp,
    hands: [left, right],
    elbows: [norm([-0.4, -0.1 - 0.4 * run, 1]), norm([0.4, -0.1 - 0.4 * run, 1])],
    ankles: legs.map(({ f, lift }, k) => [hips[0] * 0.3 + (k ? 0.1 : -0.1), ANK + lift, -f]),
    knees: [norm([-0.12, 0, -1]), norm([0.12, 0, -1])],
    toes: legs.map(({ lift }, k) => norm([k ? 0.08 : -0.08, -lift * 2.5, -1])),
    soles: legs.map(({ lift }) => norm([0, 1, -lift * 2.5])),
    board: carry ? carryBoard(left) : null,
    grip: carry ? { hand: 0, local: EDGE_GRIP, w: 1 } : null,
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
    [tUp + 0.95 + 0.25 * s, g2],
    [tUp + 1.45 + 0.25 * s, idle(E[0], E[1])],
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
  const E = [0.05, z5 + 0.12];
  const hc = [E[0], 0.5, E[1] + 0.1];
  const fc = frame(tiltUp(WALK_FACE, 0.9), tiltFront(WALK_FACE, 0.9));
  const g2 = {
    ...g1,
    root: [E[0], E[1]],
    hips: hc,
    up: fc.U,
    front: fc.F,
    bend: 0.3,
    headPitch: -0.35,
    hands: [rel(hc, fc, 0.15, 0.12, 0.38), rel(hc, fc, -0.15, 0.12, 0.38)],
    elbows: [norm([-0.6, 0, 1]), norm([0.6, 0, 1])],
    ankles: [at(E[0] - 0.13, ANK, E[1]), at(E[0] + 0.13, ANK, E[1] + 0.05)],
    knees: [norm([-0.25, 0, -1]), norm([0.25, 0, -1])],
    toes: [norm([-0.1, 0, -1]), norm([0.1, 0, -1])],
    soles: [UP, UP],
  };
  const keys = [[0, k0], [0.12, k1, 'out'], [0.26, k2, 'in']];
  let t = 0.26;
  if (roll) keys.push([(t += 0.14), k3, 'lin'], [(t += 0.14), k4, 'lin']);
  keys.push([(t += roll ? 0.14 : 0.18), k5, roll ? 'out' : undefined]);
  keys.push([(t += down), k6], [(t += 0.45), g1], [(t += 0.45), g2], [(t += 0.5), idle(E[0], E[1])]);
  return { keys, dur: t, blendIn: 0.08 };
}

// kind: 'back' (manual, too far back) | 'side' (slow trick bail) | 'slam' (fast trick bail)
export function bailTrack(kind, severity) {
  const s = clamp01(severity);
  if (kind === 'back') return backFall(s);
  if (kind === 'slam') return slam(s);
  return sideFall();
}

// --- Stepping off: back foot to the ground on the toe side, front foot onto the tail, press it so the board
// stands up, catch the nose with the left hand, lift it into the carry. Board starts flat under the rider.
export function dismountTrack() {
  const g0 = { hand: 0, local: NOSE_GRIP, w: 0 };
  const d0 = P(STANCE, { board: FLAT(), grip: g0 });
  const d1 = P(d0, { hips: [0.03, 0.84, 0.03], ...torso(-0.45, 0.05), twist: -0.15, headYaw: -0.9, ankles: [d0.ankles[0], at(0.16, 0.33, 0.24)], toes: [d0.toes[0], norm(yd(-0.2))] });
  const d2 = P(d1, {
    root: [0.1, 0],
    hips: [0.17, 0.83, 0.02],
    ...torso(-0.85, 0.06),
    twist: -0.1,
    headYaw: -0.6,
    ankles: [d0.ankles[0], at(0.34, ANK, 0.14)],
    knees: [d0.knees[0], norm([0.6, 0, -1])],
    toes: [d0.toes[0], norm(yd(-1.0))],
  });
  const d3 = P(d2, {
    root: [0.22, 0.05],
    hips: [0.27, 0.83, 0.08],
    ...torso(-1.25, 0.08),
    twist: 0,
    headYaw: -0.25,
    headPitch: 0.3,
    ankles: [at(0.12, 0.34, 0.12), d2.ankles[1]],
    knees: [norm([0.2, 0, -1]), d2.knees[1]],
    toes: [norm(yd(-1.6)), d2.toes[1]],
  });
  const flat = FLAT();
  const d4 = P(d3, {
    hips: [0.28, 0.8, 0.12],
    ...torso(WALK_FACE, 0.12),
    headPitch: 0.45,
    headYaw: 0,
    ankles: [boardPt(flat, TAIL_FOOT), d2.ankles[1]],
    toes: [norm([0.15, 0, -1]), d2.toes[1]],
    grip: { ...g0, w: 0 },
  });
  const up = tailPress(1.28);
  const tailFoot = boardPt(up, TAIL_FOOT);
  const d5 = P(d4, {
    root: [0.28, 0.1],
    hips: [0.3, 0.74, 0.12],
    ...torso(WALK_FACE, 0.28),
    bend: 0.35,
    headPitch: 0.4,
    hands: [at(0.08, 0.7, 0.12), d4.hands[1]],
    ankles: [[tailFoot[0] + 0.02, Math.max(ANK, tailFoot[1]), tailFoot[2] - 0.03], d4.ankles[1]],
    toes: [norm([0.15, -0.6, -1]), d4.toes[1]],
    board: up,
    grip: { ...g0, w: 0.75 },
  });
  const d6 = P(d5, { grip: { ...g0, w: 1 } });
  const end = idle(0.3, 0.1, true);
  const mid = lerpPose(d6, end, 0.55);
  const d7 = { ...mid, board: { p: lerp3(up.p, end.board.p, 0.6), q: lerpPose(up, end.board, 0.6).q }, grip: { hand: 0, local: lerp3(NOSE_GRIP, EDGE_GRIP, 0.6), w: 1 } };
  const keys = [
    [0, d0],
    [0.13, d1, 'out'],
    [0.26, d2, 'in'],
    [0.38, d3, 'out'],
    [0.48, d4, 'in'],
    [0.64, d5, 'in'],
    [0.7, d6],
    [0.86, d7],
    [1.02, end],
  ];
  return { keys, dur: 1.02, blendIn: 0.14 };
}

// --- Dropping back in. start: the walk pose at this moment (at the origin). carry: drop the board from the hand
// first; otherwise the board is already on the ground 0.55 m ahead. Ends in the riding stance on the board, with
// the body (root) moved onto it.
export const MOUNT_GAP = 0.55;
export function mountTrack(start, carry) {
  const B = -MOUNT_GAP;
  const board0 = FLAT(B);
  const g = { hand: 0, local: EDGE_GRIP, w: carry ? 1 : 0 };
  const m0 = { ...start, board: start.board ?? board0, grip: start.grip ?? { ...g, w: 0 } };
  const lower = {
    p: [-0.17, 0.26, -0.32],
    q: lerpPose({ q: CARRY_Q }, { q: [0, 0, 0, 1] }, 0.45).q,
  };
  const m1 = P(m0, {
    hips: [0, 0.8, -0.08],
    ...torso(WALK_FACE, 0.3),
    bend: 0.25,
    headPitch: 0.45,
    hands: [m0.hands[0], at(0.22, 0.8, -0.05)],
    ankles: [at(-0.1, ANK, -0.22), at(0.1, ANK, 0.12)],
    toes: [norm([-0.08, 0, -1]), norm([0.08, 0, -1])],
    soles: [UP, UP],
    board: lower,
    grip: { ...g, w: 1 },
  });
  const m2 = P(m1, { board: { p: [0, 0.05, B], q: [0, 0, 0, 1] }, grip: { ...g, w: 0 }, hands: [at(-0.12, 0.5, -0.3), m1.hands[1]] });
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
