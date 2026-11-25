import { useEffect, useRef } from 'react';

// Live tilt preview for the Truck sensitivity setting: a bar that fills left / right with the steering the
// board gets right now. read() -> { steer: -1..1, deg?: tilt in degrees }. Written straight to the DOM every frame.
export default function SteerPreview({ read }) {
  const fill = useRef(null);
  const label = useRef(null);
  useEffect(() => {
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { steer = 0, deg } = read() ?? {};
      const s = Math.max(-1, Math.min(1, steer));
      if (fill.current) {
        fill.current.style.left = `${50 + Math.min(0, s) * 50}%`;
        fill.current.style.width = `${Math.abs(s) * 50}%`;
      }
      if (label.current) {
        const turn = `${s < 0 ? 'left' : s > 0 ? 'right' : 'straight'} ${Math.round(Math.abs(s) * 100)}%`;
        label.current.textContent = deg == null ? `Turn ${turn}` : `Tilt ${Math.round(deg)}° → turn ${turn}`;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [read]);
  return (
    <div className="steer-preview">
      <div className="steer-track">
        <div ref={fill} className="steer-fill" />
        <div className="steer-mid" />
      </div>
      <small ref={label} className="muted" />
    </div>
  );
}
