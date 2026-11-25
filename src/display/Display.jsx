import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { connect, displayRoom } from '../socket.js';
import { board, game, phone, net, phoneIsLive } from '../state.js';
import { commands, onSettings, settings, updateSettings } from '../settings.js';
import { cleanSetting, sharedOnly } from '../shared.js';
import World from './World.jsx';
import Skateboard from './Skateboard.jsx';
import RayCheck from './RayCheck.jsx';
import { Labels, RideTest } from './DevTools.jsx';
import { GRAVITY } from './tuning.js';
import CameraRig from './CameraRig.jsx';
import Effects from './Effects.jsx';
import Hud from './Hud.jsx';
import { MainMenu, PairScreen, PhoneLost } from './Menus.jsx';
import { urlParams } from './util.js';

// Keyboard fallback so the scene can be tested without a phone.
const keyMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'back', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'pop', keys: ['ShiftLeft', 'ShiftRight'] }, // Space is the default return-to-spawn key
  { name: 'nollie', keys: ['KeyN'] },
  { name: 'jump', keys: ['Space'] }, // on foot with the board in hand (caveman: then B in the air)
  { name: 'kickflip', keys: ['KeyF'] },
  { name: 'varial', keys: ['KeyG'] },
  { name: 'tre', keys: ['KeyT'] },
  { name: 'shove', keys: ['KeyV'] },
  { name: 'fs180', keys: ['KeyE'] },
  { name: 'revert', keys: ['KeyQ'] },
  { name: 'carry', keys: ['KeyB'] },
];

// Dev only: ?play skips the menu and plays with the keyboard (handy with ?posetest / ?sidecam).
const SKIP_MENU = import.meta.env.DEV && urlParams.has('play');
// Dev: ?clean hides every overlay (menus, HUD) so screenshots show only the world.
const CLEAN = import.meta.env.DEV && urlParams.has('clean');

const LOST_GRACE_MS = 2000; // phone silent this long mid-game -> pause and show "Reconnect phone"

// Dev-only handle for poking at the live state from the browser console.
if (import.meta.env.DEV) window.__skate = { board, phone };

// Poll the shared mutable phone/server state at 10 Hz for the menus.
function usePhoneStatus() {
  const read = () => ({ connected: net.connected, controllers: net.controllers, live: phoneIsLive() });
  const [st, setSt] = useState(read);
  useEffect(() => {
    const id = setInterval(() => {
      const n = read();
      setSt((c) => (c.connected === n.connected && c.controllers === n.controllers && c.live === n.live ? c : n));
    }, 100);
    return () => clearInterval(id);
  }, []);
  return { ...st, ready: st.connected && st.controllers > 0 && st.live };
}

