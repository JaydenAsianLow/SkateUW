import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { connect } from '../socket.js';
import { createComboReader, createStrokeTracker } from './gestures.js';
import { MOVES } from '../moves.js';
import { SENSITIVITY, clampSensitivity } from '../sensitivity.js';

const SEND_HZ = 50;

// Tilt: steering is only the difference from the calibrated neutral pose (phone flat like a deck, top pointing
// forward). Uses gamma (left/right roll) and beta (nose up/down) in the phone's own frame, never alpha (the compass
// heading drifts), and never the screen rotation: the axes stay fixed to the phone even if the page rotates.
// A ±5° dead zone means a steady hand rides straight; full lock at the preset's range (Normal: 30°).
const DEADZONE_DEG = 5;
const CURVE = 1.25; // a little gentler near the centre
const SMOOTH = 0.18; // per-sample low-pass at 50 Hz (~0.1 s)
const CAL_MS = 500; // calibration: average the pose over this long
const shape = (deg, range) => {
  const over = Math.max(0, Math.abs(deg) - DEADZONE_DEG) / Math.max(1, range - DEADZONE_DEG);
  return Math.sign(deg) * Math.min(1, over) ** CURVE;
};

const clamp = (v, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));

export default function Controller() {
  const socketRef = useRef(null);
  const raw = useRef({ beta: 0, gamma: 0, has: false });
  const stick = useRef({ x: 0, y: 0 }); // on-foot joystick (right +, up +), sent with the tilt stream
  const offset = useRef(null); // calibrated neutral pose { beta, gamma }, null until calibrated
  const cal = useRef(null); // while calibrating: { until, beta, gamma, n }
  const [calState, setCalState] = useState('need'); // 'need' (show the calibrate screen) | 'measuring' | 'done'
  const [conn, setConn] = useState('connecting');
  const [displays, setDisplays] = useState(0);
  const [statusKnown, setStatusKnown] = useState(false); // got at least one status from the server
  const [leftOnPurpose, setLeftOnPurpose] = useState(false); // the player tapped Disconnect
  const leftRef = useRef(false);
  leftRef.current = leftOnPurpose;
  const [rtt, setRtt] = useState(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState({ steer: 0, lean: 0, beta: 0, gamma: 0 });
  const [sens, setSens] = useState(0); // sensitivity preset, set from the laptop's Settings
  const tiltRange = useRef(SENSITIVITY[sens].tilt);
  tiltRange.current = SENSITIVITY[sens].tilt;

  // Socket connection + latency ping.
  useEffect(() => {
    const s = connect('controller');
    socketRef.current = s;
    s.on('connect', () => setConn('connected'));
    s.on('disconnect', () => setConn('disconnected'));
    s.on('connect_error', () => setConn('error'));
    s.on('status', (st) => {
      setDisplays(st.displays);
      setStatusKnown(true);
    });
    s.on('config', (c) => setSens(clampSensitivity(c?.sensitivity)));
    // Closing the tab: tell the server right away instead of waiting for its heartbeat.
    const bye = () => s.disconnect();
    window.addEventListener('pagehide', bye);
    // Coming back to the tab (after locking the phone or switching apps): reconnect at once.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !s.connected && !leftRef.current) s.connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    const ping = setInterval(() => {
      if (!s.connected) return;
      const t0 = performance.now();
      s.emit('rtt', () => setRtt(Math.round(performance.now() - t0)));
    }, 2000);
    return () => {
      window.removeEventListener('pagehide', bye);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(ping);
      s.disconnect();
    };
  }, []);

  // Once started: stream tilt at SEND_HZ and refresh the on-screen readout.
  useEffect(() => {
    if (!started) return;
    let tick = 0;
    const sm = { steer: 0, lean: 0 };
    const id = setInterval(() => {
      const r = raw.current;
      if (!r.has) return;
      // Calibrating: average the pose; send neutral (no steering) meanwhile.
      const c = cal.current;
      if (c) {
        c.beta += r.beta;
        c.gamma += r.gamma;
        c.n++;
        if (performance.now() >= c.until) {
          offset.current = { beta: c.beta / c.n, gamma: c.gamma / c.n };
          cal.current = null;
          sm.steer = sm.lean = 0;
          setCalState('done');
          navigator.vibrate?.(30);
        }
      }
      const o = offset.current;
      const range = tiltRange.current;
      const steerT = o && !c ? shape(r.gamma - o.gamma, range) : 0;
      // lean < 0 = leaning back (top of the phone tilted up toward you) = manual. Verified on a real phone:
      // beta rises as the top edge comes up, so negate.
      const leanT = o && !c ? shape(-(r.beta - o.beta), range) : 0;
      sm.steer += (steerT - sm.steer) * SMOOTH;
      sm.lean += (leanT - sm.lean) * SMOOTH;
      const steer = clamp(Math.abs(sm.steer) < 0.01 ? 0 : sm.steer);
      const lean = clamp(Math.abs(sm.lean) < 0.01 ? 0 : sm.lean);
      const packet = { steer, lean, beta: r.beta, gamma: r.gamma, jx: stick.current.x, jy: stick.current.y };
      socketRef.current?.volatile.emit('tilt', packet);
      if (++tick % 5 === 0) setView(packet);
    }, 1000 / SEND_HZ);
    return () => clearInterval(id);
  }, [started]);

  async function start() {
    setError(null);
    if (!window.isSecureContext) {
      setError('Tilt sensors need HTTPS. Open the https:// address shown on the laptop.');
      return;
    }
    if (typeof DeviceOrientationEvent === 'undefined') {
      setError('This browser has no orientation sensor support.');
      return;
    }
    // iOS 13+ requires an explicit permission prompt triggered by a tap.
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') {
          setError('Motion permission was denied. Close the tab, reopen the page, and tap Allow.');
          return;
        }
      } catch (e) {
        setError('Could not request motion permission: ' + e.message);
        return;
      }
    }
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      raw.current = { beta: e.beta, gamma: e.gamma, has: true };
    });
    // Keep the screen awake while riding (best effort). The browser drops the lock whenever the tab is hidden,
    // so take it again each time the page comes back (otherwise the screen sleeps and the socket goes with it).
    const keepAwake = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock?.request('screen').catch(() => {
        /* not supported or refused, ignore */
      });
    };
    keepAwake();
    document.addEventListener('visibilitychange', keepAwake);
    // Lock to portrait where the browser allows it (Android, in fullscreen). Elsewhere a rotated page shows a
    // "turn back to portrait" card, and steering doesn't care anyway (it reads the phone's own axes).
    try {
      await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('portrait');
    } catch {
      /* not supported (iOS) or refused */
    }
    setStarted(true);
    setTimeout(() => {
      if (!raw.current.has) setError('No sensor data is arriving. Are you on a phone? Laptops have no tilt sensor.');
    }, 1500);
  }

  // Average the phone's pose over CAL_MS and use it as neutral (calibrate screen, Recalibrate, getting back on).
  function calibrate() {
    cal.current = { until: performance.now() + CAL_MS, beta: 0, gamma: 0, n: 0 };
    setCalState('measuring');
    navigator.vibrate?.(15);
  }

  // Disconnect on purpose: drop the socket (the laptop pauses and asks for the phone) until Reconnect is tapped.
  function disconnect() {
    setLeftOnPurpose(true);
    socketRef.current?.disconnect();
    navigator.vibrate?.(20);
  }
  function reconnect() {
    setLeftOnPurpose(false);
    setConn('connecting');
    socketRef.current?.connect();
  }

  // The game (laptop page or server) went away: shade the phone until it's back. Not while connecting at first,
  // and not after a deliberate Disconnect.
  // Debounced like the laptop's card, so a quick reconnect doesn't flash it.
  const gone =
    !leftOnPurpose && (conn === 'disconnected' || conn === 'error' || (conn === 'connected' && statusKnown && displays === 0));
  const [gameGone, setGameGone] = useState(false);
  useEffect(() => {
    setGameGone(false);
    if (!gone) return;
    const t = setTimeout(() => setGameGone(true), 2000);
    return () => clearTimeout(t);
  }, [gone]);

  const connLabel =
    conn === 'connected'
      ? `Connected${rtt != null ? ` · ${rtt} ms` : ''}`
      : conn === 'connecting'
        ? 'Connecting…'
        : leftOnPurpose
          ? 'Disconnected'
          : 'Disconnected, retrying…';

  return (
    <div className="ctrl">
      <header className="ctrl-head">
        <span className={`dot ${conn === 'connected' ? 'ok' : 'bad'}`} />
        <span>{connLabel}</span>
        <span className="muted">
          {displays > 0 ? `${displays} screen${displays > 1 ? 's' : ''}` : 'no screen open'}
        </span>
      </header>

      {leftOnPurpose ? (
        <div className="ctrl-start">
          <h1>Disconnected</h1>
          <p>The game is paused on the laptop until you reconnect.</p>
          <button className="big" onClick={reconnect}>
            Reconnect
          </button>
        </div>
      ) : !started ? (
        <div className="ctrl-start">
          <h1>Skate Controller</h1>
          <p>Hold the phone flat in portrait. Your screen is the deck: nose at the top, tail at the bottom.</p>
          <ul className="moves">
            {MOVES.map(([name, how]) => (
              <li key={name}>
                <b>{name}</b> {how}
              </li>
            ))}
          </ul>
          <button className="big" onClick={start}>
            Tap to start
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      ) : calState !== 'done' && !offset.current ? (
        <div className="ctrl-start cal">
          <h1>Calibrate</h1>
          <div className="cal-phone" aria-hidden="true">
            <div className="cal-deck" />
          </div>
          <p>
            Hold your phone like a skateboard: <b>flat, screen up, top of the phone pointing forward</b>. Keep it
            steady, then tap Calibrate.
          </p>
          <button className="big" onClick={calibrate} disabled={calState === 'measuring'}>
            {calState === 'measuring' ? 'Hold still…' : 'Calibrate'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <Deck
          socketRef={socketRef}
          stickRef={stick}
          steer={view.steer}
          calibrating={calState === 'measuring'}
          onCalibrate={calibrate}
          sens={sens}
          onDisconnect={disconnect}
          error={error}
        />
      )}
      <div className="rotate-back">Turn your phone back to portrait</div>
      {gameGone && (
        <div className="ctrl-lost">
          <div className="lost-card">
            <div className="lost-title">Reconnect device</div>
            <div className="lost-text">
              The game closed. Open it again on the laptop and this phone will reconnect by itself.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TRICK_LABEL = {
  kickflip: 'KICKFLIP',
  varial: 'VARIAL FLIP',
  tre: 'TRE FLIP',
  shove: 'POP SHOVE-IT',
  fs180: 'FRONTSIDE 180',
  bs180: 'BACKSIDE 180',
};
const STAGE_PIPS = { idle: 0, down: 1, pop: 2, trick: 3 };
const TRAIL_MS = 350;
const HOLD_MS = 90; // a finger resting this long counts as holding
const HOLD_SLOP_PX = 14;

// The phone screen as a skateboard deck. Swipes on it are read as pushes and tricks.
function Deck({ socketRef, stickRef, steer, calibrating, onCalibrate, sens, onDisconnect, error }) {
  const deckRef = useRef(null); // the touch surface (fixed; the 3D board moves underneath it)
  const canvasRef = useRef(null);
  const boardRef = useRef(null);
  const shadowRef = useRef(null);
  // Latest deck rotation from the laptop (radians / metres), and what's currently drawn (smoothed).
  const mirror = useRef({ target: null, at: 0, shown: { roll: 0, pitch: 0, yaw: 0, spin: 0, lift: 0, height: 0 } });
  const steerRef = useRef(steer);
  steerRef.current = steer;
  // From the laptop: 'ride' (on the board) | 'carry' (on foot, board in hand) | 'find' (on foot, board on the ground)
  // | 'off' (down after a fall). The phone only follows the laptop, and only once two packets in a row agree.
  const [mode, setMode] = useState('ride');
  const pendingMode = useRef({ mode: 'ride', n: 0 });
  const onFoot = mode !== 'ride'; // joystick instead of the deck

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
    const onBoard = (d) => {
      mirror.current.target = d;
      mirror.current.at = performance.now();
      const m = d.mode ?? 'ride';
      const pm = pendingMode.current;
      pm.n = pm.mode === m ? pm.n + 1 : 1;
      pm.mode = m;
      if (pm.n >= 2) setMode(m);
    };
    s.on('board', onBoard);
    return () => s.off('board', onBoard);
  }, [socketRef]);

  // Back on the board: recalibrate (however you held the phone on foot, the deck pose is the new neutral).
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current !== 'ride' && mode === 'ride') onCalibrate();
    prevMode.current = mode;
  }, [mode, onCalibrate]);
  const trail = useRef([]); // { x, y, t, id }
  const touches = useRef(new Map()); // id -> { x0, y0, t0, x, y, moved }
  const [flash, setFlash] = useState(null); // { label, key }
  const [pips, setPips] = useState(0);
  const pipsTimer = useRef(0);

  // Every finger on the deck, with whether it's resting still right now (anywhere: a hold for the tre flip).
  const pointers = () => {
    const now = performance.now();
    return [...touches.current.entries()].map(([id, p]) => ({ id, holding: now - p.restT > HOLD_MS }));
  };

  // Gesture pipeline: pointers -> segments / arcs -> moves -> socket.
  const reader = useRef(null);
  if (!reader.current) {
    const send = (event, data, label, buzz) => {
      socketRef.current?.emit(event, data);
      navigator.vibrate?.(buzz);
      setFlash({ label, key: performance.now() });
    };
    reader.current = createComboReader({
      pointers,
      onPush: (power) => send('push', { power }, 'PUSH', 12),
      onPop: (power) => send('pop', { power }, 'OLLIE', 30),
      onTrick: (type, side) => send('trick', { type, side }, TRICK_LABEL[type] ?? type, [15, 30, 15]),
      onRevert: (dir) => send('revert', { dir }, 'REVERT', [10, 20, 10]),
      onStage: (stage) => {
        setPips(STAGE_PIPS[stage] ?? 0);
        clearTimeout(pipsTimer.current);
        pipsTimer.current = setTimeout(() => setPips(0), 600);
      },
    });
  }
  const tracker = useMemo(
    () =>
      createStrokeTracker({
        onSegment: (ev) => reader.current.segment(ev),
        onArc: (ev) => reader.current.arc(ev),
        minSegPx: Math.max(16, window.innerHeight * SENSITIVITY[sens].swipe),
      }),
    [sens],
  );

  // Draw the finger trails and holding fingers.
  useEffect(() => {
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvasRef.current;
      const el = deckRef.current;
      if (!c || !el) return;
      const dpr = window.devicePixelRatio || 1;
      const r = el.getBoundingClientRect();
      if (c.width !== Math.round(r.width * dpr)) (c.width = Math.round(r.width * dpr)), (c.height = Math.round(r.height * dpr));
      drawBoard(r);
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      const now = performance.now();
      const pts = (trail.current = trail.current.filter((p) => now - p.t < TRAIL_MS));
      ctx.lineCap = 'round';
      const prev = new Map();
      for (const p of pts) {
        const q = prev.get(p.id);
        prev.set(p.id, p);
        if (!q) continue;
        const a = 1 - (now - p.t) / TRAIL_MS;
        ctx.strokeStyle = `rgba(45, 246, 255, ${a * 0.9})`;
        ctx.lineWidth = 4 + a * 10;
        ctx.beginPath();
        ctx.moveTo(q.x - r.left, q.y - r.top);
        ctx.lineTo(p.x - r.left, p.y - r.top);
        ctx.stroke();
      }
      for (const p of pointers()) {
        if (!p.holding) continue;
        const t = touches.current.get(p.id);
        ctx.strokeStyle = 'rgba(255, 61, 242, 0.9)'; // a resting finger: hold for the tre flip
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(t.x - r.left, t.y - r.top, 30 + Math.sin(now / 120) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    // The 3D board: same rotation as the deck on the laptop (or just the local tilt with no laptop data).
    // Deck axes -> screen: deck +X (toe side) = right, deck -Z (nose) = up, deck +Y (grip side) = toward you,
    // a mirror swap, so every rotation flips sign.
    const drawBoard = (r) => {
      const b = boardRef.current;
      if (!b) return;
      const m = mirror.current;
      const live = m.target && performance.now() - m.at < 600;
      const t = live ? m.target : { roll: -steerRef.current * 0.12, pitch: 0, yaw: 0, spin: 0, lift: 0, height: 0 };
      const sh = m.shown;
      for (const k of Object.keys(sh)) {
        const d = t[k] - sh[k];
        // Follow closely; snap on big jumps (a finished flip resets from 2π to 0 and must not spin back).
        sh[k] = Math.abs(d) > 1.5 ? t[k] : sh[k] + d * 0.45;
      }
      const pxPerM = b.offsetHeight / 0.8; // the deck is 0.8 m long
      const up = (sh.lift + Math.min(sh.height, 1.2)) * pxPerM * 0.25; // rises toward you in the air
      b.style.transform =
        `translate(-50%, -50%) rotateZ(${-(sh.spin + sh.yaw)}rad) translateZ(${up}px) ` +
        `rotateX(${-sh.pitch}rad) rotateY(${-sh.roll}rad)`;
      const sd = shadowRef.current;
      if (sd) {
        const k = 1 / (1 + up / 400);
        sd.style.transform =
          `translate(-50%, -50%) translate(${up * 0.25}px, ${up * 0.35}px) rotateZ(${-(sh.spin + sh.yaw)}rad) ` +
          `scale(${k * Math.max(0.15, Math.abs(Math.cos(sh.roll)))}, ${k * Math.max(0.3, Math.abs(Math.cos(sh.pitch)))})`;
        sd.style.opacity = String(0.55 * k);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const t = performance.now();
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY, restX: e.clientX, restY: e.clientY, restT: t });
    tracker.down(e.pointerId, e.clientX, e.clientY, t);
    trail.current.push({ x: e.clientX, y: e.clientY, t, id: e.pointerId });
  };
  const onMove = (e) => {
    const tp = touches.current.get(e.pointerId);
    if (!tp) return;
    const t = performance.now();
    // Coalesced events give the full-rate finger path on browsers that support it.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      tracker.move(e.pointerId, ev.clientX, ev.clientY, t);
      trail.current.push({ x: ev.clientX, y: ev.clientY, t, id: e.pointerId });
    }
    tp.x = e.clientX;
    tp.y = e.clientY;
    // Moved off the spot it was resting on: it's moving again (rest starts over from here).
    if (Math.hypot(tp.x - tp.restX, tp.y - tp.restY) > HOLD_SLOP_PX) (tp.restX = tp.x), (tp.restY = tp.y), (tp.restT = t);
  };
  const onUp = (e) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.delete(e.pointerId);
    tracker.up(e.pointerId);
  };

  // Get off / Get on (one button). The laptop decides whether it happens (not mid-air, close enough to the board).
  const getOnOff = () => {
    socketRef.current?.emit('carry');
    navigator.vibrate?.(25);
    if (mode === 'find') setFlash({ label: 'WALK TO YOUR BOARD', key: performance.now() });
  };

  const reset = () => {
    socketRef.current?.emit('reset');
    navigator.vibrate?.([40, 40, 40]);
    setFlash({ label: 'RESET', key: performance.now() });
  };

  return (
    <div className="deck-wrap">
      {onFoot ? (
        <Joystick
          stickRef={stickRef}
          flash={flash}
          hint={mode === 'off' ? 'Getting up…' : mode === 'find' ? 'Walk to your board to pick it up' : 'Push a little to walk, all the way to run'}
        />
      ) : (
        <div
          ref={deckRef}
          className="deck-stage"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div ref={shadowRef} className="board-shadow" />
          <Board3D ref={boardRef} />
          <div className="combo">
            {['↓', '↑', '★'].map((g, i) => (
              <span key={g} className={`pip ${i < pips ? 'on' : ''}`}>
                {g}
              </span>
            ))}
          </div>
          {flash && (
            <div key={flash.key} className="move-flash">
              {flash.label}
            </div>
          )}
          <canvas ref={canvasRef} className="deck-trail" />
        </div>
      )}
      {/* Fires on touch-down, not click: phones don't send a click for a tap while another finger is on the screen
          (your thumb on the joystick), so a click-only button ignored Get on while running. */}
      <button
        className="onoff-btn"
        onPointerDown={(e) => {
          e.preventDefault();
          getOnOff();
        }}
        onClick={(e) => e.detail === 0 && getOnOff() /* keyboard Enter / Space */}
        disabled={mode === 'off' || mode === 'find'}
      >
        {mode === 'ride' ? 'Get off' : mode === 'carry' ? 'Get on' : 'Go to board'}
      </button>
      <div className="deck-foot">
        <button className="secondary small-btn" onClick={onCalibrate} disabled={calibrating}>
          {calibrating ? 'Hold still…' : 'Recalibrate'}
        </button>
        <button className="secondary small-btn" onClick={onDisconnect}>
          Disconnect
        </button>
        <span className="muted small">
          {steer >= 0 ? '+' : ''}
          {steer.toFixed(2)}
        </span>
        <button className="reset-btn" onClick={reset}>
          Reset
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// On-foot thumbstick: drag the knob anywhere in the area; distance from the centre = speed (walk -> run), direction is
// relative to the laptop's camera. Written straight to the DOM and a ref (no React state) so it tracks the thumb with no
// lag; the knob springs back and the skater stops when you let go.
function Joystick({ stickRef, hint, flash }) {
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const active = useRef(null);
  const set = (dx, dy, spring) => {
    const k = knobRef.current;
    if (!k) return;
    k.style.transition = spring ? 'transform 120ms ease-out' : 'none';
    k.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const track = (e) => {
    const b = baseRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const max = r.width * 0.32;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) (dx *= max / len), (dy *= max / len);
    stickRef.current = { x: dx / max, y: -dy / max };
    set(dx, dy, false);
  };
  const release = (e) => {
    if (e.pointerId !== active.current) return;
    active.current = null;
    stickRef.current = { x: 0, y: 0 };
    set(0, 0, true);
  };
  useEffect(() => () => (stickRef.current = { x: 0, y: 0 }), [stickRef]);
  return (
    <div
      className="stick-zone"
      onPointerDown={(e) => {
        if (active.current != null) return;
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        track(e);
      }}
      onPointerMove={(e) => e.pointerId === active.current && track(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div ref={baseRef} className="stick-base">
        <div className="stick-ring" />
        <div ref={knobRef} className="stick-knob" />
      </div>
      <div className="stick-hint">{hint}</div>
      {flash && (
        <div key={flash.key} className="move-flash">
          {flash.label}
        </div>
      )}
    </div>
  );
}

// A skateboard built from layers in CSS 3D: grip on top, maple plies for thickness, graphic + trucks underneath.
const PLIES = [1.5, 3, 4.5, 6, 7.5];
const Board3D = forwardRef(function Board3D(_, ref) {
  return (
    <div ref={ref} className="board3d">
      {PLIES.map((z, i) => (
        <div key={z} className="board-ply" style={{ transform: `translateZ(${-z}px)`, filter: `brightness(${1 - i * 0.06})` }} />
      ))}
      <div className="board-face board-under">
        <div className="under-graphic">
          <span>RED</span>
          <span>SQUARE</span>
        </div>
        {['nose', 'tail'].map((end) => (
          <div key={end} className={`truck ${end}`}>
            <i className="wheel l" />
            <i className="hanger" />
            <i className="wheel r" />
            <i className="baseplate" />
          </div>
        ))}
      </div>
      <div className="board-face board-grip">
        <Bolts top />
        <Bolts />
      </div>
    </div>
  );
});

function Bolts({ top }) {
  return (
    <div className={`bolts ${top ? 'top' : 'bottom'}`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} />
      ))}
    </div>
  );
}
