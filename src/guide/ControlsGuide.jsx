import { useEffect, useRef, useState } from 'react';
import DemoView from './DemoView.jsx';
import { CARDS, GROUPS } from './demos.js';
import { getClip, onClips, pauseAll, prepare, prepareAll } from './engine.js';
import './guide.css';

// The Controls guide: a card for every move, grouped (Basics, Tricks, ...). Each card loops a short clip of the real
// skater doing the move (recorded once from the demo scene, engine.js). Clicking a card opens its demo.
// where: 'laptop' | 'phone' (the phone page opens the same guide on its own screen). onPin(id): pin a demo to the
// side of the screen while playing (laptop only). startWith: open this demo straight away.
export default function ControlsGuide({ onClose, where = 'laptop', onPin, footer, startWith = null }) {
  const [open, setOpen] = useState(startWith);
  useEffect(() => {
    prepareAll();
    return () => pauseAll();
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.demo-view')) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`guide ${where}`} role="dialog" aria-modal="true" aria-label="Controls">
      <div className="guide-inner">
        <header className="guide-head">
          <div>
            <h2>Controls</h2>
            <p>Pick a move to see how to do it on the phone.</p>
          </div>
          <button className="guide-close" onClick={onClose} aria-label="Close the controls guide">
            ✕
          </button>
        </header>
        <div className="guide-scroll">
          {GROUPS.map((g) => (
            <section key={g} className="guide-group">
              <h3>{g}</h3>
              <div className="guide-grid">
                {CARDS.filter((d) => d.group === g).map((d) => (
                  <Card key={d.id} demo={d} onOpen={() => setOpen(d.id)} />
                ))}
              </div>
            </section>
          ))}
          {footer}
        </div>
      </div>
      {open && <DemoView id={open} onClose={() => setOpen(null)} onOpen={setOpen} onPin={onPin} />}
    </div>
  );
}

export const TAG_CLASS = { TILT: 'tilt', TAP: 'tap', SWIPE: 'swipe', 'HALF-CIRCLE': 'arc', JOYSTICK: 'stick' };

export function InputTag({ input }) {
  return <span className={`input-tag ${TAG_CLASS[input] ?? ''}`}>{input}</span>;
}

function Card({ demo, onOpen }) {
  return (
    <button className="guide-card" onClick={onOpen} onPointerEnter={() => prepare([demo.id])} onFocus={() => prepare([demo.id])}>
      <ClipView id={demo.id} className="card-clip" />
      <span className="card-name">{demo.name}</span>
      <InputTag input={demo.input} />
    </button>
  );
}

// --- Clips: a recorded demo looping as a sprite sheet. One shared timer moves every clip on screen. ------------

const views = new Set();
let raf = 0;
function tick(now) {
  raf = views.size ? requestAnimationFrame(tick) : 0;
  for (const v of views) v(now);
}

export function useClip(id) {
  const [clip, setClip] = useState(() => getClip(id));
  useEffect(() => {
    setClip(getClip(id));
    return onClips(() => setClip(getClip(id)));
  }, [id]);
  return clip;
}

// onTime(t): the clip's time (s) as it plays, for things drawn in step with it (the pinned demo's phone).
export function ClipView({ id, className = '', onTime, playing = true }) {
  const ref = useRef(null);
  const clip = useClip(id);
  const timeRef = useRef(onTime);
  timeRef.current = onTime;
  useEffect(() => {
    const el = ref.current;
    if (!clip || !el || !playing) return;
    const start = performance.now();
    let shown = -1;
    const v = (now) => {
      const t = ((now - start) / 1000) % clip.length;
      const k = Math.min(clip.n - 1, Math.floor(t * clip.fps));
      if (k !== shown) {
        shown = k;
        const c = k % clip.cols, r = Math.floor(k / clip.cols);
        el.style.backgroundPosition = `${(c / (clip.cols - 1)) * 100}% ${clip.rows > 1 ? (r / (clip.rows - 1)) * 100 : 0}%`;
      }
      timeRef.current?.(t);
    };
    views.add(v);
    if (!raf) raf = requestAnimationFrame(tick);
    return () => views.delete(v);
  }, [clip, playing]);
  return (
    <span
      ref={ref}
      className={`clip ${clip ? '' : 'loading'} ${className}`}
      style={clip ? { backgroundImage: `url(${clip.url})`, backgroundSize: `${clip.cols * 100}% ${clip.rows * 100}%` } : undefined}
      aria-hidden="true"
    />
  );
}
