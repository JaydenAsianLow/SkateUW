import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { connect, displayRoom } from '../socket.js';
import { board, game, haptics, phone, net, phoneIsLive } from '../state.js';
import { commands, onSettings, settings, updateSettings } from '../settings.js';
import { cleanSetting, sharedOnly } from '../shared.js';
import { PHONE_EVENTS, applyPhoneEvent } from '../phoneEvents.js';
import World from './World.jsx';
import Skateboard from './Skateboard.jsx';
import RayCheck from './RayCheck.jsx';
import { GrindTest, Labels, RideTest } from './DevTools.jsx';
import GrindLines from './grind/GrindLines.jsx';
import { GRAVITY } from './tuning.js';
import CameraRig from './CameraRig.jsx';
import Effects from './Effects.jsx';
import Hud from './Hud.jsx';
import { ControlsList, MainMenu, PairScreen, PhoneLost } from './Menus.jsx';
import ControlsGuide from '../guide/ControlsGuide.jsx';
import PinnedDemo from '../guide/PinnedDemo.jsx';
import { savePinnedClip } from '../guide/engine.js';
import { guidePrefs, onGuidePrefs, setGuidePrefs } from '../guide/prefs.js';
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
  { name: 'varial', keys: ['KeyR'] }, // (G shows the grind lines: grind/GrindLines.jsx)
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
if (import.meta.env.DEV) window.__skate = { board, phone, haptics, net, game };

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
  const [guide, setGuide] = useState(false); // the Controls guide is open: the game pauses and stops drawing
  const [gprefs, setGprefs] = useState(() => ({ ...guidePrefs })); // the pinned demo and its setting (guide/prefs.js)
  useEffect(() => onGuidePrefs(setGprefs), []);
  // Pin to side (in a demo): close the guide and keep a small copy of that demo beside the game.
  const pinDemo = (id) => {
    const old = guidePrefs.pin;
    setGuidePrefs({ pin: { id, side: old?.side ?? 'right', size: old?.size ?? 'small' }, showPinned: true });
    savePinnedClip(id);
    setGuide(false);
  };
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
  const running = screen === 'play' && !phoneLost && !guide;
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
    // Shared settings (stance, truck sensitivity, ...) go to the phone; the server caches them for late joiners.
    const sendConfig = () => s.emit('config', sharedOnly(settings));
    const offSettings = onSettings(sendConfig);
    s.on('connect', () => ((net.connected = true), sendConfig()));
    s.on('disconnect', () => (net.connected = false));
    s.on('status', (st) => (net.controllers = st.controllers));
    s.on('tilt', (d) => {
      Object.assign(phone, d);
      phone.lastUpdate = performance.now();
      phone.packets++;
    });
    s.on('setting', (d) => {
      const value = cleanSetting(d?.key, d?.value);
      if (value !== undefined) updateSettings({ [d.key]: value });
    });
    // Moves (push, pop, trick, ...): the same handler the Controls guide's demos use (phoneEvents.js).
    for (const ev of PHONE_EVENTS) s.on(ev, (d) => applyPhoneEvent(ev, d));
    // Mirror the deck's rotation to the phone's 3D board (~30 Hz, only while a phone is connected).
    const mirror = setInterval(() => {
      // Only while actually playing, so a second laptop tab (menu, paused) never contradicts the game's state.
      if (net.connected && net.controllers > 0 && game.running) {
        s.volatile.emit('board', board.view);
        for (const type of haptics) s.emit('haptic', { type }); // not volatile: it would be dropped right after 'board'
      }
      haptics.length = 0;
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
      if (e.repeat || !game.running) return;
      if (e.code === 'Space' && performance.now() < (board.timingUntil ?? 0)) {
        // Space taps the timing bar on a long grind (never back to spawn mid-grind, nor from a tap just after it)
        phone.tapQueued = true;
        e.preventDefault();
        return;
      }
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
          frameloop={guide ? 'never' : 'always'} // hidden behind the guide: don't spend the GPU on it
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
              <GrindLines />
              <Skateboard />
              {import.meta.env.DEV && urlParams.has('raycheck') && <RayCheck />}
              {import.meta.env.DEV && urlParams.has('ridetest') && <RideTest />}
              {import.meta.env.DEV && urlParams.has('grindtest') && <GrindTest />}
              <CameraRig /> {/* inside Physics: it ray casts so it never ends up inside a wall */}
            </Physics>
            {import.meta.env.DEV && urlParams.has('labels') && <Labels />}
            <Effects />
          </Suspense>
        </Canvas>
        {CLEAN ? null : <>
        {/* the pinned demo goes under the HUD (its Settings panel opens over it) */}
        {screen === 'play' && running && gprefs.showPinned && gprefs.pin && <PinnedDemo pin={gprefs.pin} />}
        {screen === 'play' && <Hud onMenu={toMenu} onControls={() => setGuide(true)} />}
        {screen === 'menu' && <MainMenu onPlay={() => setScreen(status.ready ? 'play' : 'pair')} onControls={() => setGuide(true)} />}
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
        {guide && (
          <ControlsGuide onClose={() => setGuide(false)} onPin={pinDemo} footer={<AllKeys />} />
        )}
        </>}
        {/* ODbL attribution for the OpenStreetMap layout (MAP.md §6). Always visible. */}
        <div className="osm-credit">Red Square, UW · Map data © OpenStreetMap contributors</div>
      </div>
    </KeyboardControls>
  );
}

// The whole list as text, at the bottom of the guide (phone moves and keyboard keys).
function AllKeys() {
  return (
    <details className="guide-list">
      <summary>Every control as a list</summary>
      <ControlsList />
    </details>
  );
}
