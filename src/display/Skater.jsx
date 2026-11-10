import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CylinderGeometry, Quaternion, Vector3 } from 'three';
import { DECK_TOP, PUSH_ANIM, materials } from './look.js';
import { damp, smooth } from './util.js';
import { board } from '../state.js';

// The skater (DESIGN.md §7): seen from behind, regular stance (left foot forward), cream canvas
// jacket, olive cargos, olive bucket hat, white low-tops. Built from primitives; legs use
// two-bone IK so feet stay planted on the deck and the back foot can kick the ground to push.
//
// Local space matches the board: nose toward -Z, rider faces +X (toe side), ground at y = 0.

const THIGH = 0.43;
const SHIN = 0.42;
const ANKLE = 0.065; // ankle height above the sole centre

const UP = new Vector3(0, 1, 0);
const tmp = { a: new Vector3(), b: new Vector3(), d: new Vector3(), p: new Vector3(), k: new Vector3(), q: new Quaternion() };

// Place a unit cylinder (radius 1, height 1, +Y up) between two points.
function setLimb(mesh, from, to, r) {
  tmp.d.subVectors(from, to);
  const len = tmp.d.length();
  mesh.position.addVectors(from, to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, tmp.d.normalize());
  mesh.scale.set(r, len, r);
}

// Knee position for hip → ankle with the knee bending toward `pole`.
function solveKnee(hip, ankle, pole, out) {
  tmp.d.subVectors(ankle, hip);
  const dist = Math.min(tmp.d.length(), THIGH + SHIN - 0.002);
  tmp.d.normalize();
  const along = (THIGH * THIGH - SHIN * SHIN + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, THIGH * THIGH - along * along));
  tmp.p.copy(pole).addScaledVector(tmp.d, -pole.dot(tmp.d)).normalize();
  return out.copy(hip).addScaledVector(tmp.d, along).addScaledVector(tmp.p, h);
}

