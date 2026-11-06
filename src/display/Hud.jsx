import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Bar } from '../Bar.jsx';
import { board, net, phone, phoneIsLive } from '../state.js';

// ?clean hides the overlay (for screenshots against the DESIGN.md reference).
const CLEAN = new URLSearchParams(window.location.search).has('clean');

// 2D overlay: connection status, live tilt values, and a QR code for the phone.
export default function Hud() {
  const [snap, setSnap] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [pick, setPick] = useState(0);
  const [qr, setQr] = useState(null);
  const [showQr, setShowQr] = useState(true);

  // Poll the shared mutable state at 10Hz for display.
  useEffect(() => {
    let last = 0;
    let lastT = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const rate = ((phone.packets - last) * 1000) / (now - lastT);
      last = phone.packets;
      lastT = now;
      setSnap({
        connected: net.connected,
        controllers: net.controllers,
        live: phoneIsLive(),
        rate: Math.round(rate),
        beta: phone.beta,
        gamma: phone.gamma,
        steer: board.steer,
        lean: board.lean,
        speed: board.speed,
        source: board.source,
        trick: board.trick,
        fakie: board.fakie,
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then((d) => setAddresses(d.addresses ?? []))
      .catch(() => setAddresses([]));
  }, []);

  const port = window.location.port || '443';
  const url = addresses[pick] ? `https://${addresses[pick].address}:${port}/controller` : null;

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#0b0d12', light: '#ffffff' } }).then(setQr);
  }, [url]);

  // Hide the QR automatically once a phone connects (can be reopened).
  const controllers = snap?.controllers ?? 0;
  useEffect(() => {
    if (controllers > 0) setShowQr(false);
  }, [controllers]);

  // ODbL attribution for the OpenStreetMap layout (MAP.md §6). Always visible.
  const credit = <div className="osm-credit">Red Square, UW · Map data © OpenStreetMap contributors</div>;
  if (!snap || CLEAN) return credit;

  const trick = snap.trick && performance.now() - snap.trick.at < 1400 ? snap.trick : null;

  return (
    <>
      {credit}
      {trick && (
        <div key={trick.at} className={`trick-callout ${trick.name === 'BAIL' ? 'bail' : ''}`}>
          {trick.name}
        </div>
      )}
      <div className="hud">
        <div className="hud-row">
          <span className={`dot ${snap.connected ? 'ok' : 'bad'}`} />
          <span>{snap.connected ? 'Server connected' : 'Server offline'}</span>
        </div>
        <div className="hud-row">
          <span className={`dot ${snap.live ? 'ok' : snap.controllers ? 'warn' : 'bad'}`} />
          <span>
            {snap.live
              ? `Phone streaming · ${snap.rate} Hz`
              : snap.controllers
                ? 'Phone connected, tap Start on it'
                : 'No phone connected'}
          </span>
        </div>
        <Bar label="Steer" value={snap.steer} />
        <Bar label="Lean" value={snap.lean} />
        <div className="hud-small">
          β {snap.beta.toFixed(1)}° · γ {snap.gamma.toFixed(1)}° · {(snap.speed * 3.6).toFixed(0)} km/h · input: {snap.source}
          {snap.fakie ? ' · FAKIE' : ''}
        </div>
        <div className="hud-small muted">
          Keyboard: tap W = push · S = brake · A/D = steer · Space = ollie · F = kickflip · G = varial flip · T = tre flip ·
          V = pop shove-it · E = frontside 180 · Q = revert · R = reset
        </div>
        {!showQr && (
          <button className="link" onClick={() => setShowQr(true)}>
            Show phone QR
          </button>
        )}
      </div>

      {showQr && (
        <div className="qr-panel">
          <div className="qr-title">Scan with your phone</div>
          {qr ? <img src={qr} alt="QR code for controller URL" width={220} height={220} /> : <div className="qr-ph" />}
          <div className="qr-url">{url ?? 'Looking up LAN address…'}</div>
          {addresses.length > 1 && (
            <div className="qr-alt">
              Wrong network? Try:
              {addresses.map((a, i) => (
                <button key={a.address} className={`chip ${i === pick ? 'on' : ''}`} onClick={() => setPick(i)}>
                  {a.address}
                </button>
              ))}
            </div>
          )}
          <div className="qr-note">Same Wi-Fi required. Accept the certificate warning on the phone.</div>
          <button className="link" onClick={() => setShowQr(false)}>
            Hide
          </button>
        </div>
      )}
    </>
  );
}
