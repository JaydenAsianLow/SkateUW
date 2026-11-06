import { io } from 'socket.io-client';

// Same-origin connection; Vite proxies /socket.io to the Node server.
export function connect(role) {
  const socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => socket.emit('join', role));
  return socket;
}
