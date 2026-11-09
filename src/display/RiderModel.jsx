import { Component, Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { DECK_TOP, PUSH_ANIM } from './look.js';
import { board } from '../state.js';
import Skater from './Skater.jsx';

// The player character (CHARACTER.md): a rigged GLB (Mixamo bone names) posed live every frame from the board
// physics, like a real skater: sideways stance with knees bent, shoulders opened toward the nose and the head
// looking where you're going; the push turns the body forward and the back foot sweeps the ground; the ollie
// snaps (legs extend), tucks the knees up in the air and absorbs the landing; flips lift the feet and flick the
// front foot out; carving leans with the deck; a bail topples you off the toe side.
// Feet stay on the deck with two-bone leg IK. Each bone is aimed (primary axis to its target, secondary axis to a
// facing direction) from its rest pose, so the real bone lengths and the skinning are always respected.
//
// "Rider space" = the old skater's local space: ground y = 0, nose toward -Z, rider faces +X (toe side).
// The model faces +Z in its own file, so it is turned +90° about Y (its +Z -> rider +X, its left +X -> nose -Z).
// ?oldskater in the URL shows the old primitive skater instead.

const MODEL_URL = '/models/skater/skater.glb';
const USE_OLD = new URLSearchParams(window.location.search).has('oldskater');

const FRONT_Z = -0.2; // ankle positions on the deck: front foot over the front bolts, back foot on the tail
const BACK_Z = 0.25;
const FOOT_X = -0.05; // ankles a little to the heel side so the shoes sit centred across the deck
const TOE_REACH = 0.138; // ankle -> toe base, horizontal (from the rig)
const TOE_DROP = 0.06;

const UP = new Vector3(0, 1, 0);
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

function RiderModel() {
  const { scene } = useGLTF(MODEL_URL);
  const rig = useMemo(() => buildRig(scene), [scene]);
  const root = useRef(null);
  const st = useRef({ crouch: 0.3, push: 0, open: 0, armOut: 0.3, lean: 0, land: 0, wasAir: false });
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
    root.current.rotation.z = -s.lean * 0.12 - fall * 1.42 + sway;
    root.current.rotation.x = fall * 0.22;
    root.current.position.set(fall * 0.22, fall * 0.07, 0);

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

export default function Rider() {
  if (USE_OLD) return <Skater />;
  return (
    <Fallback>
      <Suspense fallback={<Skater />}>
        <RiderModel />
      </Suspense>
    </Fallback>
  );
}

if (!USE_OLD) useGLTF.preload(MODEL_URL);
