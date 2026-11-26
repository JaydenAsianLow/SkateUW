import { useEffect, useRef, useState } from 'react';
import { CARDS, demoById } from './demos.js';
import { playLive } from './engine.js';
import PhoneMock from './PhoneMock.jsx';
import { InputTag } from './ControlsGuide.jsx';

// One move's demo (opened from its card): the phone with the finger doing the motion on the left, the real game
// doing the move on the right (live from the demo scene, at the same moment), captions in time with it. It only
// plays: you can't control the demo scene. Replay, slow motion, previous / next move, pin to the side, close.
export default function DemoView({ id, onClose, onOpen, onPin }) {
  const base = demoById[id];
  const [extra, setExtra] = useState(false); // showing the second, small demo (what a mistake looks like)
  const demo = extra && base.extra ? demoById[base.extra] : base;
  const pane = useRef(null);
  const ctl = useRef(null);
  const hist = useRef([]);
  const [rec, setRec] = useState(null);
  const [slow, setSlow] = useState(false);
  const slowRef = useRef(slow);
  slowRef.current = slow;

  useEffect(() => setExtra(false), [id]);
  useEffect(() => {
    hist.current = [];
    setRec(null);
    const c = playLive(demo, pane.current, {
      speed: slowRef.current ? 0.5 : 1,
      onFrame: (r) => {
        const h = hist.current;
        if (h.length && r.t < h[h.length - 1].t) h.length = 0; // looped
        h.push(r);
        if (h.length > 40) h.splice(0, h.length - 40);
        setRec(r);
      },
    });
    ctl.current = c;
    return () => c.stop();
  }, [demo]);
  useEffect(() => {
    ctl.current?.setSpeed(slow ? 0.5 : 1);
  }, [slow]);

  const i = CARDS.findIndex((d) => d.id === base.id);
  const prev = CARDS[(i - 1 + CARDS.length) % CARDS.length];
  const next = CARDS[(i + 1) % CARDS.length];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onOpen(prev.id);
      else if (e.key === 'ArrowRight') onOpen(next.id);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onOpen, prev.id, next.id]);

  const t = rec?.t ?? 0;
  const caption = demo.captions.find((c) => t >= c.at && t < c.to);
  return (
    <div className="demo-view" role="dialog" aria-modal="true" aria-label={`${demo.name} demo`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="demo-card">
        <header className="demo-head">
          <div className="demo-title">
            <h2>{demo.name}</h2>
            <InputTag input={demo.input} />
          </div>
          <div className="demo-keys" title="The same move on the keyboard">
            Keyboard <kbd>{demo.keys}</kbd>
          </div>
        </header>
        <div className="demo-body">
          <div className="demo-phone">
            <PhoneMock rec={rec} history={hist.current} />
          </div>
          <div className="demo-game">
            <div ref={pane} className="demo-pane">
              {!rec && <div className="demo-loading">Getting the demo ready…</div>}
            </div>
            <Timeline demo={demo} t={t} />
          </div>
        </div>
        <div className="demo-caption" aria-live="polite">
          <span key={caption?.text ?? ''}>{caption?.text ?? ' '}</span>
        </div>
        <div className="demo-controls">
          <button onClick={() => ctl.current?.replay()} title="Play it again from the start">
            ↺ Replay
          </button>
          <button className={slow ? 'on' : ''} onClick={() => setSlow((s) => !s)} aria-pressed={slow} title="Half speed">
            🐢 0.5×
          </button>
          {base.extra && (
            <button className={`extra ${extra ? 'on' : ''}`} onClick={() => setExtra((x) => !x)} aria-pressed={extra}>
              {extra ? '← Back to the move' : `⚠ ${base.extraLabel}`}
            </button>
          )}
          <span className="demo-spacer" />
          <button onClick={() => onOpen(prev.id)} title={`Previous: ${prev.name}`}>
            ◀ <span className="lbl">{prev.name}</span>
          </button>
          <button onClick={() => onOpen(next.id)} title={`Next: ${next.name}`}>
            <span className="lbl">{next.name}</span> ▶
          </button>
          {onPin && (
            <button onClick={() => onPin(demo.id)} title="Keep a small copy of this demo on the side while you play">
              📌 Pin to side
            </button>
          )}
          <button className="close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// The loop's progress, with a mark where each caption starts.
function Timeline({ demo, t }) {
  return (
    <div className="demo-timeline" aria-hidden="true">
      <div className="demo-progress" style={{ width: `${Math.min(100, (t / demo.length) * 100)}%` }} />
      {demo.captions.map((c) => (
        <span key={c.at} className={`demo-mark ${t >= c.at ? 'past' : ''}`} style={{ left: `${(c.at / demo.length) * 100}%` }} />
      ))}
    </div>
  );
}
