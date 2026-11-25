// Gesture recognizer test: feeds synthetic finger paths (one or two fingers) through
// src/controller/gestures.js and checks which moves come out.  Run: npm test
import { createComboReader, createStrokeTracker } from '../src/controller/gestures.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DT = 8; // ms between touch samples (~120 Hz)

function rig() {
  const out = [];
  const fingers = new Map(); // id -> {holding, topRight}
  const reader = createComboReader({
    pointers: () => [...fingers.entries()].map(([id, f]) => ({ id, ...f })),
    onPush: () => out.push('push'),
    onPop: (power, nose) => out.push(nose ? 'nollie' : 'pop'),
    onTrick: (type, side) => out.push(`${type}${side < 0 ? '-' : ''}`),
    onRevert: (dir) => out.push(`revert${dir < 0 ? '-' : '+'}`),
  });
  const tracker = createStrokeTracker({ onSegment: (e) => reader.segment(e), onArc: (e) => reader.arc(e), minSegPx: 24 });
  // Animate one finger along a list of points (already dense) with optional start delay.
  async function finger(id, pts, { delay = 0, hold = null, at = {}, pause = {} } = {}) {
    await sleep(delay);
    fingers.set(id, { holding: false, topRight: false });
    tracker.down(id, pts[0][0], pts[0][1]);
    for (const [i, [x, y]] of pts.slice(1).entries()) {
      at[i]?.();
      await sleep(DT + (pause[i] ?? 0));
      tracker.move(id, x, y, performance.now());
    }
    if (hold) {
      fingers.set(id, { holding: true, topRight: hold === 'tr' });
      return () => (tracker.up(id), fingers.delete(id));
    }
    tracker.up(id);
    fingers.delete(id);
  }
  return { out, finger };
}

// Path builders. Screen coords: y grows downward.
const line = (x0, y0, x1, y1, px = 12) => {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / px));
  return Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
};
const chain = (...segs) => segs.reduce((a, s) => a.concat(a.length ? s.slice(1) : s), []);
// Arc around (cx, cy) from angle a0 to a1 (radians, screen coords: 0 = right, +90° = down).
const arc = (cx, cy, r, a0, a1, px = 12) => {
  const n = Math.max(4, Math.round((Math.abs(a1 - a0) * r) / px));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
};
const D = Math.PI / 180;

const tests = {
  'push': async ({ finger }) => finger(1, line(200, 300, 200, 420)),
  'nollie (↑ then ↓)': async ({ finger }) => finger(1, chain(line(200, 420, 200, 300), line(200, 300, 200, 420))),
  'nollie kickflip': async ({ finger }) => {
    await finger(1, chain(line(200, 420, 200, 300), line(200, 300, 200, 420)));
    await finger(2, line(200, 300, 260, 240));
  },
  'ollie (sharp zig-zag)': async ({ finger }) => finger(1, chain(line(200, 300, 200, 420), line(200, 420, 200, 320))),
  'ollie (rounded hairpin)': async ({ finger }) =>
    finger(1, chain(line(200, 300, 200, 420), arc(212, 420, 12, 180 * D, 0 * D, 4), line(224, 420, 224, 320))),
  'ollie (two separate swipes)': async ({ finger }) => {
    await finger(1, line(200, 300, 200, 420));
    await finger(2, line(200, 420, 200, 320), { delay: 60 });
  },
  'slightly curved push (thumb arc)': async ({ finger }) => finger(1, arc(420, 360, 220, 190 * D, 160 * D, 6)),
  'kickflip ↗': async ({ finger }) => finger(1, chain(line(200, 300, 200, 420), line(200, 420, 200, 320), line(200, 320, 270, 250))),
  'no trick on ↙ alone (no hold)': async ({ finger }) => finger(1, chain(line(200, 300, 200, 420), line(200, 420, 200, 320), line(200, 320, 130, 390))),
  'kickflip ↖': async ({ finger }) => finger(1, chain(line(200, 300, 200, 420), line(200, 420, 200, 320), line(200, 320, 130, 250))),
  'tre flip (same finger: ↓↑, hold, ↙)': async ({ finger }) => {
    const ollie = chain(line(150, 300, 150, 420), line(150, 420, 150, 320));
    await finger(1, chain(ollie, line(150, 320, 80, 390)), { pause: { [ollie.length - 1]: 200 } });
  },
  'tre flip (another finger resting anywhere + ↓↑↙)': async ({ finger }) => {
    const release = await finger(9, [[100, 600], [101, 601]], { hold: 'any' });
    await sleep(120);
    await finger(1, chain(line(250, 300, 250, 420), line(250, 420, 250, 320), line(250, 320, 180, 390)));
    release();
  },
  'kickflip after a pause (↓↑, hold, ↗)': async ({ finger }) => {
    const ollie = chain(line(150, 300, 150, 420), line(150, 420, 150, 320));
    await finger(1, chain(ollie, line(150, 320, 220, 250)), { pause: { [ollie.length - 1]: 200 } });
  },
  'varial flip (↓↑↗ + ↙ second finger)': async ({ finger }) => {
    // Second finger lands as the first one pops, and swipes down-left as the first flicks up-right.
    let b;
    const p1 = chain(line(150, 300, 150, 420), line(150, 420, 150, 320), line(150, 320, 220, 250));
    const startFlick = p1.length - 9;
    await finger(1, p1, { at: { [startFlick - 2]: () => (b = finger(2, line(300, 300, 230, 370))) } });
    await b;
  },
  'tre flip (hold top-right + ↓↑↙)': async ({ finger }) => {
    const release = await finger(9, [[320, 120], [321, 121]], { hold: 'tr' });
    await sleep(120);
    await finger(1, chain(line(150, 300, 150, 420), line(150, 420, 150, 320), line(150, 320, 80, 390)));
    release();
  },
  'pop shove-it (→ + ↙ together)': async ({ finger }) => {
    await Promise.all([finger(1, line(120, 300, 220, 300)), finger(2, line(320, 300, 250, 370), { delay: 30 })]);
  },
  'revert (half circle, one finger)': async ({ finger }) => finger(1, arc(200, 300, 70, -90 * D, 90 * D)),
  'revert other way': async ({ finger }) => finger(1, arc(200, 300, 70, -90 * D, -270 * D)),
  'frontside 180 (↓↑, left arcs down, right arcs up)': async ({ finger }) => {
    await finger(1, chain(line(200, 300, 200, 420), line(200, 420, 200, 320)));
    await Promise.all([
      finger(2, arc(150, 300, 60, -90 * D, -270 * D)), // left side, top -> left -> bottom (going down)
      finger(3, arc(300, 300, 60, 90 * D, -90 * D), { delay: 20 }), // right side, bottom -> right -> top (going up)
    ]);
  },
  'backside 180 (↓↑ then one clockwise half circle)': async ({ finger }) => {
    await finger(1, chain(line(200, 300, 200, 420), line(200, 420, 200, 320)));
    await finger(2, arc(200, 300, 60, -90 * D, 90 * D));
  },
};

