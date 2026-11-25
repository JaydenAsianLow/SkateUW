import { useEffect, useRef, useState } from 'react';
import { board } from '../state.js';
import { SettingsPanel } from './Menus.jsx';
import { manualPoints } from './tuning.js';
import { urlParams } from './util.js';

// ?clean hides the overlay (for screenshots against the DESIGN.md reference).
const CLEAN = urlParams.has('clean');

// In-game overlay: just Settings and Main menu buttons, plus the trick callout and the manual meter.
export default function Hud({ onMenu }) {
  const [trick, setTrick] = useState(null);
  const [open, setOpen] = useState(false);
  const [foot, setFoot] = useState('ride'); // board.view.mode: walking back to the board after a fall?
  const [score, setScore] = useState(0);

  // Poll the shared mutable state at 10Hz for the trick callout.
  useEffect(() => {
    const id = setInterval(() => {
      const t = board.trick && performance.now() - board.trick.at < 1400 ? board.trick : null;
      setTrick((cur) => (cur?.at === t?.at ? cur : t));
      setFoot(board.view.mode ?? 'ride');
      setScore(board.score);
    }, 100);
    return () => clearInterval(id);
  }, []);

  if (CLEAN) return null;
  const blur = (fn) => (e) => (e.currentTarget.blur(), fn());

  return (
    <>
      {trick && (
        <div key={trick.at} className={`trick-callout ${trick.name === 'BAIL' || trick.name === 'SLAM' ? 'bail' : ''}`}>
          {trick.name}
        </div>
      )}
      <div className="hud-bar">
        <button className={`hud-btn ${open ? 'on' : ''}`} onClick={blur(() => setOpen((o) => !o))}>
          Settings
        </button>
        <button className="hud-btn" onClick={blur(onMenu)}>
          Main menu
        </button>
        {score > 0 && <span className="hud-btn score">{score.toLocaleString()} pts</span>}
      </div>
      {open && (
        <div className="hud-panel">
          <SettingsPanel inGame />
        </div>
      )}
      {foot === 'find' && <div className="foot-hint">Walk to your board to pick it up</div>}
      <BalanceMeter />
    </>
  );
}

// Manual meter (top centre, styled like a game "accuracy" bar): the needle follows how far the phone is leant
// back; the green zone drifts and the needle has to stay in it (it flashes red while you're outside). Left end =
// front wheels drop, right end = bail. Under it: seconds held and the points so far.
// Hides straight away on a push (which ends the manual), otherwise lingers a moment after the wheels come down.
function BalanceMeter() {
  const wrap = useRef(null);
  const needle = useRef(null);
  const zone = useRef(null);
  const info = useRef(null);
  useEffect(() => {
    let raf;
    let shownUntil = 0;
    let shown = null;
    let meter = null;
    let text = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = board.anim;
      const now = performance.now();
      if ((a.balance ?? -1) >= 0) shownUntil = now + 700;
      if (a.pushT >= 0 || a.air) shownUntil = 0;
      // Only touch the DOM when something changed (this runs every frame).
      const show = now < shownUntil;
      if (wrap.current && show !== shown) {
        shown = show;
        wrap.current.style.opacity = show ? '1' : '0';
      }
      const m = a.meter ?? 0;
      if (needle.current && m !== meter) {
        meter = m;
        needle.current.style.left = `${m * 100}%`;
      }
      const z = a.zone;
      if (z && zone.current) {
        zone.current.style.left = `${(z.c - z.w) * 100}%`;
        zone.current.style.width = `${z.w * 200}%`;
        zone.current.classList.toggle('out', z.out > 0);
      }
      const t = a.manualT ?? 0;
      const s = t > 0 ? `${t.toFixed(1)}s · ${manualPoints(t)}` : text;
      if (info.current && s !== text) info.current.textContent = text = s;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={wrap} className="balance">
      <div className="balance-label">★ MANUAL ★</div>
      <div className="balance-frame">
        <div className="balance-bar">
          <div ref={zone} className="balance-zone" />
        </div>
        <div ref={needle} className="balance-needle" />
      </div>
      <div ref={info} className="balance-info" />
      <div className="balance-ends">
        <span>WHEELS DOWN</span>
        <span>BAIL</span>
      </div>
    </div>
  );
}
