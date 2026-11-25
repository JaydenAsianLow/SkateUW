import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { MOVES } from '../moves.js';
import SteerPreview from '../SteerPreview.jsx';
import { phone } from '../state.js';
import { CHOICE_UI, RANGES, RANGE_UI } from '../shared.js';
import { displayRoom } from '../socket.js';
import { AIRTIME_MAX, AIRTIME_MIN, keyLabel, onSettings, settings, updateSettings } from '../settings.js';

// Laptop screens around the game: main menu, phone pairing, settings, controls and the phone-lost overlay.

const blurAfter = (fn) => (e) => {
  e.currentTarget.blur(); // so Space (the default spawn key) doesn't press it again
  fn();
};

// Title screen: Play / Controls / Settings, over the dimmed level.
export function MainMenu({ onPlay }) {
  const [panel, setPanel] = useState(null); // 'controls' | 'settings' | null
  if (panel) {
    return (
      <div className="screen">
        <div className="menu-card wide">
          <div className="menu-head">
            <h2>{panel === 'controls' ? 'Controls' : 'Settings'}</h2>
            <button className="menu-btn small" onClick={blurAfter(() => setPanel(null))}>
              Back
            </button>
          </div>
          {panel === 'controls' ? <ControlsList /> : <SettingsPanel />}
        </div>
      </div>
    );
  }
  return (
    <div className="screen">
      <div className="menu">
        <h1 className="title">
          SKATE <span>UW</span>
        </h1>
        <div className="subtitle">Red Square · phone-controlled skateboarding</div>
        <div className="menu-buttons">
          <button className="menu-btn primary" onClick={blurAfter(onPlay)} autoFocus>
            Play
          </button>
          <button className="menu-btn" onClick={blurAfter(() => setPanel('controls'))}>
            Controls
          </button>
          <button className="menu-btn" onClick={blurAfter(() => setPanel('settings'))}>
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// After Play: scan the QR code with the phone, then tap Start on it. Advances on its own once tilt data arrives.
export function PairScreen({ status, onBack, onKeyboard }) {
  const step = status.controllers > 0 ? 2 : 1;
  return (
    <div className="screen">
      <div className="menu-card pair">
        <h2>Connect your phone</h2>
        <QrCode />
        <ol className="pair-steps">
          <li className={step === 1 ? 'now' : 'done'}>Scan the code with your phone's camera (same Wi-Fi).</li>
          <li className={step === 2 ? 'now' : ''}>Tap “Tap to start” on the phone.</li>
        </ol>
        <div className="pair-status">
          <span className={`dot ${!status.connected ? 'bad' : step === 2 ? 'warn' : 'bad'}`} />
          {!status.connected ? 'Game server offline' : step === 2 ? 'Phone found, waiting for Start…' : 'Waiting for phone…'}
        </div>
        <div className="menu-row">
          <button className="menu-btn small" onClick={blurAfter(onBack)}>
            Main menu
          </button>
          <button className="link" onClick={blurAfter(onKeyboard)}>
            Play with keyboard instead
          </button>
        </div>
      </div>
    </div>
  );
}

// Phone lost mid-game: the game pauses under a dark shade until the phone is back.
export function PhoneLost({ status, onMenu }) {
  return (
    <div className="screen shade">
      <div className="lost-card">
        <div className="lost-title">Reconnect phone</div>
        <div className="lost-text">
          {!status.connected
            ? 'The game server stopped. Restart it to keep playing.'
            : status.controllers > 0
              ? 'Phone found. Tap “Tap to start” on it to keep riding.'
              : 'The phone disconnected. Open the controller page again or scan the code.'}
        </div>
        <QrCode small />
        <div className="lost-text muted">The game continues as soon as the phone is back.</div>
      </div>
      <button className="menu-btn" onClick={blurAfter(onMenu)}>
        Back to main menu
      </button>
    </div>
  );
}

// Opened from localhost or an IP address (dev on the LAN), not from the public site's domain.
const ON_LAN = /^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(window.location.hostname);

// QR code for the phone controller page, with this tab's pairing code. On the public site it's the site's own
// address; in development it's this laptop's LAN address.
export function QrCode({ small }) {
  const [addresses, setAddresses] = useState([]);
  const [pick, setPick] = useState(0);
  const [qr, setQr] = useState(null);
  useEffect(() => {
    if (!ON_LAN) return;
    fetch('/api/info')
      .then((r) => r.json())
      .then((d) => setAddresses(d.addresses ?? []))
      .catch(() => setAddresses([]));
  }, []);
  const port = window.location.port || '443';
  const path = `/controller?room=${displayRoom}`;
  const url = !ON_LAN
    ? window.location.origin + path
    : addresses[pick]
      ? `https://${addresses[pick].address}:${port}${path}`
      : null;
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b0d12', light: '#ffffff' } }).then(setQr);
  }, [url]);
  const size = small ? 140 : 200;
  return (
    <div className="qr">
      {qr ? (
        <img src={qr} alt="QR code for the phone controller" width={size} height={size} />
      ) : (
        <div className="qr-ph" style={{ width: size, height: size }} />
      )}
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
      {!small && ON_LAN && <div className="qr-note">Accept the certificate warning on the phone.</div>}
      {!small && <div className="qr-note">After scanning, you’ll be asked to hold your phone flat like a skateboard to calibrate.</div>}
    </div>
  );
}

