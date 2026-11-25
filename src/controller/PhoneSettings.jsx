import { useState } from 'react';
import { CHOICE_UI, RANGES, RANGE_UI } from '../shared.js';
import { buzz } from './haptics.js';

// The phone's Settings sheet. Shared settings (shared.js) live on the laptop: a tap sends 'setting', the laptop saves
// it and sends 'config' back, which updates `shared` here. Phone-only settings are passed in as `children`.
export default function PhoneSettings({ shared, socketRef, onClose, children }) {
  const set = (key, value) => {
    socketRef.current?.emit('setting', { key, value });
    buzz(10);
  };
  return (
    <div className="psheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="psheet-card">
        <div className="psheet-head">
          <b>Settings</b>
          <button className="secondary small-btn" onClick={onClose}>
            Done
          </button>
        </div>
        {CHOICE_UI.map(([key, label, names, hint]) => (
          <div className="psheet-row" key={key}>
            <span>{label}</span>
            <span className="psheet-btns">
              {Object.entries(names).map(([v, text]) => (
                <button key={v} className={`chip ${shared?.[key] === v ? 'on' : ''}`} onClick={() => set(key, v)}>
                  {text}
                </button>
              ))}
            </span>
            {hint && <small className="muted">{hint}</small>}
          </div>
        ))}
        {RANGE_UI.map(([key, label, hint]) => (
          <Slider key={key} name={key} label={label} hint={hint} value={shared?.[key]} onChange={(v) => set(key, v)} />
        ))}
        {children}
        {!shared && <small className="muted">Open the game on the laptop to change these.</small>}
      </div>
    </div>
  );
}

// A shared number setting. Shows the dragged value at once (the laptop's echo comes back a moment later).
function Slider({ name, label, hint, value, onChange }) {
  const [draft, setDraft] = useState(null);
  const r = RANGES[name];
  const v = draft ?? value ?? r.def;
  return (
    <label className="psheet-row">
      <span>{label}</span>
      <span>{v.toFixed(2)}×</span>
      <input
        type="range"
        min={r.min}
        max={r.max}
        step={r.step}
        value={v}
        disabled={value == null}
        onChange={(e) => (setDraft(Number(e.target.value)), onChange(Number(e.target.value)))}
        onPointerUp={() => setDraft(null)}
      />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
