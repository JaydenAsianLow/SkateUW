import { io } from 'socket.io-client';

// Pairing code ("room"): the laptop makes one per tab and puts it in the QR link; the phone reads it from that link.
// It keeps phones paired to their own game when many people play on the public site.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L, so it can be typed from the screen

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// The laptop's code survives a page reload (same tab), so a paired phone stays paired.
export const displayRoom = (() => {
  try {
    const saved = sessionStorage.getItem('skate-room');
    if (saved) return saved;
    const code = newCode();
    sessionStorage.setItem('skate-room', code);
    return code;
  } catch {
    return newCode();
  }
})();

// The phone's code, from the QR link (?room=ABC123). Null when the page was opened without one.
export const controllerRoom = (() => {
  const code = new URLSearchParams(globalThis.location?.search ?? '').get('room')?.toUpperCase() ?? '';
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
})();

// Same-origin connection (Vite proxies /socket.io to the Node server in development).
export function connect(role, room) {
  // Quick, steady retries after a drop (default backs off to 5 s), so a blip recovers in about a second.
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnectionDelay: 300,
    reconnectionDelayMax: 1500,
    randomizationFactor: 0.3,
  });
  socket.on('connect', () => socket.emit('join', { role, room }));
  return socket;
}
