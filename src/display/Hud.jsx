import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { board, net, phoneIsLive } from '../state.js';
import { MOVES } from '../moves.js';
import { AIRTIME_MAX, AIRTIME_MIN, RESERVED_KEYS, commands, keyLabel, onSettings, settings, updateSettings } from '../settings.js';

// ?clean hides the overlay (for screenshots against the DESIGN.md reference).
const CLEAN = new URLSearchParams(window.location.search).has('clean');

// 2D overlay: a slim bar (phone status + Controls / QR code / Options buttons), one panel open at a time.
export default function Hud() {
  const [snap, setSnap] = useState(null);
  const [panel, setPanel] = useState(null); // 'controls' | 'qr' | 'options' | null

  // Poll the shared mutable state at 10Hz for display.
  useEffect(() => {
    const id = setInterval(() => {
      setSnap({ connected: net.connected, controllers: net.controllers, live: phoneIsLive(), trick: board.trick });
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Close the QR panel once a phone connects.
  const controllers = snap?.controllers ?? 0;
  useEffect(() => {
    if (controllers > 0) setPanel((p) => (p === 'qr' ? null : p));
  }, [controllers]);

  // ODbL attribution for the OpenStreetMap layout (MAP.md §6). Always visible.
  const credit = <div className="osm-credit">Red Square, UW · Map data © OpenStreetMap contributors</div>;
  if (!snap || CLEAN) return credit;

  const trick = snap.trick && performance.now() - snap.trick.at < 1400 ? snap.trick : null;
  const status = !snap.connected
    ? ['bad', 'Server offline']
    : snap.live
      ? ['ok', 'Phone connected']
      : snap.controllers
        ? ['warn', 'Phone: tap Start']
        : ['bad', 'No phone'];
  const toggle = (p) => (e) => {
    setPanel((cur) => (cur === p ? null : p));
    e.currentTarget.blur(); // so Space doesn't press it again
  };

  return (
    <>
      {credit}
      {trick && (
        <div key={trick.at} className={`trick-callout ${trick.name === 'BAIL' ? 'bail' : ''}`}>
          {trick.name}
        </div>
      )}
      <div className="hud-bar">
        <span className="hud-pill">
          <span className={`dot ${status[0]}`} />
          {status[1]}
        </span>
        <button className={`hud-btn ${panel === 'controls' ? 'on' : ''}`} onClick={toggle('controls')}>
          Controls
        </button>
        <button
          className={`hud-btn ${panel === 'qr' ? 'on' : ''} ${!snap.controllers ? 'glow' : ''}`}
          onClick={toggle('qr')}
        >
          QR code
        </button>
        <button className={`hud-btn ${panel === 'options' ? 'on' : ''}`} onClick={toggle('options')}>
          Options
        </button>
      </div>
      {panel === 'controls' && (
        <div className="hud-panel">
          <div className="hud-panel-title">Phone controls</div>
          <ul className="moves-list">
            {MOVES.map(([name, how]) => (
              <li key={name}>
                <b>{name}</b> {how}
              </li>
            ))}
          </ul>
        </div>
      )}
      {panel === 'qr' && <QrPanel />}
      <BalanceMeter />
      {panel === 'options' && <Options />}
    </>
  );
}

function QrPanel() {
  const [addresses, setAddresses] = useState([]);
  const [pick, setPick] = useState(0);
  const [qr, setQr] = useState(null);
  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then((d) => setAddresses(d.addresses ?? []))
      .catch(() => setAddresses([]));
  }, []);
  const port = window.location.port || '443';
  const url = addresses[pick] ? `https://${addresses[pick].address}:${port}/controller` : null;
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 180, color: { dark: '#0b0d12', light: '#ffffff' } }).then(setQr);
  }, [url]);
  return (
    <div className="hud-panel qr">
      {qr ? <img src={qr} alt="QR code for the phone controller" width={160} height={160} /> : <div className="qr-ph" />}
      <div className="qr-url">{url ?? 'Looking up LAN address…'}</div>
      {addresses.length > 1 && (
        <div className="qr-alt">
          Wrong network?
          {addresses.map((a, i) => (
            <button key={a.address} className={`chip ${i === pick ? 'on' : ''}`} onClick={() => setPick(i)}>
              {a.address}
            </button>
          ))}
        </div>
      )}
      <div className="qr-note">Same Wi-Fi. Accept the certificate warning on the phone.</div>
    </div>
  );
}

