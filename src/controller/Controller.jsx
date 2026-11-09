import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { connect } from '../socket.js';
import { createComboReader, createStrokeTracker } from './gestures.js';
import { MOVES } from '../moves.js';

const SEND_HZ = 50;

// Sensitivity presets: how far you tilt for full steering, and how short a swipe still counts
// (as a fraction of the screen height).
const SENSITIVITY = [
  { label: 'Normal', tilt: 38, swipe: 0.04 },
  { label: 'High', tilt: 28, swipe: 0.028 },
  { label: 'Max', tilt: 20, swipe: 0.02 },
];
// Tilt shaping: ignore small tilts and sensor jitter, ease in past that, and smooth the stream.
const DEADZONE_DEG = 7; // a phone lying still (or slightly off its calibration) doesn't steer
const CURVE = 1.6; // >1: gentle near the centre, full lock only near full tilt
const SMOOTH = 0.18; // per-sample low-pass at 50 Hz (lower = steadier)
const shape = (deg, range) => {
  const over = Math.max(0, Math.abs(deg) - DEADZONE_DEG) / Math.max(1, range - DEADZONE_DEG);
  return Math.sign(deg) * Math.min(1, over) ** CURVE;
};
const SENS_KEY = 'skate.sensitivity.v2'; // v2: calmer presets, start everyone on Normal
function loadSens() {
  try {
    const v = Number(localStorage.getItem(SENS_KEY));
    return Number.isInteger(v) && SENSITIVITY[v] ? v : 0;
  } catch {
    return 0;
  }
}

const clamp = (v, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));

// Map raw beta/gamma into screen-relative x (left/right) and y (front/back),
// so it still works if the phone is rotated to landscape.
function screenAxes(beta, gamma) {
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  switch (((angle % 360) + 360) % 360) {
    case 90: return { x: beta, y: -gamma };
    case 180: return { x: -gamma, y: -beta };
    case 270: return { x: -beta, y: gamma };
    default: return { x: gamma, y: beta };
  }
}