Object.assign(tests, {
  'kickflip, rounded corner into the flick': async ({ finger }) =>
    finger(1, chain(line(200, 300, 200, 420), line(200, 420, 200, 340), arc(220, 340, 20, 180 * D, 225 * D, 5), line(205.9, 325.9, 260, 272))),
  'ollie, wider hairpin (r=22)': async ({ finger }) =>
    finger(1, chain(line(200, 300, 200, 420), arc(222, 420, 22, 180 * D, 0 * D, 5), line(244, 420, 244, 330))),
  'revert, small half circle (r=35)': async ({ finger }) => finger(1, arc(200, 300, 35, -90 * D, 90 * D, 6)),
  'revert, big half circle (r=130)': async ({ finger }) => finger(1, arc(200, 400, 130, -90 * D, -270 * D, 12)),
  'sloppy diagonal flick after ollie (curved 20°)': async ({ finger }) =>
    finger(1, chain(line(200, 300, 200, 420), line(200, 420, 200, 320), arc(320, 320, 120, 180 * D, 200 * D, 8).map(([x, y]) => [x, y - 0]), line(207.2, 279, 160, 250))),
});

const expect = {
  'kickflip, rounded corner into the flick': 'push pop kickflip',
  'ollie, wider hairpin (r=22)': 'push pop',
  'revert, small half circle (r=35)': 'revert-',
  'revert, big half circle (r=130)': 'revert+',
  'sloppy diagonal flick after ollie (curved 20°)': 'push pop kickflip-',
  'push': 'push',
  'nollie (↑ then ↓)': 'nollie',
  'nollie kickflip': 'nollie kickflip',
  'ollie (sharp zig-zag)': 'push pop',
  'ollie (rounded hairpin)': 'push pop',
  'ollie (two separate swipes)': 'push pop',
  'slightly curved push (thumb arc)': 'push',
  'kickflip ↗': 'push pop kickflip',
  'no trick on ↙ alone (no hold)': 'push pop',
  'kickflip ↖': 'push pop kickflip-',
  'tre flip (same finger: ↓↑, hold, ↙)': 'push pop tre-',
  'tre flip (another finger resting anywhere + ↓↑↙)': 'push pop tre-',
  'kickflip after a pause (↓↑, hold, ↗)': 'push pop kickflip',
  'varial flip (↓↑↗ + ↙ second finger)': 'push pop varial',
  'tre flip (hold top-right + ↓↑↙)': 'push pop tre-',
  'pop shove-it (→ + ↙ together)': 'shove',
  'revert (half circle, one finger)': 'revert-',
  'revert other way': 'revert+',
  'frontside 180 (↓↑, left arcs down, right arcs up)': 'push pop fs180',
  'backside 180 (↓↑ then one clockwise half circle)': 'push pop bs180',
};

let fails = 0;
for (const [name, run] of Object.entries(tests)) {
  const r = rig();
  await run(r);
  await sleep(700); // let timers settle and the combo/trick windows close
  const got = r.out.join(' ');
  const ok = got === expect[name];
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${got}${ok ? '' : `   (expected: ${expect[name]})`}`);
}
process.exit(fails ? 1 : 0);
