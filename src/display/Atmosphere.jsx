import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { BackSide, Color, Fog, Object3D, ShaderMaterial } from 'three';
import { C, SUN_DIR } from './look.js';
import { board } from '../state.js';

// Golden-hour sky, low warm sun, warm fill and distance haze (DESIGN.md §4, §8).
export default function Atmosphere() {
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    scene.fog = new Fog(C.fog, 90, 560);
  }, [scene]);

  return (
    <>
      <SkyDome />
      <Sun />
      <hemisphereLight args={[C.hemiSky, C.hemiGround, 0.6]} />
      {/* Local golden-hour environment for reflections and soft ambient colour (no download needed). */}
      <Environment frames={1} resolution={128} environmentIntensity={0.35}>
        <mesh scale={100}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshBasicMaterial color="#d9b48c" side={BackSide} />
        </mesh>
        <Lightformer form="circle" color={C.sunLight} intensity={12} scale={14} position={SUN_DIR.clone().multiplyScalar(60).toArray()} target={[0, 0, 0]} />
        <Lightformer form="rect" color={C.skyUpper} intensity={1.5} scale={[160, 160, 1]} position={[0, 60, 0]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" color={C.brickShadow} intensity={0.6} scale={[160, 160, 1]} position={[0, -5, 0]} rotation-x={-Math.PI / 2} />
      </Environment>
    </>
  );
}

// Directional sun that follows the board so its shadow map always covers what the camera sees.
function Sun() {
  const light = useRef(null);
  const target = useMemo(() => new Object3D(), []);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    // Centre the shadow box a little ahead of the board, toward where the camera looks.
    const fx = -Math.sin(board.heading);
    const fz = -Math.cos(board.heading);
    const cx = board.x + fx * 14;
    const cz = board.z + fz * 14;
    target.position.set(cx, 0, cz);
    l.position.set(cx + SUN_DIR.x * 220, SUN_DIR.y * 220, cz + SUN_DIR.z * 220);
    target.updateMatrixWorld();
  });
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        color={C.sunLight}
        intensity={6}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
        shadow-camera-near={20}
        shadow-camera-far={520}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
        shadow-radius={3}
      />
    </>
  );
}

// Sky sphere: cream overhead, hot gold toward the low sun, bright sun core for bloom.
function SkyDome() {
  const mesh = useRef(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          uSun: { value: SUN_DIR },
          uTop: { value: new Color(C.skyUpper) },
          uHorizon: { value: new Color(C.fog) },
          uGold: { value: new Color(C.skyNearSun) },
          uCore: { value: new Color(C.sunCore) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww; // always at the far plane
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uSun, uTop, uHorizon, uGold, uCore;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            float s = max(dot(d, uSun), 0.0);
            vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.45, h));
            col = mix(col, uGold, pow(s, 3.0) * (1.0 - smoothstep(0.0, 0.7, h)) * 0.9);
            col += uCore * (pow(s, 900.0) * 5.0 + pow(s, 60.0) * 1.0 + pow(s, 8.0) * 0.25);
            col += uCore * smoothstep(0.99955, 0.9998, s) * 22.0; // the disk itself
            col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.08, h));
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useFrame(({ camera }) => mesh.current?.position.copy(camera.position));
  return (
    <mesh ref={mesh} material={material} renderOrder={-1} frustumCulled={false} scale={400}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  );
}
