import { io } from 'socket.io-client';

// Same-origin connection; Vite proxies /socket.io to the Node server.
export function connect(role) {
  // Quick, steady retries after a drop (default backs off to 5 s), so a blip recovers in about a second.
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnectionDelay: 300,
    reconnectionDelayMax: 1500,
    randomizationFactor: 0.3,
  });
  socket.on('connect', () => socket.emit('join', role));
  return socket;
}