export default function Controller() {
  const socketRef = useRef(null);
  const raw = useRef({ beta: 0, gamma: 0, has: false });
  const offset = useRef(null); // calibration "neutral" pose
  const [conn, setConn] = useState('connecting');
  const [displays, setDisplays] = useState(0);
  const [rtt, setRtt] = useState(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState({ steer: 0, lean: 0, beta: 0, gamma: 0 });
  const [sens, setSens] = useState(loadSens);
  const tiltRange = useRef(SENSITIVITY[sens].tilt);
  tiltRange.current = SENSITIVITY[sens].tilt;

  // Socket connection + latency ping.
  useEffect(() => {
    const s = connect('controller');
    socketRef.current = s;
    s.on('connect', () => setConn('connected'));
    s.on('disconnect', () => setConn('disconnected'));
    s.on('connect_error', () => setConn('error'));
    s.on('status', (st) => setDisplays(st.displays));
    const ping = setInterval(() => {
      if (!s.connected) return;
      const t0 = performance.now();
      s.emit('rtt', () => setRtt(Math.round(performance.now() - t0)));
    }, 2000);
    return () => {
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
      const a = screenAxes(r.beta, r.gamma);
      if (!offset.current) offset.current = a; // auto-calibrate on first reading
      const range = tiltRange.current;
      sm.steer += (shape(a.x - offset.current.x, range) - sm.steer) * SMOOTH;
      // lean < 0 = leaning back (top edge tilted up toward you): brake or manual. Sign checked on a real phone.
      sm.lean += (shape(a.y - offset.current.y, range) - sm.lean) * SMOOTH;
      const steer = clamp(Math.abs(sm.steer) < 0.01 ? 0 : sm.steer);
      const lean = clamp(Math.abs(sm.lean) < 0.01 ? 0 : sm.lean);
      const packet = { steer, lean, beta: r.beta, gamma: r.gamma };
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
    // Motion (for shake-to-reset) is optional.
    try {
      await DeviceMotionEvent?.requestPermission?.();
    } catch {
      /* shake-to-reset just won't work */
    }
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      raw.current = { beta: e.beta, gamma: e.gamma, has: true };
    });
    // Keep the screen awake while riding (best effort).
    try {
      await navigator.wakeLock?.request('screen');
    } catch {
      /* not supported, ignore */
    }
    setStarted(true);
    setTimeout(() => {
      if (!raw.current.has) setError('No sensor data is arriving. Are you on a phone? Laptops have no tilt sensor.');
    }, 1500);
  }

  function calibrate() {
    offset.current = null; // next reading becomes the neutral pose
    navigator.vibrate?.(15);
  }

  function cycleSens() {
    const next = (sens + 1) % SENSITIVITY.length;
    setSens(next);
    try {
      localStorage.setItem(SENS_KEY, String(next));
    } catch {
      /* private mode: just don't remember it */
    }
    navigator.vibrate?.(10);
  }

  const connLabel =
    conn === 'connected'
      ? `Connected${rtt != null ? ` · ${rtt} ms` : ''}`
      : conn === 'connecting'
        ? 'Connecting…'
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

      {!started ? (
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
      ) : (
        <Deck
          socketRef={socketRef}
          steer={view.steer}
          onCalibrate={calibrate}
          sens={sens}
          onSens={cycleSens}
          error={error}
        />
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
const HOLD_MS = 90; // a finger resting this long without moving counts as holding
const HOLD_SLOP_PX = 14;

// The phone screen as a skateboard deck. Swipes on it are read as pushes and tricks.
function Deck({ socketRef, steer, onCalibrate, sens, onSens, error }) {
  const deckRef = useRef(null); // the touch surface (fixed; the 3D board moves underneath it)
  const canvasRef = useRef(null);
  const boardRef = useRef(null);
  const shadowRef = useRef(null);
  // Latest deck rotation from the laptop (radians / metres), and what's currently drawn (smoothed).
  const mirror = useRef({ target: null, at: 0, shown: { roll: 0, pitch: 0, yaw: 0, spin: 0, lift: 0, height: 0 } });
  const steerRef = useRef(steer);
  steerRef.current = steer;

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
    const onBoard = (d) => {
      mirror.current.target = d;
      mirror.current.at = performance.now();
    };
    s.on('board', onBoard);
    return () => s.off('board', onBoard);
  }, [socketRef]);
  const trail = useRef([]); // { x, y, t, id }
  const touches = useRef(new Map()); // id -> { x0, y0, t0, x, y, moved }
  const [flash, setFlash] = useState(null); // { label, key }
  const [pips, setPips] = useState(0);
  const pipsTimer = useRef(0);

  // Every finger on the deck, with whether it's resting in the top-right corner (tre flip hold).
  const pointers = () => {
    const r = deckRef.current?.getBoundingClientRect();
    const now = performance.now();
    return [...touches.current.entries()].map(([id, p]) => ({
      id,
      holding: !p.moved && now - p.t0 > HOLD_MS,
      topRight: !!r && p.x > r.left + r.width * 0.5 && p.y < r.top + r.height * 0.5,
    }));
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

  // Shake the phone to respawn (MAP.md §3).
  useEffect(() => {
    const peaks = [];
    let cooldown = 0;
    const onMotion = (e) => {
      const a = e.acceleration;
      const g = e.accelerationIncludingGravity;
      let mag = 0;
      if (a?.x != null) mag = Math.hypot(a.x, a.y, a.z);
      else if (g?.x != null) mag = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
      const now = performance.now();
      if (mag < 18 || now < cooldown) return;
      if (!peaks.length || now - peaks.at(-1) > 120) peaks.push(now);
      while (peaks.length && now - peaks[0] > 900) peaks.shift();
      if (peaks.length >= 3) {
        peaks.length = 0;
        cooldown = now + 2000;
        socketRef.current?.emit('reset');
        navigator.vibrate?.([40, 40, 40]);
        setFlash({ label: 'RESET', key: now });
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [socketRef]);

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
        ctx.strokeStyle = p.topRight ? 'rgba(255, 61, 242, 0.9)' : 'rgba(255, 255, 255, 0.35)';
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
    touches.current.set(e.pointerId, { x0: e.clientX, y0: e.clientY, t0: t, x: e.clientX, y: e.clientY, moved: false });
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
    if (!tp.moved && Math.hypot(tp.x - tp.x0, tp.y - tp.y0) > HOLD_SLOP_PX) tp.moved = true;
  };
  const onUp = (e) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.delete(e.pointerId);
    tracker.up(e.pointerId);
  };

  const reset = () => {
    socketRef.current?.emit('reset');
    navigator.vibrate?.([40, 40, 40]);
    setFlash({ label: 'RESET', key: performance.now() });
  };

  return (
    <div className="deck-wrap">
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
        <div className="hold-zone">HOLD</div>
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
      <div className="deck-foot">
        <button className="secondary small-btn" onClick={onCalibrate}>
          Calibrate
        </button>
        <button className="secondary small-btn" onClick={onSens}>
          {SENSITIVITY[sens].label}
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
