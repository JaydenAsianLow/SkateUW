import { useLayoutEffect, useRef, useState } from 'react';
import { Board3D, deckTransforms, localTilt } from '../controller/Controller.jsx';
import { CHOICE_UI } from '../shared.js';
import { STEER_CURVE, TILT_DEADZONE_DEG, TILT_RANGE_DEG } from '../display/tuning.js';

// A drawing of the phone in the Controls guide, showing the phone page as it really looks (the same markup and CSS
// classes as controller/Controller.jsx: the deck with its 3D board, the joystick, the buttons, the TAP button and
// the Settings sheet), driven by a demo's phone record (driver.js) instead of real touches. On top: a finger doing
// the motion (with a trail on the deck), and the phone itself tilting for tilt moves.
//
// rec: this frame's record; history: the last half second of records (for the finger trail).
const W = 390, H = 800; // the drawn phone's screen, in CSS px (scaled to fit)
const TRAIL_S = 0.35;

// Shaped tilt (-1..1, what the phone sends) back to about how far the phone is tilted (degrees), for the drawing.
function tiltDeg(v) {
  if (Math.abs(v) < 0.005) return 0;
  return Math.sign(v) * (TILT_DEADZONE_DEG + Math.abs(v) ** (1 / STEER_CURVE) * (TILT_RANGE_DEG - TILT_DEADZONE_DEG));
}

