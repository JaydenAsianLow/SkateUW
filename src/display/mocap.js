// Mixamo motion capture for walking / running / idle / picking the board up (In Place, Without Skin, FBX), retargeted
// onto the skater's own skeleton.
//
// Retargeting is by bone direction, not by copying rotations: for every frame we bake, per bone, where it points
// (toward its child joint) and which way its front faces, in rider space. RiderModel then aims its own bones the same
// way (the same aim() it uses everywhere), so the two skeletons don't need matching rest poses (Mixamo is a T-pose,
// the skater an A-pose) or matching bone lengths.
//
// Each locomotion clip is analysed once: its natural ground speed (how fast the planted foot slides back under the
// body), how many steps cycles it holds and when the left foot lands, so clips can be blended in step and played at
// a rate that matches the skater's real speed (no foot sliding).

import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const DIR = '/models/skater/anims/';
// Expected file names (Mixamo names the download after the animation). The first one found is used.
export const CLIP_FILES = {
  idle: ['Idle.fbx'],
  walk: ['Walking.fbx'],
  jog: ['Jogging.fbx'],
  run: ['Running.fbx'],
  pickup: ['Pick Up.fbx', 'Picking Up.fbx', 'Pickup.fbx', 'Pick up.fbx'],
  skate: ['Skateboarding.glb', 'Skateboarding.fbx'], // riding / pushing loop (art/scripts/14_skate_anim.py, no mesh)
};
const FPS = 30;

// Bones we retarget: [name, child joint it points at, front axis at rest ('fwd' = the character's forward, 'up')].
const SPEC = [
  ['Hips', 'Spine', 'fwd'],
  ['Spine', 'Spine1', 'fwd'],
  ['Spine1', 'Spine2', 'fwd'],
  ['Spine2', 'Neck', 'fwd'],
  ['Neck', 'Head', 'fwd'],
  ['Head', 'HeadTop_End', 'fwd'],
];
for (const s of ['Left', 'Right']) {
  SPEC.push(
    [s + 'Shoulder', s + 'Arm', 'fwd'],
    [s + 'Arm', s + 'ForeArm', 'fwd'],
    [s + 'ForeArm', s + 'Hand', 'fwd'],
    [s + 'UpLeg', s + 'Leg', 'fwd'],
    [s + 'Leg', s + 'Foot', 'fwd'],
    [s + 'Foot', s + 'ToeBase', 'up'],
    [s + 'ToeBase', s + 'Toe_End', 'up'],
  );
}
export const MOCAP_BONES = SPEC.map(([n]) => n);

// Shared, filled in as files load: { status: 'idle' | 'loading' | 'ready', clips: { idle, walk, ... }, missing: [] }
export const mocap = { status: 'idle', clips: {}, missing: [], errors: [] };

// Source space (Mixamo: Y up, character faces +Z, left = +X) -> rider space walking (faces -Z, left = -X).
const toRider = (v, out) => out.set(-v.x, v.y, -v.z);

const _a = new Vector3();
const _b = new Vector3();
const _q = new Quaternion();
const _qi = new Quaternion();

