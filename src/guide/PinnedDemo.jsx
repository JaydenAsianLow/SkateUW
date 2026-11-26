import { useCallback, useEffect, useRef, useState } from 'react';
import { demoById } from './demos.js';
import { loadPinnedClip, savePinnedClip } from './engine.js';
import { ClipView, useClip } from './ControlsGuide.jsx';
import PhoneMock from './PhoneMock.jsx';
import { guidePrefs, setGuidePrefs } from './prefs.js';
import './guide.css';

// A demo pinned to the side of the screen while you play (Pin to side in a demo), so you can copy the motion while
// you try the move. It plays the demo's recorded clip, not a second 3D scene: the phone drawing with the finger and
// the captions, and the small clip of the skater under it, all from the same recording so they stay in step.
// In a bottom corner, see-through, clear of the score (top left), the manual meter and the timing bar (top middle).
export default function PinnedDemo({ pin }) {
  const demo = demoById[pin.id];
  const clip = useClip(pin.id);
  const [rec, setRec] = useState(null);
  const hist = useRef([]);
  const saved = useRef(false);

  useEffect(() => {
    saved.current = false;
    loadPinnedClip(pin.id).then((c) => (saved.current = !!c));
  }, [pin.id]);
  // Recorded just now (not from an earlier visit): keep it for next time.
  useEffect(() => {
    if (clip && !saved.current) (saved.current = true), savePinnedClip(pin.id);
  }, [clip, pin.id]);

  const onTime = useCallback(
    (t) => {
      const recs = clip?.recs;
      if (!recs?.length) return;
      const i = Math.min(recs.length - 1, Math.max(0, Math.round(t * 60)));
      const r = recs[i];
      hist.current = recs.slice(Math.max(0, i - 24), i + 1);
      setRec((cur) => (cur === r ? cur : r));
    },
    [clip],
  );
  if (!demo) return null;
  const t = rec?.t ?? 0;
  const caption = demo.captions.find((c) => t >= c.at && t < c.to);
  const set = (patch) => setGuidePrefs({ pin: { ...guidePrefs.pin, ...patch } });

  return (
    <aside className={`pinned ${pin.side ?? 'right'} ${pin.size ?? 'small'}`} aria-label={`Pinned demo: ${demo.name}`}>
      <header className="pinned-head">
        <b>{demo.name}</b>
        <button onClick={() => set({ side: pin.side === 'left' ? 'right' : 'left' })} title={pin.side === 'left' ? 'Move to the right' : 'Move to the left'}>
          {pin.side === 'left' ? '⇥' : '⇤'}
        </button>
        <button onClick={() => set({ size: pin.size === 'medium' ? 'small' : 'medium' })} title={pin.size === 'medium' ? 'Smaller' : 'Bigger'}>
          {pin.size === 'medium' ? 'S' : 'M'}
        </button>
        <button onClick={() => setGuidePrefs({ pin: null })} title="Close the pinned demo">
          ✕
        </button>
      </header>
      <div className="pinned-phone">{clip ? <PhoneMock rec={rec} history={hist.current} small /> : <span className="pinned-wait">Getting it ready…</span>}</div>
      <div className="pinned-caption">{caption?.text ?? ' '}</div>
      <ClipView id={pin.id} className="pinned-clip" onTime={onTime} />
    </aside>
  );
}
