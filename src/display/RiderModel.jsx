import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { BOARD_HALF_Y, DECK_TOP, PUSH_ANIM } from './look.js';
import { finish, walkPose, walkRate } from './choreo.js';
import { MOCAP_BONES, loadMocap, locoClips, mocap, sampleClip } from './mocap.js';
import { board } from '../state.js';
import Skater from './Skater.jsx';

// The player character (CHARACTER.md): a rigged GLB (Mixamo bone names) posed live every frame from the board
// physics, like a real skater: sideways stance with knees bent, shoulders opened toward the nose and the head
// looking where you're going; the push turns the body forward and the back foot sweeps the ground; the ollie
// snaps (legs extend), tucks the knees up in the air and absorbs the landing; flips lift the feet and flick the
// front foot out; carving leans with the deck.
// Off the board (bails, getting up, walking with the board, stepping off / on) the pose comes from choreo.js as joint
// targets (board.pose), solved here with the same aim + IK tools and blended with the skate pose at the edges.
// Feet stay on the deck with two-bone leg IK. Each bone is aimed (primary axis to its target, secondary axis to a
// facing direction) from its rest pose, so the real bone lengths and the skinning are always respected.
//
// "Rider space" = the old skater's local space: ground y = 0, nose toward -Z, rider faces +X (toe side).
// The model faces +Z in its own file, so it is turned +90° about Y (its +Z -> rider +X, its left +X -> nose -Z).
// ?oldskater in the URL shows the old primitive skater instead.
// While the board is in the right hand it is pinned to the RightHand bone (boardRef = the board's group), and every
// change of state (riding, falling, walking, grabbing, getting on / off) crossfades over FADE seconds.
// On foot, idle / walk / jog / run and the pick-up come from Mixamo motion capture (mocap.js) once the clips are in
// public/models/skater/anims/; until then the procedural walk (choreo.js) stands in.

const MODEL_URL = '/models/skater/skater.glb';
const USE_OLD = new URLSearchParams(window.location.search).has('oldskater');

const FRONT_Z = -0.2; // ankle positions on the deck: front foot over the front bolts, back foot on the tail
const BACK_Z = 0.25;
const FOOT_X = -0.05; // ankles a little to the heel side so the shoes sit centred across the deck
const TOE_REACH = 0.138; // ankle -> toe base, horizontal (from the rig)
const TOE_DROP = 0.06;

const UP = new Vector3(0, 1, 0);
const ONE = new Vector3(1, 1, 1);
const FADE = 0.2;
const RIGHT_ARM = ['Spine', 'Spine1', 'Spine2', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
const damp = (c, t, l, dt) => c + (t - c) * (1 - Math.exp(-l * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const yawDir = (a, out = new Vector3()) => out.set(Math.cos(a), 0, Math.sin(a)); // 0 = +X (facing), -π/2 = nose
const tilt = (fwd, ang, out = new Vector3()) => out.copy(UP).multiplyScalar(Math.cos(ang)).addScaledVector(fwd, Math.sin(ang));

const SPINE = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
const PRIM_CHILD = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head' };
for (const s of ['Left', 'Right']) {
  Object.assign(PRIM_CHILD, {
    [s + 'Shoulder']: s + 'Arm',
    [s + 'Arm']: s + 'ForeArm',
    [s + 'ForeArm']: s + 'Hand',
    [s + 'UpLeg']: s + 'Leg',
    [s + 'Leg']: s + 'Foot',
    [s + 'Foot']: s + 'ToeBase',
  });
}

// Rest data in rider space, computed once per loaded scene (the cached scene gets posed afterwards).
function buildRig(scene) {
  if (scene.userData.rig) return scene.userData.rig;
  scene.updateMatrixWorld(true);
  const rootInv = new Matrix4().copy(scene.matrixWorld).invert();
  const q0 = new Quaternion().setFromAxisAngle(UP, Math.PI / 2);
  const m0 = new Matrix4().makeRotationFromQuaternion(q0);
  const bones = {};
  scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned: the bind-pose bounds don't follow the pose
    }
  });
  const rest = {};
  const m = new Matrix4();
  const scale = new Vector3();
  for (const [name, b] of Object.entries(bones)) {
    const p = new Vector3();
    const q = new Quaternion();
    m.multiplyMatrices(m0, m.multiplyMatrices(rootInv, b.matrixWorld)).decompose(p, q, scale);
    rest[name] = { p, q, qInv: q.clone().invert(), parent: b.parent?.isBone ? b.parent.name : null };
  }
  // Primary (bone direction) and secondary (facing) axes at rest, as a basis to rotate from.
  const fwd = new Vector3(1, 0, 0); // the model's forward, in rider space
  for (const [name, r] of Object.entries(rest)) {
    let prim;
    if (PRIM_CHILD[name] && rest[PRIM_CHILD[name]]) prim = rest[PRIM_CHILD[name]].p.clone().sub(r.p);
    else if (name === 'Head') prim = UP.clone();
    else if (name.endsWith('ToeBase')) prim = fwd.clone();
    else if (name.endsWith('Hand')) prim = r.p.clone().sub(rest[name.replace('Hand', 'ForeArm')].p); // continues the forearm
    else continue;
    const sec = name.endsWith('Foot') || name.endsWith('ToeBase') ? UP.clone() : fwd.clone();
    r.basisT = basis(prim, sec, new Matrix4()).transpose();
  }
  const hipsParent = bones.Hips.parent;
  const parentM = new Matrix4().multiplyMatrices(m0, new Matrix4().multiplyMatrices(rootInv, hipsParent.matrixWorld));
  const pp = new Vector3();
  const pq = new Quaternion();
  parentM.decompose(pp, pq, scale);
  const len = (a, b) => rest[a].p.distanceTo(rest[b].p);
  const rig = {
    bones,
    rest,
    hipsParentInv: parentM.clone().invert(),
    hipsParentQInv: pq.invert(),
    thigh: len('LeftUpLeg', 'LeftLeg'),
    shin: len('LeftLeg', 'LeftFoot'),
    upper: len('LeftArm', 'LeftForeArm'),
    fore: len('LeftForeArm', 'LeftHand'),
    ankleH: rest.LeftFoot.p.y,
    hipDrop: rest.Hips.p.y - rest.LeftUpLeg.p.y,
  };
  scene.userData.rig = rig;
  return rig;
}