// Bake one clip on a source skeleton (any THREE object tree whose bones carry Mixamo names, with or without the
// "mixamorig" prefix). hipHeight: the skater's rest hip height (m), so the source is scaled to the skater.
export function bakeClip(root, clip, hipHeight) {
  const bones = {};
  root.traverse((o) => {
    const n = o.name.replace(/^mixamorig\d*:?/, '');
    if (!bones[n] && (o.isBone || o.type === 'Bone' || /^mixamorig/.test(o.name) || SPEC.some(([b]) => b === n))) bones[n] = o;
  });
  const missing = SPEC.filter(([n]) => !bones[n] && !n.endsWith('_End')).map(([n]) => n);
  if (missing.length) throw new Error('bones not found: ' + missing.join(', '));
  root.updateMatrixWorld(true);
  // Rest: world rotations and the hip height, before any animation is applied.
  const restQ = {};
  for (const [n] of SPEC) if (bones[n]) restQ[n] = bones[n].getWorldQuaternion(new Quaternion());
  const restHip = bones.Hips.getWorldPosition(new Vector3()).y;
  const scale = hipHeight / restHip;

  const mixer = new AnimationMixer(root);
  // Play once and hold the last frame, so sampling t = duration gives the real end pose (a looping action wraps it
  // back to the start, hiding root motion).
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const dur = clip.duration;
  const n = Math.max(2, Math.round(dur * FPS) + 1);
  const prim = {};
  const sec = {};
  for (const [b] of SPEC) (prim[b] = new Float32Array(n * 3)), (sec[b] = new Float32Array(n * 3));
  const hips = new Float32Array(n * 3);
  const feet = [new Float32Array(n * 3), new Float32Array(n * 3)];
  const rhand = new Float32Array(n * 3);
  const put = (arr, i, v) => ((arr[i * 3] = v.x), (arr[i * 3 + 1] = v.y), (arr[i * 3 + 2] = v.z));
  const pos = (o, out) => toRider(o.getWorldPosition(out), out);
  for (let i = 0; i < n; i++) {
    mixer.setTime(Math.min(dur, (i / (n - 1)) * dur));
    root.updateMatrixWorld(true);
    for (const [b, child, front] of SPEC) {
      const bone = bones[b];
      if (!bone) continue;
      const cb = bones[child];
      if (cb) {
        bone.getWorldPosition(_a);
        cb.getWorldPosition(_b);
        _b.sub(_a);
      } else {
        // No end joint in the file: the head points along its rest "up", the toes along the character's forward,
        // carried by the bone's rotation since rest.
        _q.copy(bone.getWorldQuaternion(_q)).multiply(_qi.copy(restQ[b]).invert());
        _b.set(0, b === 'Head' ? 1 : 0, b === 'Head' ? 0 : 1).applyQuaternion(_q);
      }
      put(prim[b], i, toRider(_b.normalize(), _a));
      // Front: the rest-pose front axis carried by the bone's rotation since rest.
      bone.getWorldQuaternion(_q).multiply(_qi.copy(restQ[b]).invert());
      _b.set(0, front === 'up' ? 1 : 0, front === 'up' ? 0 : 1).applyQuaternion(_q);
      put(sec[b], i, toRider(_b, _a));
    }
    put(hips, i, pos(bones.Hips, _a).multiplyScalar(scale));
    put(feet[0], i, pos(bones.LeftFoot, _a).multiplyScalar(scale));
    put(feet[1], i, pos(bones.RightFoot, _a).multiplyScalar(scale));
    put(rhand, i, pos(bones.RightHand, _a).multiplyScalar(scale));
  }
  mixer.stopAllAction();
  // Not exported In Place (the hips travel forward through the clip): take the travel out so it plays on the spot,
  // and use it as the clip's ground speed, which is exact for root-motion clips.
  const dx = hips[(n - 1) * 3] - hips[0];
  const dz = hips[(n - 1) * 3 + 2] - hips[2];
  const travel = Math.hypot(dx, dz);
  let rootSpeed = null;
  if (travel > 0.2) {
    rootSpeed = travel / dur;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      for (const arr of [hips, feet[0], feet[1], rhand]) (arr[i * 3] -= dx * k), (arr[i * 3 + 2] -= dz * k);
    }
  }
  return analyse({ dur, n, prim, sec, hips, feet, rhand, rootSpeed });
}

// Ground speed, step cycles, left-foot landing, and (for a pick-up) when the right hand is lowest.
function analyse(c) {
  const { n, dur, feet, rhand } = c;
  const dt = dur / (n - 1);
  const y = (k, i) => feet[k][i * 3 + 1];
  const fwd = (k, i) => -feet[k][i * 3 + 2]; // walking forward = -Z
  let minY = Infinity;
  for (let i = 0; i < n; i++) minY = Math.min(minY, y(0, i), y(1, i));
  // Speed: the planted (lower) foot slides back under the body at the ground speed.
  const v = [];
  for (let i = 0; i < n - 1; i++) {
    const k = y(0, i) < y(1, i) ? 0 : 1;
    if (y(k, i) < minY + 0.03) v.push((fwd(k, i) - fwd(k, i + 1)) / dt);
  }
  v.sort((a, b) => a - b);
  const speed = c.rootSpeed ?? (v.length ? Math.max(0, v[Math.floor(v.length / 2)]) : 0);
  // Left-foot landings: the left foot becomes the lower one.
  const lands = [];
  for (let i = 1; i < n; i++) if (y(0, i - 1) >= y(1, i - 1) && y(0, i) < y(1, i)) lands.push(i * dt);
  const cycles = Math.max(1, lands.length);
  let grab = 0;
  let low = Infinity;
  for (let i = 0; i < n; i++) if (rhand[i * 3 + 1] < low) (low = rhand[i * 3 + 1]), (grab = i * dt);
  // The foot that stays on the board (skating clip): the one whose height changes least.
  const std = (k) => {
    let m = 0;
    for (let i = 0; i < n; i++) m += y(k, i) / n;
    let v2 = 0;
    for (let i = 0; i < n; i++) v2 += (y(k, i) - m) ** 2 / n;
    return Math.sqrt(v2);
  };
  const boardFoot = std(0) <= std(1) ? 0 : 1;
  // A calm frame to stand still on (feet closest together, both low): the idle pose for now.
  let idleT = 0;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const sep = Math.abs(fwd(0, i) - fwd(1, i)) + Math.abs(y(0, i) - y(1, i)) * 2 + (Math.min(y(0, i), y(1, i)) - minY) * 2;
    if (sep < best) (best = sep), (idleT = i * dt);
  }
  return { ...c, speed, cycles, cycleDur: dur / cycles, land0: lands[0] ?? 0, stride: speed * (dur / cycles), grab, boardFoot, idleT };
}

