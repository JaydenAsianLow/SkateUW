import { useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { board, game, phone } from '../state.js';
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

// ?grindtest=<line id>,<gesture>,<freeze s>[,<speed>][,<from end>][,<mode>][,<side offset m>][,<angle deg>][,<pop s>]:
// mode air (default): drops the board in the air just before a grind line (?grinddebug lists the ids), moving along
// it, as if ollied onto it. mode ollie: rolls up on the ground 2.5 m before it (side offset, angle) and ollies after
// <pop s>. mode curb: rolls toward a curb's edge from its low side at <angle> (no ollie).
// gesture = none | arc | partial is sent the moment it locks on; ollieout pops 1 s into the grind. freeze = stop everything that long after locking on (for a screenshot; 0 = never). Writes what
// happened into <pre id="grindtest"> (read it with a headless browser's --dump-dom).
const GTEST = import.meta.env.DEV && urlParams.get('grindtest')?.split(',');
export function GrindTest() {
  useEffect(() => {
    if (!GTEST) return undefined;
    const [id, gesture = 'none', freeze = '0', spd = '4', fromEnd = '0', mode = 'air', offs = '0', ang = '0', popAt = '0.3'] = GTEST;
    const log = [];
    const pre = document.createElement('pre');
    pre.id = 'grindtest';
    document.body.appendChild(pre);
    const out = () => (pre.textContent = log.join('\n'));
    let phase = 'wait';
    let lockT = 0;
    let lastTrick = null;
    const t0 = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      const g = window.__skate?.grind;
      if (phase === 'wait') {
        if (!g?.ready || !game.running || now - t0 < 1500) return;
        const line = g.lines.find((l) => l.id === id);
        if (!line) return log.push(`no line ${id}`), out(), clearInterval(tick);
        const back = fromEnd === '1';
        const a = back ? line.pts[line.pts.length - 1] : line.pts[0];
        const b = back ? line.pts[line.pts.length - 2] : line.pts[1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
        const h = Math.hypot(u[0], u[2]);
        const v = Number(spd);
        const hx = u[0] / h, hz = u[2] / h; // along the line, in plan
        let sx = -hz, sz = hx; // sideways
        if (line.inner) (sx = -line.inner[0]), (sz = -line.inner[1]); // the open (low) side of an edge
        if (mode === 'air') {
          // 0.5 m along the line, 0.3 m above it, moving along it and slightly down
          const x = a[0] + u[0] * 0.5, z = a[2] + u[2] * 0.5, y = a[1] + u[1] * 0.5 + 0.3 + 0.06;
          window.__skate.place({ x, y, z, heading: Math.atan2(-hx, -hz), vx: hx * v, vy: -0.3, vz: hz * v, popped: true });
        } else {
          // on the ground beside the start, `offs` m out to the side, `back` m before it, heading in at `ang` degrees
          const back = mode === 'curb' ? 1.0 : 2.5;
          const o = Number(offs), an = (Number(ang) * Math.PI) / 180;
          const dx = hx * Math.cos(an) - sx * Math.sin(an), dz = hz * Math.cos(an) - sz * Math.sin(an);
          // aim so the path crosses the line `cross` m along it (0.6 when head-on, the middle when angled)
          const cross = an === 0 ? 0.6 : Math.min(3, line.length / 2);
          const x = a[0] + hx * cross - dx * back + sx * o * (an === 0 ? 1 : 0), z = a[2] + hz * cross - dz * back + sz * o * (an === 0 ? 1 : 0);
          const y = a[1] - line.height + 0.1;
          window.__skate.place({ x, y, z, heading: Math.atan2(-dx, -dz), vx: dx * v, vy: 0, vz: dz * v, popped: false });
          if (mode === 'ollie') setTimeout(() => (phone.popQueued = 1), Number(popAt) * 1000);
        }
        log.push(`line ${id} ${line.type} ${line.long ? 'long' : 'short'} ${line.length.toFixed(1)}m h${line.height.toFixed(2)}, gesture ${gesture}, ${mode} at ${v} m/s`);
        phase = 'fly';
        out();
        return;
      }
      const b = board;
      if (b.trick && b.trick !== lastTrick) (lastTrick = b.trick), log.push(`t=${((now - t0) / 1000).toFixed(2)} callout: ${b.trick.name}`), out();
      if (phase === 'fly' && b.grind) {
        phase = 'grind';
        lockT = now;
        log.push(`locked on ${b.grind.id} (${b.grind.type}) at (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)})`);
        if (gesture === 'arc') phone.revertQueued = 1;
        if (gesture === 'partial') phone.partialQueued = true;
        if (gesture === 'ollieout') setTimeout(() => (phone.popQueued = 1), 1000);
        out();
      }
      if (phase === 'grind') {
        if (b.grind) log.push(`  ${((now - lockT) / 1000).toFixed(2)}s ${b.grind.kind} speed ${b.speed.toFixed(2)} y ${b.y.toFixed(2)} balance ${(b.anim.balance ?? -1).toFixed(2)}`);
        else (phase = 'after'), log.push(`left the line after ${((now - lockT) / 1000).toFixed(2)}s, mode ${b.mode}`);
        if (Number(freeze) > 0 && b.grind && now - lockT > Number(freeze) * 1000) (window.__skate.freeze = true), log.push('frozen'), clearInterval(tick);
        out();
      }
      if (phase === 'after' && now - lockT > 6000) clearInterval(tick);
    }, 100);
    return () => clearInterval(tick);
  }, []);
  return null;
}
