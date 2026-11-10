// Socket.IO relay server.
// The phone joins as a "controller" and streams tilt data; the laptop joins as a
// "display" and receives it. Vite's dev server proxies /socket.io and /api here,
// so the phone only ever talks to one HTTPS origin.
import { createServer } from 'node:http';
import os from 'node:os';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT) || 3001;

// LAN IPv4 addresses, best guess first (real Wi-Fi/Ethernet before virtual adapters).
function lanAddresses() {
  const out = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      let score = 0;
      if (/wi-?fi|wlan|wireless|en0|eth|ethernet/i.test(name)) score += 2;
      if (/vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|loopback|tailscale|zerotier/i.test(name)) score -= 3;
      if (/^192\.168\./.test(info.address)) score += 1;
      if (/^169\.254\./.test(info.address)) score -= 5; // link-local, unusable
      out.push({ name, address: info.address, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).map(({ name, address }) => ({ name, address }));
}

const httpServer = createServer((req, res) => {
  if (req.url === '/api/info') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ addresses: lanAddresses() }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// Heartbeat: forgiving enough that a Wi-Fi hiccup or a long frame on the laptop doesn't drop the socket.
// Closing a tab is still noticed at once (both pages disconnect on pagehide); only a crash or lost Wi-Fi
// waits for this (~10-25 s).
const io = new Server(httpServer, { cors: { origin: true }, pingInterval: 10000, pingTimeout: 15000 });

const roomSize = (room) => io.sockets.adapter.rooms.get(room)?.size ?? 0;
const broadcastStatus = () =>
  io.emit('status', { controllers: roomSize('controllers'), displays: roomSize('displays') });

let config = null; // last phone config from a display
// Only one laptop page speaks for the game to the phone: the most recently opened one. With two tabs open (say an old
// one still on the menu, or playing), both would send board state and the phone would flip between them.
let activeDisplay = null;

const TRICK_TYPES = new Set(['kickflip', 'varial', 'tre', 'shove', 'fs180', 'bs180']);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

io.on('connection', (socket) => {
  socket.on('join', (role) => {
    if (role !== 'display' && role !== 'controller') return;
    socket.data.role = role;
    socket.join(role + 's');
    if (role === 'display') activeDisplay = socket.id;
    console.log(`[socket] ${role} joined (${socket.handshake.address})`);
    if (role === 'controller' && config) socket.emit('config', config);
    broadcastStatus();
  });

  // High-rate tilt stream: volatile so stale packets are dropped instead of queued.
  socket.on('tilt', (d) => {
    if (socket.data.role !== 'controller' || !d) return;
    io.to('displays').volatile.emit('tilt', {
      steer: num(d.steer, -1, 1),
      lean: num(d.lean, -1, 1),
      beta: num(d.beta, -180, 180),
      gamma: num(d.gamma, -90, 90),
      jx: num(d.jx, -1, 1), // joystick while on foot (right +)
      jy: num(d.jy, -1, 1), // (up +)
    });
  });

  // Swipe moves from the deck controller.
  const relay = (event, build) =>
    socket.on(event, (d) => {
      if (socket.data.role === 'controller') io.to('displays').emit(event, build(d ?? {}));
    });
  relay('push', (d) => ({ power: num(d.power, 0.5, 1.5) || 1 }));
  relay('pop', (d) => ({ power: num(d.power, 0.5, 1.5) || 1 }));
  relay('trick', (d) => ({ type: TRICK_TYPES.has(d.type) ? d.type : 'kickflip', side: d.side < 0 ? -1 : 1 }));
  relay('revert', (d) => ({ dir: d.dir < 0 ? -1 : 1 }));
  relay('reset', () => ({}));
  relay('carry', () => ({}));

  // Deck rotation from the display, mirrored by the phone's 3D board.
  socket.on('board', (d) => {
    if (socket.data.role !== 'display' || !d || socket.id !== activeDisplay) return;
    io.to('controllers').volatile.emit('board', {
      roll: num(d.roll, -20, 20),
      pitch: num(d.pitch, -3, 3),
      yaw: num(d.yaw, -20, 20),
      spin: num(d.spin, -20, 20),
      lift: num(d.lift, -1, 1),
      height: num(d.height, 0, 2),
      mode: ['ride', 'carry', 'find', 'off'].includes(d.mode) ? d.mode : 'ride',
    });
  });

  // Phone settings chosen on the laptop (sensitivity preset). Cached so a phone that joins later gets them too.
  socket.on('config', (d) => {
    if (socket.data.role !== 'display' || !d) return;
    config = { sensitivity: Math.round(num(d.sensitivity, 0, 2)) };
    io.to('controllers').emit('config', config);
  });

  // Round-trip latency check for the controller UI.
  socket.on('rtt', (ack) => typeof ack === 'function' && ack());

  socket.on('disconnect', () => {
    if (socket.id === activeDisplay) activeDisplay = [...(io.sockets.adapter.rooms.get('displays') ?? [])].pop() ?? null;
    if (socket.data.role) console.log(`[socket] ${socket.data.role} left`);
    broadcastStatus();
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] Socket.IO relay on http://localhost:${PORT}`);
  const best = lanAddresses()[0];
  if (best) console.log(`[server] Phone controller: https://${best.address}:5173/controller`);
});