// Read one frame (looping or clamped): fills prim/sec Vector3 maps and the hips position.
export function sampleClip(c, t, loop, out) {
  const { n, dur } = c;
  let u = loop ? ((t % dur) + dur) % dur : Math.min(dur, Math.max(0, t));
  const f = (u / dur) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const a = f - i;
  const lerp = (arr, v) => v.set(
    arr[i * 3] + (arr[i * 3 + 3] - arr[i * 3]) * a,
    arr[i * 3 + 1] + (arr[i * 3 + 4] - arr[i * 3 + 1]) * a,
    arr[i * 3 + 2] + (arr[i * 3 + 5] - arr[i * 3 + 2]) * a,
  );
  for (const b of MOCAP_BONES) {
    out.prim[b] ??= new Vector3();
    out.sec[b] ??= new Vector3();
    lerp(c.prim[b], out.prim[b]);
    lerp(c.sec[b], out.sec[b]);
  }
  out.hips ??= new Vector3();
  lerp(c.hips, out.hips);
  return out;
}

// Top speed on foot: the run clip's own speed (so a full push plays it 1:1), else the fallback.
export const runTopSpeed = (fallback) => (mocap.clips.run?.speed > 0.2 ? mocap.clips.run.speed : fallback);

// Locomotion clips by speed (idle first). Only those that loaded. Read every frame while walking, so the list is
// built once loading has finished (the clips never change after that).
let locoList = null;
export function locoClips() {
  if (locoList) return locoList;
  const out = [];
  if (mocap.clips.idle) out.push({ name: 'idle', c: mocap.clips.idle, speed: 0 });
  for (const k of ['walk', 'jog', 'run']) if (mocap.clips[k]?.speed > 0.2) out.push({ name: k, c: mocap.clips[k], speed: mocap.clips[k].speed });
  out.sort((a, b) => a.speed - b.speed);
  const list = out.some((l) => l.speed > 0) ? out : [];
  if (mocap.status === 'ready') locoList = list;
  return list;
}

// Load every clip (once). Missing files are listed in mocap.missing and the console; the game falls back to the
// procedural walk while there's no walking clip.
export async function loadMocap(hipHeight) {
  if (mocap.status !== 'idle') return mocap;
  mocap.status = 'loading';
  const loader = new FBXLoader();
  await Promise.all(
    Object.entries(CLIP_FILES).map(async ([key, names]) => {
      for (const name of names) {
        try {
          const res = await fetch(DIR + encodeURIComponent(name));
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(20, buf.byteLength)));
          const glb = head.startsWith('glTF');
          if (!glb && !head.startsWith('Kaydara FBX Binary') && !head.startsWith('; FBX')) continue; // dev server's 404 page
          let group;
          let clip;
          if (glb) {
            const g = await new GLTFLoader().parseAsync(buf, DIR);
            group = g.scene;
            clip = g.animations?.[0];
          } else {
            group = loader.parse(buf, DIR);
            clip = group.animations?.[0];
          }
          if (!clip) throw new Error(`${name} has no animation`);
          mocap.clips[key] = { ...bakeClip(group, clip, hipHeight), file: name };
          return;
        } catch (e) {
          mocap.errors.push(`${name}: ${e.message}`);
          console.warn(`[mocap] ${name}:`, e);
          return;
        }
      }
      mocap.missing.push(`${key} (${names.join(' or ')})`);
    }),
  );
  mocap.status = 'ready';
  const got = Object.entries(mocap.clips).map(([k, c]) => `${k}=${c.file} ${c.speed.toFixed(2)} m/s ${c.cycles} cycle(s)`);
  console.info(`[mocap] loaded: ${got.join(', ') || 'none'}${mocap.missing.length ? ` | missing in ${DIR}: ${mocap.missing.join(', ')}` : ''}`);
  return mocap;
}
