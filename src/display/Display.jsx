import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { connect } from '../socket.js';
import { board, phone, net } from '../state.js';
import { commands, settings } from '../settings.js';
import World from './World.jsx';
import Skateboard, { GRAVITY } from './Skateboard.jsx';
import CameraRig from './CameraRig.jsx';
import Effects from './Effects.jsx';
import Hud from './Hud.jsx';

// Keyboard fallback so the scene can be tested without a phone.
const keyMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'back', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'pop', keys: ['ShiftLeft', 'ShiftRight'] }, // Space is the default return-to-spawn key
  { name: 'kickflip', keys: ['KeyF'] },
  { name: 'varial', keys: ['KeyG'] },
  { name: 'tre', keys: ['KeyT'] },
  { name: 'shove', keys: ['KeyV'] },
  { name: 'fs180', keys: ['KeyE'] },
  { name: 'revert', keys: ['KeyQ'] },
];

// Dev-only handle for poking at the live state from the browser console.
if (import.meta.env.DEV) window.__skate = { board, phone };

export default function Display() {
  useEffect(() => {
    const s = connect('display');
    s.on('connect', () => (net.connected = true));
    s.on('disconnect', () => (net.connected = false));
    s.on('status', (st) => (net.controllers = st.controllers));
    s.on('tilt', (d) => {
      Object.assign(phone, d);
      phone.lastUpdate = performance.now();
      phone.packets++;
    });
    s.on('push', (d) => (phone.pushQueued = Math.min(3, phone.pushQueued + (d?.power ?? 1))));
    s.on('pop', (d) => (phone.popQueued = d?.power ?? 1));
    s.on('trick', (d) => d?.type && (phone.trickQueued = { type: d.type, side: d.side ?? 1 }));
    s.on('revert', (d) => (phone.revertQueued = d?.dir ?? 1));
    s.on('reset', () => (phone.resetQueued = true));
    // Mirror the deck's rotation to the phone's 3D board (~30 Hz, only while a phone is connected).
    const mirror = setInterval(() => {
      if (net.connected && net.controllers > 0) s.volatile.emit('board', board.view);
    }, 33);
    return () => {
      clearInterval(mirror);
      s.disconnect();
    };
  }, []);

  // Rebindable spawn keys (settings.js; change them in the HUD's Controls panel).
  useEffect(() => {
    const onKey = (e) => {
      if (commands.rebinding || e.repeat) return;
      if (e.code === settings.returnKey) commands.toSpawn = true;
      else if (e.code === settings.setSpawnKey) commands.setSpawn = true;
      else return;
      e.preventDefault(); // e.g. stop Space from scrolling or re-clicking a focused button
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <KeyboardControls map={keyMap}>
      <div className="display">
        <Canvas
          shadows
          flat
          dpr={[1, 2]}
          camera={{ position: [4, 1.1, -17], fov: 50, near: 0.05, far: 1500 }}
          gl={{ powerPreference: 'high-performance' }}
          onCreated={({ gl }) => (gl.toneMappingExposure = 1.1)}
        >
          <Suspense fallback={null}>
            <Physics gravity={[0, -GRAVITY, 0]}>
              <World />
              <Skateboard />
            </Physics>
            <CameraRig />
            <Effects />
          </Suspense>
        </Canvas>
        <Hud />
      </div>
    </KeyboardControls>
  );
}
