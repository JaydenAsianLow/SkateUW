// Centered -1..1 value bar, used on both the phone and the laptop HUD.
export function Bar({ label, value }) {
  const pct = Math.min(1, Math.abs(value)) * 50;
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-mid" />
        <div className="bar-fill" style={{ left: value < 0 ? `${50 - pct}%` : '50%', width: `${pct}%` }} />
      </div>
      <span className="bar-val">{value.toFixed(2)}</span>
    </div>
  );
}
