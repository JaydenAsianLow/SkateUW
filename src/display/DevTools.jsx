import { useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { board, phone } from '../state.js';
import { urlParams } from './util.js';

// Dev-only helpers for checking the level (MAP.md §13). Nothing here runs in a normal game.

// ?labels: names floating over the parts of the plaza, for labelled top-down views (?topdown&labels).
const LABELS = (urlParams.get('labels') || '')
  .split(';')
  .filter(Boolean)
  .map((s) => {
    const [name, x, z] = s.split(',');
    return { name: decodeURIComponent(name), x: Number(x), z: Number(z) };
  });
export function Labels() {
  return LABELS.map(({ name, x, z }) => (
    <Html key={name} position={[x, 3, z]} center zIndexRange={[10, 0]}>
      <div style={{ background: 'rgba(255,240,120,0.92)', color: '#111', font: 'bold 11px sans-serif', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap' }}>
        {name}
      </div>
    </Html>
  ));
}

// ?ridetest: ride from the spawn point (set it with ?spawn=x,z,heading) using normal pushes like a player (power 1,
// one every `gap` seconds, `n` of them: ?ridetest=n,gap), then keep the phone level and coast. Writes the highest
// point the board reached, how far it got and its speed into <pre id="ridetest"> after the run (read it with a
// headless browser's --dump-dom).
const RIDE = urlParams.has('ridetest') ? (urlParams.get('ridetest') || '6,0.8').split(',').map(Number) : null;
export function RideTest() {
  useEffect(() => {
    if (!RIDE) return undefined;
    const [n, gap] = RIDE;
    const start = { x: board.x, z: board.z };
    let pushes = 0;
    const timer = setInterval(() => {
      if (pushes++ < n) phone.pushQueued = 1;
    }, gap * 1000);
    const log = [];
    const sample = setInterval(() => log.push([board.x, board.y, board.z, board.speed]), 100);
    const done = setTimeout(() => {
      clearInterval(timer);
      clearInterval(sample);
      const maxY = Math.max(...log.map((l) => l[1]));
      const maxSpeed = Math.max(...log.map((l) => l[3]));
      const last = log[log.length - 1];
      const out = [
        `pushes: ${n} (power 1, every ${gap} s), start (${start.x.toFixed(1)}, ${start.z.toFixed(1)})`,
        `highest board centre: ${maxY.toFixed(2)} m above the plaza`,
        `top speed: ${maxSpeed.toFixed(2)} m/s, end (${last[0].toFixed(1)}, ${last[1].toFixed(2)}, ${last[2].toFixed(1)}) at ${last[3].toFixed(2)} m/s`,
        ...log.filter((_, i) => i % 5 === 0).map((l, i) => `t=${(i * 0.5).toFixed(1)}s  x=${l[0].toFixed(1)} y=${l[1].toFixed(2)} z=${l[2].toFixed(1)} v=${l[3].toFixed(2)}`),
      ];
      const pre = document.createElement('pre');
      pre.id = 'ridetest';
      pre.textContent = out.join('\n');
      document.body.appendChild(pre);
    }, (n * gap + 8) * 1000);
    return () => {
      clearInterval(timer);
      clearInterval(sample);
      clearTimeout(done);
    };
  }, []);
  useFrame(() => {}); // keeps the frame loop alive while testing
  return null;
}
