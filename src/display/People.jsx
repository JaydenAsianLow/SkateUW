import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial } from 'three';
import { withRim } from './look.js';

// Background students (DESIGN.md §6.5): simple low-detail figures in casual clothes,
// backlit by the low sun, walking slow loops. No colliders, so they never block the skater.

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, withRim(new MeshStandardMaterial({ color, roughness: 0.9 }), 1.6));
  return matCache.get(color);
}

const TOPS = ['#2b2f3a', '#4a3b33', '#6d6a63', '#2f3b2e', '#7b3f32', '#1f2430', '#8a8478', '#3d2f2a', '#55606e'];
const PANTS = ['#3c4656', '#2b2b2e', '#4d4a44', '#34404f', '#5a5246'];
const SKIN = ['#c99a7a', '#8d5f45', '#e0b896', '#5c3b2a', '#b07d5e'];
const HAIR = ['#1d1612', '#3a2a1e', '#6b4a2e', '#141010'];
const PACKS = ['#1b1b1d', '#3a3f2c', '#5b2b26', '#22303f'];

function pick(arr, i) {
  return arr[((i % arr.length) + arr.length) % arr.length];
}

function Body({ i, backpack, refs }) {
  const top = mat(pick(TOPS, i * 3 + 1));
  const pants = mat(pick(PANTS, i * 5 + 2));
  const skin = mat(pick(SKIN, i * 7 + 3));
  const hair = mat(pick(HAIR, i * 2));
  const shoes = mat('#d8d4cc');
  const pack = mat(pick(PACKS, i));
  return (
    <group>
      {[-1, 1].map((side, k) => (
        <group key={side} ref={(g) => (refs.hips[k] = g)} position={[side * 0.09, 0.9, 0]}>
          <mesh material={pants} position={[0, -0.215, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.06, 0.43, 8]} />
          </mesh>
          <group ref={(g) => (refs.knees[k] = g)} position={[0, -0.43, 0]}>
            <mesh material={pants} position={[0, -0.21, 0]} castShadow>
              <cylinderGeometry args={[0.058, 0.05, 0.42, 8]} />
            </mesh>
            <mesh material={shoes} position={[0, -0.44, -0.04]} castShadow>
              <boxGeometry args={[0.1, 0.07, 0.25]} />
            </mesh>
          </group>
        </group>
      ))}
      <mesh material={pants} position={[0, 0.93, 0]} scale={[1.25, 0.7, 0.85]} castShadow>
        <sphereGeometry args={[0.13, 12, 8]} />
      </mesh>
      <mesh material={top} position={[0, 1.2, 0]} scale={[1.22, 1, 0.76]} castShadow>
        <capsuleGeometry args={[0.15, 0.28, 4, 12]} />
      </mesh>
      <mesh material={top} position={[0, 1.46, 0.07]} scale={[1, 0.7, 1]} castShadow>
        <sphereGeometry args={[0.12, 12, 8]} />
      </mesh>
      <mesh material={skin} position={[0, 1.6, 0]} castShadow>
        <sphereGeometry args={[0.1, 16, 12]} />
      </mesh>
      <mesh material={hair} position={[0, 1.635, 0.012]} scale={[1.02, 0.88, 1.02]}>
        <sphereGeometry args={[0.105, 16, 12]} />
      </mesh>
      {[-1, 1].map((side, k) => (
        <group key={side} ref={(g) => (refs.arms[k] = g)} position={[side * 0.21, 1.42, 0]} rotation-z={side * 0.08}>
          <mesh material={top} position={[0, -0.27, 0]} castShadow>
            <capsuleGeometry args={[0.05, 0.42, 4, 8]} />
          </mesh>
          <mesh material={skin} position={[0, -0.56, 0]}>
            <sphereGeometry args={[0.04, 8, 6]} />
          </mesh>
        </group>
      ))}
      {backpack && (
        <mesh material={pack} position={[0, 1.24, 0.18]} castShadow>
          <boxGeometry args={[0.3, 0.4, 0.15]} />
        </mesh>
      )}
    </group>
  );
}

// Walks back and forth between a and b.
export function Walker({ a, b, speed = 1.3, i = 0, backpack = true, offset = 0 }) {
  const root = useRef(null);
  const refs = useMemo(() => ({ hips: [], knees: [], arms: [] }), []);
  const st = useRef({ t: offset, phase: offset * 9 });
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = st.current;
    s.t = (s.t + (dt * speed) / len) % 2;
    const fwd = s.t < 1;
    const k = fwd ? s.t : 2 - s.t;
    const x = a[0] + (b[0] - a[0]) * k;
    const z = a[1] + (b[1] - a[1]) * k;
    const dx = (b[0] - a[0]) * (fwd ? 1 : -1);
    const dz = (b[1] - a[1]) * (fwd ? 1 : -1);
    s.phase += (dt * speed * Math.PI) / 0.72;
    const sw = Math.sin(s.phase);
    const g = root.current;
    if (!g) return;
    g.position.set(x, Math.abs(Math.cos(s.phase)) * 0.03, z);
    g.rotation.y = Math.atan2(-dx, -dz);
    refs.hips[0] && (refs.hips[0].rotation.x = sw * 0.42);
    refs.hips[1] && (refs.hips[1].rotation.x = -sw * 0.42);
    refs.knees[0] && (refs.knees[0].rotation.x = -Math.max(0, -Math.sin(s.phase + 0.6)) * 0.7);
    refs.knees[1] && (refs.knees[1].rotation.x = -Math.max(0, Math.sin(s.phase + 0.6)) * 0.7);
    refs.arms[0] && (refs.arms[0].rotation.x = -sw * 0.3);
    refs.arms[1] && (refs.arms[1].rotation.x = sw * 0.3);
  });
  return (
    <group ref={root}>
      <Body i={i} backpack={backpack} refs={refs} />
    </group>
  );
}

// Seated on a ledge of height `seat`, facing rotY.
export function Sitter({ position: [x, z], seat = 0.92, rotY = 0, i = 0 }) {
  const refs = useMemo(() => ({ hips: [], knees: [], arms: [] }), []);
  const root = useRef(null);
  useFrame(() => {
    // Apply the pose once refs exist (cheap, and keeps the body component shared with walkers).
    if (root.current?.userData.posed) return;
    if (!refs.hips[1] || !refs.knees[1] || !refs.arms[1]) return;
    refs.hips.forEach((h, k) => (h.rotation.x = Math.PI / 2 + (k ? 0.05 : -0.05)));
    refs.knees.forEach((kn) => (kn.rotation.x = -Math.PI / 2 + 0.15));
    refs.arms.forEach((a) => (a.rotation.x = 0.5));
    root.current.userData.posed = true;
  });
  return (
    <group ref={root} position={[x, seat - 0.9 + 0.05, z]} rotation-y={rotY}>
      <Body i={i} backpack={false} refs={refs} />
    </group>
  );
}