const KEYBOARD = [
  ['Push', 'W / ↑'],
  ['Steer', 'A D / ← →'],
  ['Manual', 'S / ↓'],
  ['Ollie', 'Shift'],
  ['Nollie', 'N (then a trick key for a nollie flip)'],
  ['Kickflip', 'F'],
  ['Varial flip', 'R'],
  ['Tre flip', 'T'],
  ['Pop shove-it', 'V'],
  ['Frontside 180', 'E'],
  ['Revert', 'Q'],
  ['Get off / on', 'B (on foot: WASD, Shift to run)'],
  ['Jump / caveman', 'Space on foot with the board, then B in the air'],
  ['Show grind lines', 'G (blue rails, orange ledges, pink curbs; thick = long)'],
];

export function ControlsList() {
  return (
    <div className="controls-cols">
      <div>
        <div className="col-title">Phone</div>
        <ul className="moves-list">
          {MOVES.map(([name, how]) => (
            <li key={name}>
              <b>{name}</b> {how}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="col-title">Keyboard</div>
        <ul className="moves-list">
          {KEYBOARD.map(([name, how]) => (
            <li key={name}>
              <b>{name}</b> {how}
            </li>
          ))}
          <li>
            <b>Back to spawn</b> {keyLabel(settings.returnKey)}
          </li>
          <li>
            <b>Set spawn</b> {keyLabel(settings.setSpawnKey)}
          </li>
        </ul>
      </div>
    </div>
  );
}

// Tilt the phone: what the board gets (truck sensitivity is applied on the phone).
const readPhoneSteer = () => ({ steer: phone.steer });

// Shared settings (also on the phone) and airtime. Spawn is set from the phone (Set spawn / To spawn).
export function SettingsPanel() {
  const [cfg, setCfg] = useState({ ...settings });
  useEffect(() => onSettings(setCfg), []);
  const btn = (label, onClick, extra = '') => (
    <button className={`chip ${extra}`} onClick={blurAfter(onClick)}>
      {label}
    </button>
  );

  return (
    <div className="ctl">
      {CHOICE_UI.map(([key, label, names, hint]) => (
        <div className="ctl-row" key={key} title={hint}>
          <span>{label}</span>
          <span className="ctl-btns">
            {Object.entries(names).map(([v, text]) => (
              <span key={v}>{btn(text, () => updateSettings({ [key]: v }), cfg[key] === v ? 'on' : '')}</span>
            ))}
          </span>
        </div>
      ))}
      {RANGE_UI.map(([key, label, hint]) => (
        <label className="ctl-row" key={key} title={hint}>
          <span>{label}</span>
          <input
            type="range"
            min={RANGES[key].min}
            max={RANGES[key].max}
            step={RANGES[key].step}
            value={cfg[key]}
            onChange={(e) => updateSettings({ [key]: Number(e.target.value) })}
            onPointerUp={(e) => e.currentTarget.blur()}
          />
          <span className="ctl-val">{cfg[key].toFixed(2)}×</span>
        </label>
      ))}
      <SteerPreview read={readPhoneSteer} />
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
    </div>
  );
}
