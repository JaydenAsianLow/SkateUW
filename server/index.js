// Socket.IO relay server.
// The phone joins as a "controller" and streams tilt data; the laptop joins as a
// "display" and receives it. Each laptop page makes its own pairing code (the "room"), carried in the QR link,
// so on a public site every player's phone only talks to their own game.
// In development Vite proxies /socket.io and /api here. In production (after `npm run build`) this server also
// serves the built game from dist/, so the whole site is one address.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { cleanSetting, sharedOnly } from '../src/shared.js';

const PORT = Number(process.env.PORT) || 3001;
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const SERVE_DIST = process.env.NODE_ENV === 'production' && existsSync(join(DIST, 'index.html'));

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

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

// Built game files; any other path (like /controller) gets index.html and the app picks the page.
function serveDist(req, res) {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(normalize(DIST)) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const hashed = file.includes(`${sep}assets${sep}`); // Vite's fingerprinted files never change
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const httpServer = createServer((req, res) => {
  if (req.url === '/api/info') {
    res.writeHead(200, { 'content-type': 'application/json' });
    // On the public site the phone uses the site's own address, so LAN addresses aren't needed (or shared).
    res.end(JSON.stringify({ addresses: SERVE_DIST ? [] : lanAddresses() }));
    return;
  }
  if (SERVE_DIST && (req.method === 'GET' || req.method === 'HEAD')) return serveDist(req, res);
  res.writeHead(404);
  res.end('Not found');
});

// Heartbeat: forgiving enough that a Wi-Fi hiccup or a long frame on the laptop doesn't drop the socket.
// Closing a tab is still noticed at once (both pages disconnect on pagehide); only a crash or lost Wi-Fi
// waits for this (~10-25 s).
const io = new Server(httpServer, { cors: { origin: true }, pingInterval: 10000, pingTimeout: 15000 });

// Per pairing code: the last phone config from a display, and which laptop page speaks for the game. Only one
// page does: the most recently opened one. With two tabs open (say an old one still on the menu, or playing),
// both would send board state and the phone would flip between them.
const rooms = new Map(); // code -> { config, activeDisplay }
const roomState = (code) => rooms.get(code) ?? rooms.set(code, { config: null, activeDisplay: null }).get(code);
const ROOM_RE = /^[A-Z0-9]{4,12}$/;

const members = (code, role) => io.sockets.adapter.rooms.get(`${code}:${role}s`);
const broadcastStatus = (code) =>
  io.to([`${code}:displays`, `${code}:controllers`]).emit('status', {
    controllers: members(code, 'controller')?.size ?? 0,
    displays: members(code, 'display')?.size ?? 0,
  });

const TRICK_TYPES = new Set(['kickflip', 'varial', 'tre', 'shove', 'fs180', 'bs180']);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

io.on('connection', (socket) => {
  socket.on('join', (d) => {
    const role = d?.role;
    const code = typeof d?.room === 'string' ? d.room.toUpperCase() : '';
    if ((role !== 'display' && role !== 'controller') || !ROOM_RE.test(code) || socket.data.role) return;
    socket.data.role = role;
    socket.data.room = code;
    socket.join(`${code}:${role}s`);
    const st = roomState(code);
    if (role === 'display') st.activeDisplay = socket.id;
    console.log(`[socket] ${role} joined room ${code}`);
    if (role === 'controller' && st.config) socket.emit('config', st.config);
    broadcastStatus(code);
  });

  const toDisplays = () => io.to(`${socket.data.room}:displays`);
  const toControllers = () => io.to(`${socket.data.room}:controllers`);

  // High-rate tilt stream: volatile so stale packets are dropped instead of queued.
  socket.on('tilt', (d) => {
    if (socket.data.role !== 'controller' || !d) return;
    toDisplays().volatile.emit('tilt', {
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
      if (socket.data.role === 'controller') toDisplays().emit(event, build(d ?? {}));
    });
  relay('push', (d) => ({ power: num(d.power, 0.5, 1.5) || 1 }));
  relay('pop', (d) => ({ power: num(d.power, 0.5, 1.5) || 1, nose: d.nose === true })); // nose = nollie
  relay('trick', (d) => ({ type: TRICK_TYPES.has(d.type) ? d.type : 'kickflip', side: d.side < 0 ? -1 : 1 }));
  relay('revert', (d) => ({ dir: d.dir < 0 ? -1 : 1 }));
  relay('reset', () => ({}));
  relay('carry', () => ({}));

  // Deck rotation from the display, mirrored by the phone's 3D board.
  socket.on('board', (d) => {
    if (socket.data.role !== 'display' || !d || socket.id !== roomState(socket.data.room).activeDisplay) return;
    toControllers().volatile.emit('board', {
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
    const st = roomState(socket.data.room);
    st.config = { sensitivity: Math.round(num(d.sensitivity, 0, 2)), ...sharedOnly(d) };
    toControllers().emit('config', st.config);
  });

  // A setting changed on the phone's Settings sheet: the laptop applies and saves it, then sends 'config' back.
  socket.on('setting', (d) => {
    const active = socket.data.room && roomState(socket.data.room).activeDisplay;
    if (socket.data.role !== 'controller' || !d || !active) return;
    const value = cleanSetting(d.key, d.value);
    if (value !== undefined) io.to(active).emit('setting', { key: d.key, value });
  });

  // Round-trip latency check for the controller UI.
  socket.on('rtt', (ack) => typeof ack === 'function' && ack());

  socket.on('disconnect', () => {
    const code = socket.data.room;
    if (!code) return;
    const st = roomState(code);
    if (socket.id === st.activeDisplay) st.activeDisplay = [...(members(code, 'display') ?? [])].pop() ?? null;
    console.log(`[socket] ${socket.data.role} left room ${code}`);
    if (!members(code, 'display')?.size && !members(code, 'controller')?.size) rooms.delete(code);
    else broadcastStatus(code);
  });
});

httpServer.listen(PORT, () => {
  if (SERVE_DIST) return console.log(`[server] Serving the game on port ${PORT}`);
  console.log(`[server] Socket.IO relay on http://localhost:${PORT}`);
  const best = lanAddresses()[0];
  if (best) console.log(`[server] Phone controller: https://${best.address}:5173/controller`);
});
