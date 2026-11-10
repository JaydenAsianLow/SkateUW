import { useEffect, useRef, useState } from 'react';
import { board } from '../state.js';
import { SettingsPanel } from './Menus.jsx';

// ?clean hides the overlay (for screenshots against the DESIGN.md reference).
const CLEAN = new URLSearchParams(window.location.search).has('clean');

// In-game overlay: just Settings and Main menu buttons, plus the trick callout and the manual meter.
export default function Hud({ onMenu }) {
  const [trick, setTrick] = useState(null);
  const [open, setOpen] = useState(false);
  const [foot, setFoot] = useState('ride'); // board.view.mode: walking back to the board after a fall?

  // Poll the shared mutable state at 10Hz for the trick callout.
  useEffect(() => {
    const id = setInterval(() => {
      const t = board.trick && performance.now() - board.trick.at < 1400 ? board.trick : null;
      setTrick((cur) => (cur?.at === t?.at ? cur : t));
      setFoot(board.view.mode ?? 'ride');
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
      </div>
      {open && (
        <div className="hud-panel">
          <SettingsPanel inGame />
        </div>
      )}
      {(foot === 'find' || foot === 'near') && (
        <div className="foot-hint">{foot === 'near' ? 'Walk onto your board, or tap Get on (B)' : 'Walk back to your board'}</div>
      )}
      <BalanceMeter />
    </>
  );
}

// Manual meter (top centre, styled like a game "accuracy" bar): the needle follows how far the phone is leant
// back. Middle green = keep manualing, yellow = getting close, left end = front wheels drop, right end = bail.
// Hides straight away on a push (which ends the manual), otherwise lingers a moment after the wheels come down.
function BalanceMeter() {
  const wrap = useRef(null);
  const needle = useRef(null);
  useEffect(() => {
    let raf;
    let shownUntil = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = board.anim;
      const now = performance.now();
      if ((a.balance ?? -1) >= 0) shownUntil = now + 700;
      if (a.pushT >= 0 || a.air) shownUntil = 0;
      if (wrap.current) wrap.current.style.opacity = now < shownUntil ? '1' : '0';
      if (needle.current) needle.current.style.left = `${(a.meter ?? 0) * 100}%`;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={wrap} className="balance">
      <div className="balance-label">★ MANUAL ★</div>
      <div className="balance-frame">
        <div className="balance-bar" />
        <div ref={needle} className="balance-needle" />
      </div>
      <div className="balance-ends">
        <span>WHEELS DOWN</span>
        <span>BAIL</span>
      </div>
    </div>
  );
}