export default function Skater() {
  const m = materials();
  const limbGeo = useMemo(() => ({
    thigh: new CylinderGeometry(1, 0.9, 1, 12),
    shin: new CylinderGeometry(0.95, 1.05, 1, 12),
  }), []);

  const root = useRef(null);
  const pelvis = useRef(null);
  const torso = useRef(null);
  const head = useRef(null);
  const arms = useRef([]);
  const fores = useRef([]);
  const thighs = useRef([]);
  const shins = useRef([]);
  const knees = useRef([]);
  const shoes = useRef([]);
  const st = useRef({ crouch: 0.25, push: 0, armOut: 0, lean: 0, land: 0, wasAir: false });

  const v = useMemo(() => ({
    hip: [new Vector3(), new Vector3()],
    ankle: [new Vector3(), new Vector3()],
    knee: [new Vector3(), new Vector3()],
    pole: [new Vector3(), new Vector3()],
  }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const s = st.current;
    const a = board.anim;
    if (!pelvis.current) return;

    // --- Pose drivers
    const pushU = a.pushT >= 0 ? Math.min(1, a.pushT / PUSH_ANIM) : -1;
    const pushW = pushU >= 0 ? Math.sin(Math.PI * pushU) : 0; // 0→1→0 over the stroke
    if (s.wasAir && !a.air) s.land = 1;
    s.wasAir = a.air;
    s.land = Math.max(0, s.land - dt * 3.5);
    let crouchT = 0.25 + Math.abs(a.steer) * 0.08;
    if (a.air) crouchT = 0.62;
    if (pushU >= 0) crouchT = 0.42 + pushW * 0.12;
    crouchT += s.land * 0.35;
    const fall = a.fall ?? 0; // bail: 0 riding → 1 on the ground
    if (fall > 0) crouchT = Math.max(crouchT, 0.5);
    s.crouch = damp(s.crouch, crouchT, a.air ? 14 : 9, dt);
    s.armOut = damp(s.armOut, fall > 0 ? 1 : a.air ? 0.75 : Math.abs(a.steer) * 0.3 + (a.flip >= 0 ? 0.3 : 0), fall > 0 ? 14 : 8, dt);
    s.lean = damp(s.lean, a.steer, 6, dt);

    // Whole rider rolls into turns with the deck. On a bail they topple off the toe side (+X),
    // pivoting at the feet, and land on their side next to the board, arms out to catch themselves.
    root.current.rotation.z = -s.lean * 0.12 - fall * 1.42;
    root.current.rotation.x = fall * 0.22;
    root.current.position.set(fall * 0.22, fall * 0.07, 0);

    // --- Pelvis / torso / head
    const yaw = -0.85 + pushW * 0.35; // hips mostly toward the toe side, open up forward when pushing
    const pelvisY = 1.04 - s.crouch * 0.36;
    pelvis.current.position.set(0.03 + s.lean * 0.05, pelvisY, 0.03 - pushW * 0.06);
    pelvis.current.rotation.y = yaw;
    torso.current.rotation.set(-(0.1 + s.crouch * 0.28 + pushW * 0.12), 0.4 - pushW * 0.15, 0);
    head.current.rotation.set(-0.14 + s.crouch * 0.12, 0.3, 0);

    // --- Arms hang loose, swing out for balance in the air / in turns
    const swing = pushU >= 0 ? Math.sin(pushU * Math.PI * 2) * 0.35 : 0;
    arms.current.forEach((g, k) => {
      if (!g) return;
      const side = k ? 1 : -1;
      g.rotation.set(0.08 + swing * side, 0, side * (0.1 + s.armOut * 0.9));
    });
    fores.current.forEach((g) => g && (g.rotation.x = 0.28 + s.armOut * 0.3));

    // --- Feet on the deck (follow nose/tail pitch and kickflip lift)
    const lift = a.flip >= 0 ? Math.sin(Math.PI * a.flip) * 0.2 : 0;
    const sp = Math.sin(a.pitch);
    const footY = (z) => DECK_TOP + 0.045 - z * sp + lift;
    const front = v.ankle[0].set(0.0, footY(-0.21) + ANKLE, -0.21);
    const back = v.ankle[1].set(0.0, footY(0.27) + ANKLE, 0.27);
    let backYaw = -1.42;
    if (pushU >= 0) {
      // Back foot: lift off → plant beside the front truck → sweep back → return to the tail.
      const deckPt = tmp.a.set(0, footY(0.27) + ANKLE, 0.27);
      const plant = tmp.b.set(0.17, 0.045 + ANKLE, -0.18);
      if (pushU < 0.22) {
        const t = smooth(pushU / 0.22);
        back.lerpVectors(deckPt, plant, t);
        back.y += Math.sin(Math.PI * t) * 0.08;
      } else if (pushU < 0.62) {
        const t = (pushU - 0.22) / 0.4;
        back.copy(plant);
        back.z = -0.18 + t * 0.78;
      } else {
        const t = smooth((pushU - 0.62) / 0.38);
        back.set(0.17, 0.045 + ANKLE, 0.6).lerp(deckPt, t);
        back.y += Math.sin(Math.PI * t) * 0.12;
      }
      backYaw = -1.42 + pushW * 1.0;
    }

    // --- Legs (IK). Hip joints sit either side of the pelvis along its right axis.
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const P = pelvis.current.position;
    v.hip[0].set(P.x - rx * 0.1, P.y - 0.06, P.z - rz * 0.1);
    v.hip[1].set(P.x + rx * 0.1, P.y - 0.06, P.z + rz * 0.1);
    v.pole[0].set(fx - rx * 0.35, 0, fz - rz * 0.35);
    v.pole[1].set(fx + rx * 0.2, 0.0, fz + rz * 0.2);
    for (let k = 0; k < 2; k++) {
      solveKnee(v.hip[k], v.ankle[k], v.pole[k], v.knee[k]);
      setLimb(thighs.current[k], v.hip[k], v.knee[k], 0.088);
      setLimb(shins.current[k], v.knee[k], v.ankle[k], 0.08);
      knees.current[k].position.copy(v.knee[k]);
      shoes.current[k].position.set(v.ankle[k].x, v.ankle[k].y - ANKLE, v.ankle[k].z);
    }
    shoes.current[0].rotation.y = -1.1 + pushW * 0.7;
    shoes.current[1].rotation.y = backYaw;
  });

  return (
    <group ref={root}>
      {/* Legs: baggy olive cargos, positioned every frame */}
      {[0, 1].map((k) => (
        <group key={k}>
          <mesh ref={(e) => (thighs.current[k] = e)} geometry={limbGeo.thigh} material={m.pants} castShadow />
          <mesh ref={(e) => (shins.current[k] = e)} geometry={limbGeo.shin} material={m.pants} castShadow />
          <mesh ref={(e) => (knees.current[k] = e)} material={m.pants} castShadow>
            <sphereGeometry args={[0.083, 12, 8]} />
          </mesh>
          <group ref={(e) => (shoes.current[k] = e)}>
            <RoundedBox args={[0.115, 0.085, 0.29]} radius={0.035} smoothness={3} position={[0, 0, -0.035]} material={m.sneakers} castShadow />
            {/* cargo cuff bunching over the shoe */}
            <mesh position={[0, 0.075, 0.03]} material={m.pants} castShadow>
              <cylinderGeometry args={[0.085, 0.095, 0.08, 12]} />
            </mesh>
          </group>
        </group>
      ))}

      <group ref={pelvis}>
        <mesh material={m.pants} scale={[1.0, 0.75, 0.82]} castShadow>
          <sphereGeometry args={[0.17, 16, 10]} />
        </mesh>

        <group ref={torso} position={[0, 0.04, 0]} rotation-order="YXZ">
          {/* White tee peeking out at the hem */}
          <mesh position={[0, 0.03, 0]} scale={[1.2, 1, 0.78]} material={m.tee} castShadow>
            <cylinderGeometry args={[0.155, 0.16, 0.08, 16]} />
          </mesh>
          {/* Cream canvas trucker jacket */}
          <mesh position={[0, 0.27, 0]} scale={[1.32, 1, 0.8]} material={m.jacket} castShadow>
            <capsuleGeometry args={[0.15, 0.22, 6, 16]} />
          </mesh>
          <mesh position={[0, 0.1, 0]} scale={[1.36, 1, 0.84]} material={m.jacket} castShadow>
            <cylinderGeometry args={[0.152, 0.158, 0.07, 16]} />
          </mesh>
          {/* Collar, turned up a little */}
          <mesh position={[0, 0.5, 0.02]} rotation-x={-0.2} material={m.jacket} castShadow>
            <torusGeometry args={[0.075, 0.03, 8, 16]} />
          </mesh>
          <mesh position={[0, 0.54, 0]} material={m.skin}>
            <cylinderGeometry args={[0.048, 0.055, 0.1, 10]} />
          </mesh>

          {/* Arms in jacket sleeves */}
          {[-1, 1].map((side, k) => (
            <group key={side} ref={(e) => (arms.current[k] = e)} position={[side * 0.2, 0.42, 0]}>
              <mesh position={[0, -0.14, 0]} material={m.jacket} castShadow>
                <capsuleGeometry args={[0.062, 0.18, 4, 10]} />
              </mesh>
              <group ref={(e) => (fores.current[k] = e)} position={[0, -0.28, 0]}>
                <mesh position={[0, -0.12, 0]} material={m.jacket} castShadow>
                  <capsuleGeometry args={[0.058, 0.15, 4, 10]} />
                </mesh>
                <mesh position={[0, -0.25, 0]} material={m.jacket} castShadow>
                  <cylinderGeometry args={[0.06, 0.055, 0.05, 10]} />
                </mesh>
                <mesh position={[0, -0.31, 0]} scale={[0.75, 1.15, 0.55]} material={m.skin} castShadow>
                  <sphereGeometry args={[0.05, 10, 8]} />
                </mesh>
              </group>
            </group>
          ))}

          {/* Head, short dark hair, olive bucket hat */}
          <group ref={head} position={[0, 0.58, 0]} rotation-order="YXZ">
            <mesh position={[0, 0.07, 0]} material={m.skin} castShadow>
              <sphereGeometry args={[0.1, 18, 14]} />
            </mesh>
            <mesh position={[0, 0.072, 0.012]} scale={[1.0, 0.98, 1.0]} material={m.hair}>
              <sphereGeometry args={[0.101, 18, 14]} />
            </mesh>
            {/* Bucket hat: rounded crown, short brim angled down all round */}
            <mesh position={[0, 0.155, 0]} material={m.hat} castShadow>
              <cylinderGeometry args={[0.09, 0.112, 0.1, 22]} />
            </mesh>
            <mesh position={[0, 0.2, 0]} scale={[1, 0.3, 1]} material={m.hat}>
              <sphereGeometry args={[0.09, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            <mesh position={[0, 0.088, 0]} material={m.hat} castShadow>
              <cylinderGeometry args={[0.112, 0.168, 0.062, 26, 1, true]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