export default function PhoneMock({ rec, history = [], small = false }) {
  const wrap = useRef(null);
  const screen = useRef(null);
  const [k, setK] = useState(0.5);
  // Fit the phone (screen plus its frame) into the space it has.
  useLayoutEffect(() => {
    const el = wrap.current;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const frame = 26;
      const pad = small ? 14 : 56; // room to tilt
      setK(Math.max(0.12, Math.min((r.width - pad) / (W + frame), (r.height - pad) / (H + frame))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [small]);

  const steer = rec?.tilt?.[0] ?? 0;
  const lean = rec?.tilt?.[1] ?? 0;
  const ry = tiltDeg(steer), rx = tiltDeg(lean);
  return (
    <div ref={wrap} className={`phone-mock ${small ? 'small' : ''}`}>
      <div className="pm-tilt" style={{ transform: `perspective(${2200 * k}px) rotateY(${ry}deg) rotateX(${rx}deg)` }}>
        <div className="pm-body" style={{ width: W * k + 26, height: H * k + 26 }}>
          <div ref={screen} className="pm-screen" style={{ width: W, height: H, transform: `scale(${k})` }}>
            <PhonePage rec={rec} history={history} screen={screen} />
          </div>
        </div>
      </div>
      <TiltHint steer={steer} lean={lean} />
    </div>
  );
}

// Arrows beside the phone for tilt moves: which way it's tilting.
function TiltHint({ steer, lean }) {
  const s = Math.abs(steer) > 0.06 ? (steer > 0 ? 'right' : 'left') : null;
  const l = lean < -0.06 ? 'up' : lean > 0.06 ? 'down' : null;
  return (
    <>
      <div className={`pm-arrow side left ${s === 'left' ? 'on' : ''}`}>⟲<small>tilt left</small></div>
      <div className={`pm-arrow side right ${s === 'right' ? 'on' : ''}`}>⟳<small>tilt right</small></div>
      <div className={`pm-arrow top ${l === 'up' ? 'on' : ''}`}>
        ⤺<small>top of the phone up</small>
      </div>
      <div className={`pm-arrow bottom ${l === 'down' ? 'on' : ''}`}>
        ⤻<small>top of the phone down</small>
      </div>
    </>
  );
}

const MODE_HINT = { off: 'Getting up…', find: 'Walk to your board to pick it up', carry: 'Push a little to walk, all the way to run' };

function PhonePage({ rec, history, screen }) {
  const refs = useRef({});
  const set = (name) => (el) => (refs.current[name] = el);
  const deck = useRef(null);
  const board = useRef(null);
  const shadow = useRef(null);
  const knobBase = useRef(null);
  const trail = useRef(null);
  const [, force] = useState(0);
  const mode = rec?.mode ?? 'ride';
  const onFoot = mode !== 'ride';
  const t = rec?.t ?? 0;
  const recent = (ev, s) => ev && t - ev.t >= 0 && t - ev.t < s;
  const press = rec?.press;
  const pressed = (name) => press && press.target === name && press.s >= 0 && press.s < 0.14;

  // The board and the trail are drawn after layout (they need the deck's size).
  useLayoutEffect(() => {
    const b = board.current;
    if (b && rec) {
      const tf = deckTransforms(rec.view, localTilt(rec.tilt[0], rec.tilt[1]), b.offsetHeight);
      b.style.transform = tf.board;
      if (shadow.current) (shadow.current.style.transform = tf.shadow), (shadow.current.style.opacity = tf.shadowOpacity);
    }
    drawTrail(trail.current, deck.current, history, t, rec?.ring);
  });
  // Re-measure once mounted (the finger needs the buttons' positions).
  useLayoutEffect(() => {
    force(1);
  }, []);

  // Where the finger is, in screen px (unscaled), and whether it's pressing.
  const fingers = [];
  const local = (el) => {
    if (!el || !screen.current) return null;
    const s = screen.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const sc = s.width / W || 1;
    return [(r.left + r.width / 2 - s.left) / sc, (r.top + r.height / 2 - s.top) / sc];
  };
  const deckPos = () => {
    const d = deck.current;
    if (!d || !screen.current) return null;
    const s = screen.current.getBoundingClientRect();
    const r = d.getBoundingClientRect();
    const sc = s.width / W || 1;
    return { x: (r.left - s.left) / sc, y: (r.top - s.top) / sc, w: r.width / sc, h: r.height / sc };
  };
  if (rec?.fingers?.length && !onFoot) {
    const d = deckPos();
    if (d) for (const [id, x, y] of rec.fingers) fingers.push({ key: `f${id}`, x: d.x + x * d.w, y: d.y + y * d.h, down: true });
  }
  if (press) {
    const p = local(refs.current[press.target]);
    if (p) {
      const s = press.s;
      const down = s >= 0 && s < 0.14;
      if (press.hover) fingers.push({ key: 'press', x: p[0] + (down ? 0 : 12), y: p[1] + (down ? 0 : 16), down });
      else if (s < 0.3) {
        // coming in over the button, pressing, lifting away
        const away = s < 0 ? Math.min(1, -s / 0.3) : s > 0.14 ? Math.min(1, (s - 0.14) / 0.16) : 0;
        fingers.push({ key: 'press', x: p[0] + away * 26, y: p[1] + away * 34, down, fade: s > 0.14 ? away : 0 });
      }
    }
  }
  if (rec?.stick && onFoot) {
    const p = local(knobBase.current);
    if (p) {
      const max = (knobBase.current.offsetWidth || 200) * 0.32;
      fingers.push({ key: 'stick', x: p[0] + rec.stick[0] * max, y: p[1] - rec.stick[1] * max, down: true });
    }
  }

  const flash = recent(rec?.flash, 0.7) ? rec.flash : null;
  const tapFlash = recent(rec?.tapFlash, 0.45) ? rec.tapFlash : null;
  const ring = recent(rec?.ring, 0.8) ? rec.ring : null;
  const knob = rec?.stick && knobBase.current ? rec.stick.map((v) => v * knobBase.current.offsetWidth * 0.32) : [0, 0];

  return (
    <div className="ctrl pm-page">
      <header className="ctrl-head">
        <span className="pill">
          <span className="dot ok" />
          Connected
        </span>
        <button className="pill gear guide-pill" tabIndex={-1}>
          Controls
        </button>
        <button ref={set('settings')} className={`pill gear ${pressed('settings') ? 'pm-pressed' : ''}`} tabIndex={-1}>
          Settings
        </button>
      </header>
      <div className="deck-wrap">
        {onFoot ? (
          <div className="stick-zone">
            <div ref={knobBase} className="stick-base">
              <div className="stick-ring" />
              <div className="stick-knob" style={{ transform: `translate(${knob[0]}px, ${-knob[1]}px)` }} />
            </div>
            <div className="stick-hint">{MODE_HINT[mode] ?? MODE_HINT.carry}</div>
            {flash && (
              <div key={`flash${flash.t}`} className="move-flash">
                {flash.label}
              </div>
            )}
          </div>
        ) : (
          <div ref={deck} className={`deck-stage ${ring ? (ring.ok ? 'pm-ring-ok' : 'pm-ring-bad') : ''}`}>
            <div className="deck-floor" />
            <span className="deck-label nose">▲ Nose</span>
            <div ref={shadow} className="board-shadow" />
            <Board3D ref={board} />
            <div className="combo">
              {['↓', '↑', '★'].map((g, i) => (
                <span key={g} className={`pip ${i < (rec?.pips ?? 0) ? 'on' : ''}`}>
                  {g}
                </span>
              ))}
            </div>
            {flash && (
              <div key={`flash${flash.t}`} className="move-flash">
                {flash.label}
              </div>
            )}
            <canvas ref={trail} className="deck-trail" />
            {ring && (
              <div key={`ring${ring.t}`} className={`pm-ring-label ${ring.ok ? 'ok' : 'bad'}`}>
                {ring.ok ? '✓ Half circle!' : '✕ Not finished'}
              </div>
            )}
            {rec?.tapOn && (
              <button ref={set('tap')} key={tapFlash?.t ?? 0} className={`tap-btn ${tapFlash ? tapFlash.kind : ''} ${pressed('tap') ? 'pm-pressed' : ''}`} tabIndex={-1}>
                TAP
                <small>when the marker is in the green</small>
              </button>
            )}
          </div>
        )}
        <div className="onoff-row">
          {mode === 'carry' && (
            <button ref={set('jump')} className={`onoff-btn jump ${pressed('jump') ? 'pm-pressed' : ''}`} tabIndex={-1}>
              Jump
            </button>
          )}
          <button ref={set('onoff')} className={`onoff-btn ${mode} ${pressed('onoff') ? 'pm-pressed' : ''}`} disabled={mode === 'off' || mode === 'find'} tabIndex={-1}>
            {mode === 'ride' ? 'Get off' : mode === 'carry' ? 'Get on' : 'Go to board'}
          </button>
        </div>
        <div className="deck-foot">
          <button className="secondary small-btn" tabIndex={-1}>
            Recalibrate
          </button>
          <button className="secondary small-btn" tabIndex={-1}>
            Disconnect
          </button>
          <button ref={set('view')} className={`secondary small-btn ${pressed('view') ? 'pm-pressed' : ''}`} tabIndex={-1}>
            View
          </button>
          <button ref={set('setspawn')} className={`secondary small-btn ${pressed('setspawn') ? 'pm-pressed' : ''}`} tabIndex={-1}>
            Set spawn
          </button>
          <button ref={set('tospawn')} className={`reset-btn ${pressed('tospawn') ? 'pm-pressed' : ''}`} tabIndex={-1}>
            To spawn
          </button>
        </div>
      </div>
      {rec?.sheet && (
        <div className="psheet">
          <div className="psheet-card">
            <div className="psheet-head">
              <b>Settings</b>
              <button ref={set('done')} className={`secondary small-btn ${pressed('done') ? 'pm-pressed' : ''}`} tabIndex={-1}>
                Done
              </button>
            </div>
            {CHOICE_UI.map(([key, label, names, hint]) => (
              <div className="psheet-row" key={key}>
                <span>{label}</span>
                <span className="psheet-btns">
                  {Object.entries(names).map(([v, text]) => (
                    <button key={v} ref={key === 'stance' ? set(v) : undefined} className={`chip ${rec[key] === v || (key === 'ragdoll' && v === 'on') ? 'on' : ''} ${key === 'stance' && pressed(v) ? 'pm-pressed' : ''}`} tabIndex={-1}>
                      {text}
                    </button>
                  ))}
                </span>
                {hint && <small className="muted">{hint}</small>}
              </div>
            ))}
          </div>
        </div>
      )}
      {fingers.map(({ key, ...f }) => (
        <Finger key={key} {...f} />
      ))}
    </div>
  );
}

// A see-through fingertip: the round contact spot and the finger above it.
function Finger({ x, y, down, fade = 0 }) {
  return (
    <div className={`pm-finger ${down ? 'down' : ''}`} style={{ left: x, top: y, opacity: 1 - fade }}>
      <span className="pm-finger-body" />
      <span className="pm-finger-tip" />
      {down && <span className="pm-finger-ripple" />}
    </div>
  );
}

// The finger trail on the deck (like the real page's light trail), with an arrow at its head, and the half circle's
// green (drawn right) / red (not finished) glow.
function drawTrail(c, deck, history, t, ring) {
  if (!c || !deck) return;
  const w = deck.offsetWidth, h = deck.offsetHeight;
  if (c.width !== w * 2) (c.width = w * 2), (c.height = h * 2);
  const ctx = c.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const okGlow = ring && t - ring.t < 0.8 ? ring.ok : null;
  const paths = new Map();
  for (const r of history) {
    if (t - r.t > TRAIL_S || r.t > t) continue;
    for (const [id, x, y] of r.fingers ?? []) {
      if (!paths.has(id)) paths.set(id, []);
      paths.get(id).push({ x: x * w, y: y * h, a: 1 - (t - r.t) / TRAIL_S });
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pts of paths.values()) {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = pts[i - 1];
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = okGlow === true ? `rgba(61, 220, 132, ${p.a * 0.5})` : okGlow === false ? `rgba(255, 90, 90, ${p.a * 0.5})` : `rgba(255, 106, 61, ${p.a * 0.45})`;
      ctx.lineWidth = 10 + p.a * 16;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 226, 170, ${p.a * 0.95})`;
      ctx.lineWidth = 3 + p.a * 5;
      ctx.stroke();
    }
    // Arrow at the head: which way the finger is going.
    if (pts.length >= 3) {
      const a = pts[pts.length - 1], b = pts[Math.max(0, pts.length - 4)];
      const dx = a.x - b.x, dy = a.y - b.y;
      const L = Math.hypot(dx, dy);
      if (L > 4) {
        const ux = dx / L, uy = dy / L;
        const tipX = a.x + ux * 22, tipY = a.y + uy * 22;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - ux * 18 - uy * 11, tipY - uy * 18 + ux * 11);
        ctx.lineTo(tipX - ux * 18 + uy * 11, tipY - uy * 18 - ux * 11);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 242, 214, 0.95)';
        ctx.fill();
      }
    }
  }
}
