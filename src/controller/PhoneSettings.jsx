import { CHOICE_UI } from '../shared.js';

// The phone's Settings sheet. Shared settings (shared.js) live on the laptop: a tap sends 'setting', the laptop saves
// it and sends 'config' back, which updates `shared` here. Phone-only settings are passed in as `children`.
export default function PhoneSettings({ shared, socketRef, onClose, children }) {
  const set = (key, value) => {
    socketRef.current?.emit('setting', { key, value });
    navigator.vibrate?.(10);
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
        {children}
        {!shared && <small className="muted">Open the game on the laptop to change these.</small>}
      </div>
    </div>
  );
}
