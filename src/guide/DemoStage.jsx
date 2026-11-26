import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { board, game, haptics, phone } from '../state.js';
import { commands, settings } from '../settings.js';
import { SHARED_DEFAULTS } from '../shared.js';
import Skateboard from '../display/Skateboard.jsx';
import CameraRig from '../display/CameraRig.jsx';
import Effects from '../display/Effects.jsx';
import { BalanceMeter, TimingBar } from '../display/Hud.jsx';
import { GRAVITY } from '../display/tuning.js';
import DemoWorld, { LANES } from './DemoWorld.jsx';
import { createDriver } from './driver.js';
import { seedRandom, vclock } from './clock.js';
import './stage.css';

// The demo scene: the page inside the Controls guide's iframe (/?demo). The real skateboard, rider, physics and
// camera on the practice set (DemoWorld.jsx), driven by a demo script (demos.js) instead of the phone. It never
// connects to the server. Nothing runs by itself: the guide steps it frame by frame through window.__demo (see
// guide/engine.js), on a virtual clock (clock.js).

const DT = 1 / 60;
const NO_KEYS = [{ name: 'forward', keys: [] }];

let store = null; // the R3F root state (advance, gl, scene)
let remount = null; // () => Promise, resolves once the skater is mounted again
let mountedResolve = null;
let driver = null;
let T = 0; // script time
let simS = 0; // the scene's own clock for advance(), in seconds

function resetGame(demo) {
  const lane = LANES[demo.spawn ?? 'flat'] ?? 0;
  Object.assign(settings, { airtime: 1.7, ...SHARED_DEFAULTS, ...(demo.settings ?? {}) });
  settings.spawn = { x: lane + (demo.spawnX ?? 0), y: 0.13, z: demo.spawnZ ?? 0, heading: 0 };
  Object.assign(phone, { steer: 0, lean: 0, jx: 0, jy: 0, pushQueued: 0, popQueued: 0, popNose: false, trickQueued: null, revertQueued: 0, partialQueued: false, resetQueued: false, carryQueued: false, jumpQueued: false, tapQueued: false });
  Object.assign(board, { score: 0, trick: null, ragdoll: null, pose: null, timingUntil: 0, grind: null });
  haptics.length = 0;
  game.running = true;
  game.keyboard = false;
}

// One frame: the script, then the game (physics, skater, camera). render = false skips drawing (recording only
// keeps some frames; the rest only need the simulation).
function stepOnce(render) {
  const gl = store.gl;
  const T0 = T;
  T += DT;
  simS += DT;
  vclock.ms += DT * 1000;
  driver.update(T0, T);
  const draw = gl.render;
  if (!render) gl.render = () => store.scene.updateMatrixWorld();
  try {
    store.advance(simS);
  } finally {
    gl.render = draw;
  }
  return driver.record();
}

const api = {
  ready: false,
  get canvas() {
    return store?.gl.domElement;
  },
  // Start a demo from the top: fresh skater at the demo's lane, the warm-up played (not drawn).
  async load(demo) {
    resetGame(demo);
    await remount();
    seedRandom(demo.seed ?? 7);
    commands.toSpawn = true;
    driver = createDriver({ ...demo, steps: demo.steps ?? [] }, { camera: () => store.camera });
    T = -(demo.warmup ?? 0) - DT;
    while (T < -DT / 2) stepOnce(false);
    return driver.record();
  },
  step: (render = true) => stepOnce(render),
  dpr: 1,
  setDpr(v) {
    this.dpr = v;
    store.setDpr(v);
  },
  // For tests and tuning the scripts: where the skater is and what it's doing.
  debug: () => ({
    x: +board.x.toFixed(2), y: +board.y.toFixed(2), z: +board.z.toFixed(2), speed: +board.speed.toFixed(2),
    mode: board.mode, view: board.view.mode, grind: board.grind?.kind ?? null, trick: board.trick?.name ?? null, score: board.score,
  }),
  get t() {
    return T;
  },
};
window.__demo = api;

function Mounted({ onMount }) {
  useEffect(() => onMount(), [onMount]);
  return null;
}

export default function DemoStage() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    remount = () =>
      new Promise((resolve) => {
        mountedResolve = resolve;
        setKey((k) => k + 1);
      });
  }, []);
  const onMount = () => {
    if (!api.ready) {
      // First time: draw a few frames so the environment map and shaders are ready, then hand over to the guide.
      resetGame({});
      driver = createDriver({ steps: [] });
      for (let i = 0; i < 3; i++) stepOnce(true);
      api.ready = true;
    }
    mountedResolve?.();
    mountedResolve = null;
  };
  return (
    <KeyboardControls map={NO_KEYS}>
      <div className="display demo-stage">
        <Canvas
          frameloop="never"
          shadows="percentage"
          flat
          dpr={1}
          camera={{ position: [0, 1.4, 4], fov: 50, near: 0.05, far: 1500 }}
          gl={{ powerPreference: 'high-performance', antialias: false }}
          onCreated={(state) => {
            state.gl.toneMappingExposure = 1.1;
            store = state;
          }}
        >
          <Suspense fallback={null}>
            <Physics gravity={[0, -GRAVITY, 0]} timeStep="vary">
              <DemoWorld />
              <group key={key}>
                <Skateboard />
                <CameraRig />
                <Mounted onMount={onMount} />
              </group>
            </Physics>
            <Effects />
          </Suspense>
        </Canvas>
        <DemoCallout />
        <BalanceMeter />
        <TimingBar />
      </div>
    </KeyboardControls>
  );
}

// The trick callout (as Hud.jsx), on the demo's own clock.
function DemoCallout() {
  const [trick, setTrick] = useState(null);
  useEffect(() => {
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = board.trick && performance.now() - board.trick.at < 1400 ? board.trick : null;
      setTrick((cur) => (cur?.at === t?.at ? cur : t));
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!trick) return null;
  return (
    <div key={trick.at} className={`trick-callout ${trick.name === 'BAIL' || trick.name === 'SLAM' ? 'bail' : ''}`}>
      {trick.name}
    </div>
  );
}