// Airtime, what leaning the phone back does, the spawn point and its keys.
function Options() {
  const [cfg, setCfg] = useState({ ...settings });
  const [binding, setBinding] = useState(null); // 'returnKey' | 'setSpawnKey' | null
  const [note, setNote] = useState('');
  useEffect(() => onSettings(setCfg), []);

  // Waiting for a key: the next key press becomes the binding (Esc cancels).
  useEffect(() => {
    commands.rebinding = !!binding;
    if (!binding) return;
    const other = binding === 'returnKey' ? 'setSpawnKey' : 'returnKey';
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') return setBinding(null);
      if (RESERVED_KEYS[e.code]) return setNote(`${keyLabel(e.code)} is already ${RESERVED_KEYS[e.code]}. Pick another key.`);
      if (e.code === settings[other]) return setNote(`${keyLabel(e.code)} is already the other spawn key.`);
      updateSettings({ [binding]: e.code });
      setNote('');
      setBinding(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      commands.rebinding = false;
    };
  }, [binding]);

  const btn = (label, onClick, extra = '') => (
    <button className={`chip ${extra}`} onClick={(e) => (onClick(), e.currentTarget.blur())}>
      {label}
    </button>
  );
  const keyBtn = (field) =>
    btn(binding === field ? 'Press a key…' : keyLabel(cfg[field]), () => {
      setNote(binding === field ? '' : 'Press the new key (Esc to cancel).');
      setBinding(binding === field ? null : field);
    }, binding === field ? 'on' : '');

  return (
    <div className="hud-panel ctl">
      <label className="ctl-row">
        <span>Airtime</span>
        <input
          type="range"
          min={AIRTIME_MIN}
          max={AIRTIME_MAX}
          step={0.1}
          value={cfg.airtime}
          onChange={(e) => updateSettings({ airtime: Number(e.target.value) })}
          onPointerUp={(e) => e.currentTarget.blur()}
        />
        <span className="ctl-val">{cfg.airtime.toFixed(1)}×</span>
      </label>
      <div className="ctl-row">
        <span>Back to spawn</span>
        {keyBtn('returnKey')}
      </div>
      <div className="ctl-row">
        <span>Set spawn here</span>
        {keyBtn('setSpawnKey')}
      </div>
      <div className="ctl-row">
        <span className="muted">{cfg.spawn ? 'Custom spawn' : 'Default spawn'}</span>
        <span className="ctl-btns">
          {btn('Set here', () => (commands.setSpawn = true))}
          {cfg.spawn && btn('Use default', () => (commands.clearSpawn = true))}
        </span>
      </div>
      {note && <div className="hud-small muted">{note}</div>}
    </div>
  );
}

// Manual meter (vertical, right side): the arrow follows how far the phone is leant back. Top = level / too far
// forward (the front wheels drop), green middle = keep manualing, red bottom = too far back (bail).
const RED_AT = 0.82; // keep in sync with .balance-red height (18%)

function BalanceMeter() {
  const wrap = useRef(null);
  const arrow = useRef(null);
  const green = useRef(null);
  useEffect(() => {
    let raf;
    let shownUntil = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = board.anim;
      const now = performance.now();
      if ((a.balance ?? -1) >= 0) shownUntil = now + 900; // stays up a moment after the wheels come down
      if (wrap.current) wrap.current.style.opacity = now < shownUntil ? '1' : '0';
      // The falling point (meter = 1) sits where the red starts (RED_AT down the bar).
      if (arrow.current) arrow.current.style.top = `${Math.min(1, (a.meter ?? 0) * RED_AT) * 100}%`;
      if (green.current) green.current.style.top = `${(a.manualIn ?? 0.3) * RED_AT * 100}%`;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={wrap} className="balance">
      <div className="balance-label">MANUAL</div>
      <div className="balance-track">
        <div ref={green} className="balance-green" />
        <div className="balance-red" />
        <div ref={arrow} className="balance-arrow" />
      </div>
    </div>
  );
}