export default function Display() {
  const [screen, setScreen] = useState(SKIP_MENU ? 'play' : 'menu'); // 'menu' | 'pair' | 'play'
  const [keyboard, setKeyboard] = useState(SKIP_MENU);
  const status = usePhoneStatus();
  // Only call the phone lost after a short grace period, so Wi-Fi blips don't flash the red card.
  const [lostLong, setLostLong] = useState(false);
  const waiting = screen === 'play' && !keyboard && !status.ready;
  useEffect(() => {
    setLostLong(false);
    if (!waiting) return;
    const t = setTimeout(() => setLostLong(true), LOST_GRACE_MS);
    return () => clearTimeout(t);
  }, [waiting]);
  const phoneLost = waiting && lostLong;
  const running = screen === 'play' && !phoneLost;
  // Shared with the 3D scene; set after render (before the next frame) rather than during it.
  useLayoutEffect(() => {
    game.running = running;
    game.keyboard = keyboard;
  }, [running, keyboard]);

  // Pairing finishes on its own once the phone is streaming tilt.
  useEffect(() => {
    if (screen === 'pair' && status.ready) setScreen('play');
  }, [screen, status.ready]);

  const toMenu = () => {
    setKeyboard(false);
    setScreen('menu');
  };

  useEffect(() => {
    const s = connect('display', displayRoom);
    // Phone settings picked on the laptop (sensitivity) go to the phone; the server caches them for late joiners.
    const sendConfig = () => s.emit('config', { sensitivity: settings.sensitivity, ...sharedOnly(settings) });
    const offSettings = onSettings(sendConfig);
    s.on('connect', () => ((net.connected = true), sendConfig()));
    s.on('disconnect', () => (net.connected = false));
    s.on('status', (st) => (net.controllers = st.controllers));
    s.on('tilt', (d) => {
      Object.assign(phone, d);
      phone.lastUpdate = performance.now();
      phone.packets++;
    });
    s.on('push', (d) => (phone.pushQueued = Math.min(3, phone.pushQueued + (d?.power ?? 1))));
    s.on('pop', (d) => ((phone.popQueued = d?.power ?? 1), (phone.popNose = d?.nose === true)));
    s.on('setting', (d) => {
      const value = cleanSetting(d?.key, d?.value);
      if (value !== undefined) updateSettings({ [d.key]: value });
    });
    s.on('trick', (d) => d?.type && (phone.trickQueued = { type: d.type, side: d.side ?? 1 }));
    s.on('revert', (d) => (phone.revertQueued = d?.dir ?? 1));
    s.on('reset', () => (phone.resetQueued = true));
    s.on('carry', () => (phone.carryQueued = true));
    s.on('jump', () => (phone.jumpQueued = true));
    // Mirror the deck's rotation to the phone's 3D board (~30 Hz, only while a phone is connected).
    const mirror = setInterval(() => {
      // Only while actually playing, so a second laptop tab (menu, paused) never contradicts the game's state.
      if (net.connected && net.controllers > 0 && game.running) s.volatile.emit('board', board.view);
    }, 33);
    // Closing the tab: say goodbye straight away so the phone shows "Reconnect device" at once
    // (otherwise the server only notices on its heartbeat timeout).
    const bye = () => s.disconnect();
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      clearInterval(mirror);
      offSettings();
      s.disconnect();
    };
  }, []);

  // Rebindable spawn keys (settings.js; change them in Settings). Only while riding.
  useEffect(() => {
    const onKey = (e) => {
      if (commands.rebinding || e.repeat || !game.running) return;
      if (e.code === 'Space' && board.view.mode === 'carry') return; // Space jumps on foot (board in hand)
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
          shadows="percentage" // PCF: what three.js uses anyway since it dropped PCFSoft (no console warning)
          flat
          dpr={[1, 1.5]} // above 1.5x the GPU cost grows ~4x for a barely visible gain on a laptop screen
          camera={{ position: [4, 1.1, -17], fov: 50, near: 0.05, far: 1500 }}
          // The effect chain renders into its own buffers and does its own anti-aliasing (SMAA), so the canvas's
          // multisampling would only cost memory and bandwidth.
          gl={{ powerPreference: 'high-performance', antialias: false }}
          onCreated={(state) => {
            state.gl.toneMappingExposure = 1.1;
            if (import.meta.env.DEV) window.__skate.three = state; // console / test access to the scene and camera
          }}
        >
          <Suspense fallback={null}>
            <Physics gravity={[0, -GRAVITY, 0]} paused={!running}>
              <World />
              <Skateboard />
              {import.meta.env.DEV && urlParams.has('raycheck') && <RayCheck />}
              {import.meta.env.DEV && urlParams.has('ridetest') && <RideTest />}
              <CameraRig /> {/* inside Physics: it ray casts so it never ends up inside a wall */}
            </Physics>
            {import.meta.env.DEV && urlParams.has('labels') && <Labels />}
            <Effects />
          </Suspense>
        </Canvas>
        {CLEAN ? null : <>
        {screen === 'play' && <Hud onMenu={toMenu} />}
        {screen === 'menu' && <MainMenu onPlay={() => setScreen(status.ready ? 'play' : 'pair')} />}
        {screen === 'pair' && (
          <PairScreen
            status={status}
            onBack={toMenu}
            onKeyboard={() => {
              setKeyboard(true);
              setScreen('play');
            }}
          />
        )}
        {phoneLost && <PhoneLost status={status} onMenu={toMenu} />}
        </>}
        {/* ODbL attribution for the OpenStreetMap layout (MAP.md §6). Always visible. */}
        <div className="osm-credit">Red Square, UW · Map data © OpenStreetMap contributors</div>
      </div>
    </KeyboardControls>
  );
}