const _p = new Vector3();
const _s = new Vector3();
const _t = new Vector3();
function basis(prim, sec, out) {
  _p.copy(prim).normalize();
  _s.copy(sec).addScaledVector(_p, -sec.dot(_p));
  if (_s.lengthSq() < 1e-8) _s.set(0, 0, 1).addScaledVector(_p, -_p.z);
  _s.normalize();
  _t.crossVectors(_p, _s);
  return out.makeBasis(_p, _s, _t);
}

// Knee position for hip -> ankle with the knee bending toward `pole`.
const _d = new Vector3();
const _pp = new Vector3();
function solveKnee(hip, ankle, pole, l1, l2, out) {
  _d.subVectors(ankle, hip);
  const dist = Math.min(_d.length(), l1 + l2 - 0.002);
  _d.normalize();
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  return out.copy(hip).addScaledVector(_d, along).addScaledVector(_pp, h);
}

function RiderModel({ boardRef }) {
  const { scene } = useGLTF(MODEL_URL);
  const rig = useMemo(() => buildRig(scene), [scene]);
  const root = useRef(null);
  const st = useRef({ crouch: 0.3, push: 0, open: 0, armOut: 0.3, lean: 0, land: 0, wasAir: false, fadeKey: null, fadeT: FADE, locoPhase: 0, idleT: 0, groundOff: 0 });
  useEffect(() => {
    loadMocap(rig.rest.Hips.p.y);
  }, [rig]);
  const w = useMemo(() => {
    const Q = {};
    const P = {};
    for (const n of Object.keys(rig.rest)) (Q[n] = new Quaternion()), (P[n] = new Vector3());
    return {
      Q, P, M: new Matrix4(), R: new Quaternion(), tmpQ: new Quaternion(), v: new Vector3(),
      fPelvis: new Vector3(), fChest: new Vector3(), fNeck: new Vector3(), fHead: new Vector3(),
      fSpine: [new Vector3(), new Vector3()], prim: new Vector3(), up: new Vector3(), left: new Vector3(),
      upper: new Vector3(), fore: new Vector3(), bend: new Vector3(), knee: new Vector3(), pole: new Vector3(),
      ankle: [new Vector3(), new Vector3()], footDir: [new Vector3(), new Vector3()], toe: new Vector3(),
      // off-board pose
      Qs: Object.fromEntries(Object.keys(rig.rest).map((n) => [n, new Quaternion()])), Ps: new Vector3(),
      fU: new Vector3(), fF: new Vector3(), fr: new Vector3(), q2: new Quaternion(), target: new Vector3(),
      sec: new Vector3(), sole: new Vector3(), toeD: new Vector3(),
      // crossfade: the last shown pose, and the snapshot faded out from
      lastQ: Object.fromEntries(Object.keys(rig.rest).map((n) => [n, new Quaternion()])), lastP: new Vector3(),
      fadeQ: Object.fromEntries(Object.keys(rig.rest).map((n) => [n, new Quaternion()])), fadeP: new Vector3(),
      // board in the right hand: hand -> board offset, and scratch
      offset: null, H: new Matrix4(), B: new Matrix4(), bp: new Vector3(), bq: new Quaternion(), bs: new Vector3(),
      cq: new Quaternion(), cp: new Vector3(),
      // motion capture
      sampA: { prim: {}, sec: {} }, sampB: { prim: {}, sec: {} },
      QA: Object.fromEntries(Object.keys(rig.rest).map((n) => [n, new Quaternion()])), hipsA: new Vector3(), qL: new Quaternion(),
    };
  }, [rig]);

  useFrame((state, rawDt) => {
    if (!root.current) return;
    const time = state.clock.elapsedTime;
    const dt = Math.min(rawDt, 1 / 30);
    const s = st.current;
    const a = board.anim;
    const { rest, bones } = rig;
    const { Q, P } = w;

    // Aim a bone: rotate its rest basis so the bone points along `prim` with its front toward `sec`.
    const aim = (name, prim, sec) => {
      basis(prim, sec, w.M).multiply(rest[name].basisT);
      w.R.setFromRotationMatrix(w.M);
      Q[name].multiplyQuaternions(w.R, rest[name].q);
    };
    // Keep a bone's rest orientation relative to its parent.
    const follow = (name) => {
      const par = rest[name].parent;
      Q[name].multiplyQuaternions(Q[par], rest[par].qInv).multiply(rest[name].q);
    };
    // Joint position from its parent's pose (forward kinematics).
    const fk = (name) => {
      const par = rest[name].parent;
      w.tmpQ.multiplyQuaternions(Q[par], rest[par].qInv);
      P[name].subVectors(rest[name].p, rest[par].p).applyQuaternion(w.tmpQ).add(P[par]);
    };

    // Off-board pose from joint targets (see choreo.js for the fields).
    function solveOff(fp) {
      const U = w.fU.fromArray(fp.up).normalize();
      const F = w.fF.fromArray(fp.front);
      F.addScaledVector(U, -F.dot(U)).normalize();
      P.Hips.fromArray(fp.hips);
      // Spine bones tilt forward by shares of the bend and twist toward the chest's facing (yawDir convention).
      const spine = (name, ang, twist) => {
        w.q2.setFromAxisAngle(U, -twist);
        w.fr.copy(F).applyQuaternion(w.q2);
        w.prim.copy(U).multiplyScalar(Math.cos(ang)).addScaledVector(w.fr, Math.sin(ang));
        aim(name, w.prim, w.fr);
      };
      const b = fp.bend;
      spine('Hips', b * 0.35, 0);
      fk('Spine');
      spine('Spine', b * 0.55, fp.twist * 0.33);
      fk('Spine1');
      spine('Spine1', b * 0.7, fp.twist * 0.66);
      fk('Spine2');
      spine('Spine2', b * 0.6, fp.twist);
      fk('Neck');
      spine('Neck', b * 0.2 + fp.headPitch * 0.35, fp.twist + fp.headYaw * 0.4);
      fk('Head');
      spine('Head', fp.headPitch, fp.twist + fp.headYaw);
      // Arms: two-bone IK to the wrist targets, elbows pointing along `elbows`.
      for (const [k, side] of [[0, 'Left'], [1, 'Right']]) {
        follow(side + 'Shoulder');
        fk(side + 'Shoulder');
        fk(side + 'Arm');
        const sh = P[side + 'Arm'];
        w.target.fromArray(fp.hands[k]);
        w.pole.fromArray(fp.elbows[k]).normalize();
        solveKnee(sh, w.target, w.pole, rig.upper, rig.fore, w.knee);
        w.sec.copy(w.pole).negate(); // the inside of the elbow faces away from where it points
        aim(side + 'Arm', w.prim.subVectors(w.knee, sh), w.sec);
        fk(side + 'ForeArm');
        aim(side + 'ForeArm', w.prim.subVectors(w.target, P[side + 'ForeArm']), w.sec);
        fk(side + 'Hand');
        follow(side + 'Hand');
      }
      // Legs: two-bone IK to the ankles, knees along `knees`, feet along `toes` with their instep toward `soles`.
      for (const [k, side] of [[0, 'Left'], [1, 'Right']]) {
        fk(side + 'UpLeg');
        w.target.fromArray(fp.ankles[k]);
        w.pole.fromArray(fp.knees[k]).normalize();
        solveKnee(P[side + 'UpLeg'], w.target, w.pole, rig.thigh, rig.shin, w.knee);
        aim(side + 'UpLeg', w.prim.subVectors(w.knee, P[side + 'UpLeg']), w.pole);
        fk(side + 'Leg');
        aim(side + 'Leg', w.prim.subVectors(w.target, P[side + 'Leg']), w.pole);
        fk(side + 'Foot');
        const toe = w.toeD.fromArray(fp.toes[k]).normalize();
        const sole = w.sole.fromArray(fp.soles[k]).normalize();
        w.toe.copy(toe).multiplyScalar(TOE_REACH).addScaledVector(sole, -TOE_DROP);
        aim(side + 'Foot', w.toe, sole);
        fk(side + 'ToeBase');
        aim(side + 'ToeBase', toe, sole);
      }
    }

    // One arm by IK to a wrist target, elbow pointing along `pole` (also used to hold the board over mocap clips).
    function solveArm(side, target, pole) {
      fk(side + 'Shoulder');
      fk(side + 'Arm');
      const sh = P[side + 'Arm'];
      solveKnee(sh, target, pole, rig.upper, rig.fore, w.knee);
      w.sec.copy(pole).negate();
      aim(side + 'Arm', w.prim.subVectors(w.knee, sh), w.sec);
      fk(side + 'ForeArm');
      aim(side + 'ForeArm', w.prim.subVectors(target, P[side + 'ForeArm']), w.sec);
      fk(side + 'Hand');
      follow(side + 'Hand');
    }

    // A baked mocap frame onto the skeleton: every retargeted bone aimed like the source's, hips from the clip.
    function applySample(smp) {
      for (const b of MOCAP_BONES) if (rest[b]?.basisT && smp.prim[b]) aim(b, smp.prim[b], smp.sec[b]);
      P.Hips.copy(smp.hips);
    }
    // Keep the feet on the ground: the source's legs aren't the skater's length, so shift the hips so the lower
    // ankle sits at ankle height (eased, so the run's flight phase still leaves the ground).
    function groundFeet(rate, dt) {
      for (const side of ['Left', 'Right']) for (const n of ['UpLeg', 'Leg', 'Foot']) fk(side + n);
      const low = Math.min(P.LeftFoot.y, P.RightFoot.y);
      s.groundOff = rate ? damp(s.groundOff, rig.ankleH - low, rate, dt) : rig.ankleH - low;
      P.Hips.y += s.groundOff;
    }
    // Hold the board in the right hand over a clip: wrist where the choreography wants it, relative to the hips.
    function holdBoard(fp) {
      for (const n of ['Spine', 'Spine1', 'Spine2']) fk(n);
      w.target.fromArray(fp.hands[1]).sub(w.v.fromArray(fp.hips)).add(P.Hips);
      w.pole.fromArray(fp.elbows[1]).normalize();
      solveArm('Right', w.target, w.pole);
    }

    // Walking / running from mocap: idle -> walk -> jog -> run blended by speed (two clips at a time), all on one
    // step phase so they stay in step, advancing at speed / stride so the planted foot moves at ground speed.
    function solveLoco(fp, list, dt) {
      const v = Math.abs(fp.loco.v);
      let a = list[0];
      let b = list[0];
      for (let i = 0; i < list.length; i++) if (v >= list[i].speed) (a = list[i]), (b = list[i + 1] ?? list[i]);
      const t = b === a ? 0 : (v - a.speed) / (b.speed - a.speed);
      const strideOf = (l) => (l.speed > 0 ? l.c.stride : (list.find((x) => x.speed > 0)?.c.stride ?? 1));
      const stride = strideOf(a) + (strideOf(b) - strideOf(a)) * t;
      s.locoPhase += (Math.sign(fp.loco.v || 1) * v * dt) / Math.max(0.1, stride);
      s.idleT += dt;
      const timeOf = (l) => (l.speed > 0 ? l.c.land0 + s.locoPhase * l.c.cycleDur : s.idleT);
      applySample(sampleClip(a.c, timeOf(a), true, w.sampA));
      if (t > 0) {
        for (const n of MOCAP_BONES) if (rest[n]) w.QA[n].copy(Q[n]);
        w.hipsA.copy(P.Hips);
        applySample(sampleClip(b.c, timeOf(b), true, w.sampB));
        for (const n of MOCAP_BONES) {
          if (!rest[n]) continue;
          w.tmpQ.copy(Q[n]);
          Q[n].copy(w.QA[n]).slerp(w.tmpQ, t);
        }
        P.Hips.lerpVectors(w.hipsA, w.v.copy(P.Hips), t);
      }
      groundFeet(4, dt);
      // Lean into turns: tip the whole body about the feet toward the inside of the turn.
      const lean = Math.max(-0.22, Math.min(0.22, (fp.loco.turn ?? 0) * v * 0.05));
      if (lean) {
        w.qL.setFromAxisAngle(w.v.set(0, 0, 1), lean);
        for (const n of MOCAP_BONES) if (rest[n]) Q[n].premultiply(w.qL);
        const y = P.Hips.y;
        P.Hips.y = 0;
        w.v.set(0, y, 0).applyQuaternion(w.qL);
        P.Hips.add(w.v);
      }
      if (fp.loco.carry) holdBoard(fp);
      for (const side of ['Left', 'Right']) follow(side + 'Hand');
    }
    // Only moving clips (e.g. just Running, no Idle / Walking yet): the procedural walk below them, blending into the
    // slowest clip on the same step phase, and the clips alone (1:1 at their own speed) from there up.
    function solveMixed(fp, list, dt) {
      const v = Math.abs(fp.loco.v);
      const S = list[0].speed;
      const k = smooth(Math.min(1, Math.max(0, (v - 0.45 * S) / (0.45 * S)))); // 0 walk .. 1 clip
      if (k >= 1) return solveLoco(fp, list, dt);
      const clipRate = v / Math.max(0.1, list[0].c.stride);
      s.locoPhase += Math.sign(fp.loco.v || 1) * (walkRate(v) + (clipRate - walkRate(v)) * k) * dt;
      if (k > 0) {
        applySample(sampleClip(list[0].c, list[0].c.land0 + s.locoPhase * list[0].c.cycleDur, true, w.sampA));
        groundFeet(4, dt);
        for (const n of MOCAP_BONES) if (rest[n]) w.QA[n].copy(Q[n]);
        w.hipsA.copy(P.Hips);
      }
      const wp = finish(walkPose(s.locoPhase, fp.loco.v, fp.loco.carry, fp.loco.turn ?? 0));
      solveOff(wp);
      if (k > 0) {
        for (const n of MOCAP_BONES) {
          if (!rest[n]) continue;
          w.tmpQ.copy(w.QA[n]);
          Q[n].slerp(w.tmpQ, k);
        }
        P.Hips.lerp(w.hipsA, k);
        if (fp.loco.carry) holdBoard(wp);
        for (const side of ['Left', 'Right']) follow(side + 'Hand');
      }
    }
    // A one-shot clip (the pick-up), timed by the choreography, right hand reaching for the board.
    function solveClip(fp, c) {
      applySample(sampleClip(c, fp.mocap.t * fp.mocap.rate, false, w.sampA));
      groundFeet(0, 0);
      holdBoard(fp);
      follow('LeftHand');
    }

    // Hand -> board offset, once: pose the carry stance and see where the right hand is relative to the board.
    if (!w.offset) {
      const cp = finish(walkPose(0, 0, true));
      solveOff(cp);
      for (const n of RIGHT_ARM) fk(n);
      w.H.compose(P.RightHand, Q.RightHand, ONE);
      w.B.compose(w.bp.fromArray(cp.board.p), w.bq.fromArray(cp.board.q), ONE);
      w.offset = new Matrix4().copy(w.H).invert().multiply(w.B);
    }

    // --- Drivers from the board.
    const pushU = a.pushT >= 0 ? Math.min(1, a.pushT / PUSH_ANIM) : -1;
    const pushW = pushU >= 0 ? Math.sin(Math.PI * pushU) : 0;
    const fall = a.fall ?? 0;
    const popT = a.popT;
    if (s.wasAir && !a.air) s.land = 1;
    s.wasAir = a.air;
    s.land = Math.max(0, s.land - dt * 3);
    s.open = damp(s.open, pushU >= 0 ? 1 : 0, 6, dt); // body turns toward the nose for the push

    let crouchT = 0.28 + Math.abs(a.steer) * 0.12;
    if (a.air) crouchT = 0.78; // knees tucked up
    if (popT >= 0 && popT < 0.09) crouchT = 0.05; // the snap: legs extend as the tail pops
    if (pushU >= 0) crouchT = 0.35 + pushW * 0.3; // front knee bends as the back foot reaches the ground
    crouchT += s.land * 0.45; // absorb the landing
    if (fall > 0) crouchT = Math.max(crouchT, 0.5);
    s.crouch = damp(s.crouch, Math.min(1, crouchT), a.air || popT >= 0 ? 16 : 9, dt);
    // Manual: m = how far the nose is up (0..1); edge = how close to losing it (0 sweet spot .. 1 either edge).
    const m = Math.min(1, Math.abs(a.manual ?? 0));
    const edge = (a.balance ?? -1) >= 0 ? Math.abs(a.balance - 0.5) * 2 : 0;
    const balance = m * 0.6; // arms out to balance a manual
    s.armOut = damp(s.armOut, fall > 0 ? 1.4 : a.air ? 1.0 : 0.25 + Math.abs(a.steer) * 0.35 + (a.flip >= 0 ? 0.3 : 0) + balance, 8, dt);
    s.lean = damp(s.lean, a.steer, 6, dt);

    // Whole rider rolls into turns with the deck; on a bail topples off the toe side (+X), pivoting at the feet.
    // Balancing a manual: small side-to-side sway, bigger near the edges of the meter.
    const sway = Math.sin(time * 4.3) * 0.035 * m * (0.5 + edge);
    const off = board.pose; // off-board pose (choreo.js) and how much of it to show
    const wOff = off ? Math.min(1, Math.max(0, off.w)) : 0;
    root.current.rotation.z = (-s.lean * 0.12 + sway) * (1 - wOff);

    // --- Feet on the deck (follow nose/tail pitch, lift off for flips).
    const flipW = a.flip >= 0 ? Math.sin(Math.PI * a.flip) : 0;
    const drag = popT >= 0 && popT < 0.3 ? Math.sin((Math.PI * popT) / 0.3) : 0; // front foot slides up the board
    const lift = flipW * 0.22 + drag * 0.04;
    const sp = Math.sin(a.pitch);
    const ankleY = (z) => DECK_TOP + rig.ankleH - z * sp + lift;
    const zf = FRONT_Z - drag * 0.08;
    const [front, back] = w.ankle;
    front.set(FOOT_X + flipW * 0.12, ankleY(zf) + drag * 0.03, zf); // flips: front foot flicks out to the toe side
    yawDir(-0.45 - s.open * 0.95, w.footDir[0]);
    back.set(FOOT_X, ankleY(BACK_Z), BACK_Z);
    let backAng = 0.15;
    if (pushU >= 0) {
      // Back foot: off the tail -> plant beside the front truck -> sweep back along the ground -> back on the tail.
      const deck = w.v.set(FOOT_X, ankleY(BACK_Z), BACK_Z);
      const plantX = 0.26;
      if (pushU < 0.22) {
        const t = smooth(pushU / 0.22);
        back.set(deck.x + (plantX - deck.x) * t, deck.y + (rig.ankleH - deck.y) * t + Math.sin(Math.PI * t) * 0.1, deck.z + (-0.1 - deck.z) * t);
      } else if (pushU < 0.62) {
        back.set(plantX, rig.ankleH, -0.1 + ((pushU - 0.22) / 0.4) * 0.75);
      } else {
        const t = smooth((pushU - 0.62) / 0.38);
        back.set(plantX + (deck.x - plantX) * t, rig.ankleH + (deck.y - rig.ankleH) * t + Math.sin(Math.PI * t) * 0.14, 0.65 + (deck.z - 0.65) * t);
      }
      backAng = 0.15 + (-1.45 - 0.15) * Math.min(1, pushW * 1.6); // toes turn toward the nose on the ground
    }
    yawDir(backAng, w.footDir[1]);

    // --- Hips: over the feet (over the front foot while pushing), lower as the knees bend, butt back a little.
    const legLen = rig.thigh + rig.shin;
    const baseY = pushU >= 0 ? ankleY(zf) - lift : (ankleY(zf) + ankleY(BACK_Z)) / 2 - lift;
    const hipZ = (FRONT_Z + BACK_Z) / 2 + 0.02 + ((FRONT_Z + 0.06) - (FRONT_Z + BACK_Z) / 2) * s.open;
    // Manual: weight right over the back foot, hips a little lower (back knee bends, front leg reaches out).
    P.Hips.set(-0.03 - s.crouch * 0.05, baseY + rig.hipDrop + legLen * (0.94 - 0.4 * s.crouch - 0.06 * m), hipZ + m * 0.17);

    // --- Facing: pelvis open a little toward the nose, chest more, head looks where you're going.
    const pelvisAng = -(0.25 + s.open * 0.9);
    const chestAng = -(0.5 + s.open * 0.85);
    const travelAng = board.fakie ? Math.PI / 2 : -Math.PI / 2;
    const headAng = chestAng + clamp(Math.atan2(Math.sin(travelAng - chestAng), Math.cos(travelAng - chestAng)), -1.1, 1.1);
    yawDir(pelvisAng, w.fPelvis);
    yawDir(chestAng, w.fChest);
    yawDir(chestAng + (headAng - chestAng) * 0.4, w.fNeck);
    yawDir(headAng, w.fHead);
    yawDir(pelvisAng + (chestAng - pelvisAng) * 0.33, w.fSpine[0]);
    yawDir(pelvisAng + (chestAng - pelvisAng) * 0.66, w.fSpine[1]);

    // --- Spine: forward bend grows with the crouch, spread down the back; head stays up, eyes slightly down.
    const bend = 0.12 + 0.45 * s.crouch + pushW * 0.2 - m * 0.4; // a manual leans the upper body back
    aim('Hips', tilt(w.fPelvis, bend * 0.35, w.prim), w.fPelvis);
    fk('Spine');
    aim('Spine', tilt(w.fSpine[0], bend * 0.55, w.prim), w.fSpine[0]);
    fk('Spine1');
    aim('Spine1', tilt(w.fSpine[1], bend * 0.7, w.prim), w.fSpine[1]);
    fk('Spine2');
    aim('Spine2', tilt(w.fChest, bend * 0.6, w.prim), w.fChest);
    fk('Neck');
    aim('Neck', tilt(w.fNeck, bend * 0.2, w.prim), w.fNeck);
    fk('Head');
    aim('Head', tilt(w.fHead, 0.12, w.prim), w.fHead);

    // --- Arms: hang loose, out for balance in turns / the air / a bail, swing with the push.
    w.up.copy(UP).applyQuaternion(w.tmpQ.multiplyQuaternions(Q.Spine2, rest.Spine2.qInv)); // chest up
    w.left.crossVectors(w.up, w.fChest).normalize(); // character's left (toward the nose)
    const fwdC = w.v.crossVectors(w.left, w.up).normalize();
    for (const [side, sgn] of [['Left', 1], ['Right', -1]]) {
      follow(side + 'Shoulder');
      fk(side + 'Shoulder');
      fk(side + 'Arm');
      // Balancing arms in a manual: out and forward, waving (more near the edges), the two arms out of phase.
      const wave = Math.sin(time * 6.5 + (sgn > 0 ? 0 : 2.1)) * m * (0.15 + 0.35 * edge);
      const abd = 0.3 + s.armOut * 0.75 + wave;
      const sw = (pushU >= 0 ? Math.sin(pushU * Math.PI * 2) * 0.5 * sgn : 0) + (a.air ? 0.2 : 0.08) + m * 0.35 + wave * 0.6;
      w.upper.copy(w.up).multiplyScalar(-Math.cos(abd)).addScaledVector(w.left, sgn * Math.sin(abd)).normalize();
      w.upper.multiplyScalar(Math.cos(sw)).addScaledVector(fwdC, Math.sin(sw)).normalize();
      w.bend.copy(fwdC).addScaledVector(w.upper, -fwdC.dot(w.upper)).normalize();
      const elbow = 0.35 + s.armOut * 0.2;
      w.fore.copy(w.upper).multiplyScalar(Math.cos(elbow)).addScaledVector(w.bend, Math.sin(elbow));
      aim(side + 'Arm', w.upper, w.bend);
      fk(side + 'ForeArm');
      aim(side + 'ForeArm', w.fore, w.bend);
      fk(side + 'Hand');
      follow(side + 'Hand');
    }

    // --- Legs: two-bone IK from the hip sockets to the ankles, knees bending out over the toes.
    for (const [k, side] of [[0, 'Left'], [1, 'Right']]) {
      fk(side + 'UpLeg');
      const ankle = w.ankle[k];
      const dir = w.footDir[k];
      w.pole.copy(dir).addScaledVector(w.fPelvis, 0.6).normalize();
      solveKnee(P[side + 'UpLeg'], ankle, w.pole, rig.thigh, rig.shin, w.knee);
      aim(side + 'UpLeg', w.prim.subVectors(w.knee, P[side + 'UpLeg']), w.pole);
      fk(side + 'Leg');
      aim(side + 'Leg', w.prim.subVectors(ankle, P[side + 'Leg']), w.pole);
      fk(side + 'Foot');
      // Foot flat on the deck (or the ground while pushing), toes along `dir`.
      const onGround = k === 1 && pushU >= 0.22 && pushU < 0.62;
      const toeSp = onGround ? 0 : sp;
      w.toe.copy(dir).multiplyScalar(TOE_REACH);
      w.toe.y = -TOE_DROP - w.toe.z * toeSp;
      aim(side + 'Foot', w.toe, UP);
      fk(side + 'ToeBase');
      w.toe.copy(dir);
      w.toe.y = -dir.z * toeSp;
      aim(side + 'ToeBase', w.toe, UP);
    }

    // --- Off the board: solve the choreography's joint targets and blend them over the skate pose.
    if (wOff > 0) {
      for (const n of Object.keys(rest)) w.Qs[n].copy(Q[n]);
      w.Ps.copy(P.Hips);
      const loco = off.loco && mocap.status === 'ready' ? locoClips() : [];
      const clip = off.mocap?.clip && mocap.clips[off.mocap.clip];
      if (loco.length && loco[0].speed > 0) solveMixed(off, loco, dt);
      else if (loco.length) solveLoco(off, loco, dt);
      else if (clip) solveClip(off, clip);
      else solveOff(off);
      if (wOff < 1) {
        for (const n of Object.keys(rest)) {
          w.tmpQ.copy(Q[n]);
          Q[n].copy(w.Qs[n]).slerp(w.tmpQ, wOff);
        }
        w.v.copy(P.Hips);
        P.Hips.copy(w.Ps).lerp(w.v, wOff);
      }
    }

    // --- Crossfade on every change of state (FADE s from the last shown pose).
    const names = Object.keys(rest);
    const key = off ? off.state ?? 'off' : 'ride';
    if (key !== s.fadeKey) {
      if (s.fadeKey !== null) {
        for (const n of names) w.fadeQ[n].copy(w.lastQ[n]);
        w.fadeP.copy(w.lastP);
        s.fadeT = 0;
      }
      s.fadeKey = key;
    }
    if (s.fadeT < FADE) {
      s.fadeT += dt;
      const k = smooth(Math.min(1, s.fadeT / FADE));
      for (const n of names) {
        w.tmpQ.copy(Q[n]);
        Q[n].copy(w.fadeQ[n]).slerp(w.tmpQ, k);
      }
      w.v.copy(P.Hips);
      P.Hips.copy(w.fadeP).lerp(w.v, k);
    }
    for (const n of names) w.lastQ[n].copy(Q[n]);
    w.lastP.copy(P.Hips);

    // --- Board in the right hand: pinned to the hand bone (blending in from the choreography as the hand closes).
    const g = boardRef?.current;
    if (g && off?.board && off.grip?.hand === 1 && off.grip.w > 0.6) {
      for (const n of RIGHT_ARM) fk(n);
      w.H.compose(P.RightHand, Q.RightHand, ONE).multiply(w.offset);
      w.H.decompose(w.bp, w.bq, w.bs);
      const a = smooth(Math.min(1, (off.grip.w - 0.6) / 0.4));
      w.cp.fromArray(off.board.p).lerp(w.bp, a);
      w.cq.fromArray(off.board.q).slerp(w.bq, a);
      // Same placement as Skateboard's placeBoard: the board group's origin is the collider centre.
      w.v.set(0, -BOARD_HALF_Y, 0).applyQuaternion(w.cq);
      g.position.set(w.cp.x, w.cp.y - BOARD_HALF_Y, w.cp.z).sub(w.v);
      g.quaternion.copy(w.cq);
    }

    // --- Write the pose into the skeleton (local rotations; the hips also get their position).
    for (const name of Object.keys(rest)) {
      const b = bones[name];
      const par = rest[name].parent;
      if (!par) {
        b.quaternion.multiplyQuaternions(rig.hipsParentQInv, Q[name]);
        b.position.copy(P[name]).applyMatrix4(rig.hipsParentInv);
      } else {
        b.quaternion.copy(Q[par]).invert().multiply(Q[name]);
      }
    }
  });

  return (
    <group ref={root}>
      <primitive object={scene} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}

// Falls back to the primitive skater while the model loads or if it fails to load.
class Fallback extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn('Skater model failed to load, using the simple skater instead.', err);
  }
  render() {
    return this.state.failed ? <Skater /> : this.props.children;
  }
}

export default function Rider({ boardRef }) {
  if (USE_OLD) return <Skater />;
  return (
    <Fallback>
      <Suspense fallback={<Skater />}>
        <RiderModel boardRef={boardRef} />
      </Suspense>
    </Fallback>
  );
}

if (!USE_OLD) useGLTF.preload(MODEL_URL);
