// Finger paths for the demo scripts (demos.js `swipe: 'ollie'` etc.).
//
// A gesture is a list of fingers: { delay (s after the step's `at`), pts: [[x, y, t], ...] }. x / y are on the
// phone's deck area, 0..1 (x to the right, y down: the nose is at the top, the tail at the bottom); t is seconds
// from that finger touching down. The finger lifts at its last point. Between points it moves in a straight line.
// The demo feeds these through the real gesture reader (controller/gestures.js), as if they were real touches.

// The deck area of the drawn phone, in phone pixels (the real page's deck is about this size on a 390 x 844 phone).
export const DECK = { w: 358, h: 520 };

// A half circle (or part of one) drawn in deck pixels so it stays round: centre (cx, cy) and radius r in 0..1 of the
// deck width, from angle a0 to a1 in degrees (0 = right, 90 = down), over `dur` seconds.
export function arc(cx, cy, r, a0, a1, dur, t0 = 0) {
  const n = 26;
  const R = r * DECK.w;
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + (Math.cos(a) * R) / DECK.w, cy + (Math.sin(a) * R) / DECK.h, t0 + (dur * i) / n];
  });
}

const OLLIE = [[0.5, 0.42, 0], [0.5, 0.72, 0.12], [0.5, 0.34, 0.24]];
const after = (pts, more) => pts.concat(more);

export const GESTURES = {
  push: [{ delay: 0, pts: [[0.5, 0.38, 0], [0.5, 0.72, 0.17]] }],
  ollie: [{ delay: 0, pts: OLLIE }],
  nollie: [{ delay: 0, pts: [[0.5, 0.66, 0], [0.5, 0.36, 0.12], [0.5, 0.7, 0.24]] }],
  kickflip: [{ delay: 0, pts: after(OLLIE, [[0.74, 0.16, 0.34]]) }],
  // Varial: ollie, then two fingers at once: the first flicks up-right, a second one down-left.
  varial: [
    { delay: 0, pts: after(OLLIE, [[0.72, 0.17, 0.34]]) },
    { delay: 0.25, pts: [[0.42, 0.5, 0], [0.22, 0.74, 0.09]] },
  ],
  // Tre flip: ollie, rest the finger a moment at the top, then flick down-left.
  tre: [{ delay: 0, pts: after(OLLIE, [[0.5, 0.34, 0.46], [0.27, 0.6, 0.56]]) }],
  // Pop shove-it: two fingers at the same time, one right, one down-left.
  shove: [
    { delay: 0, pts: [[0.22, 0.52, 0], [0.5, 0.52, 0.12]] },
    { delay: 0.02, pts: [[0.8, 0.4, 0], [0.6, 0.62, 0.12]] },
  ],
  // One finger draws a half circle (counter-clockwise: top, left side, bottom).
  halfCircle: [{ delay: 0, pts: arc(0.5, 0.5, 0.24, -90, -270, 0.4) }],
  // Ollie, then a half circle with another finger: a 180 in the air (or a boardslide when you land on a rail).
  ollie180: [
    { delay: 0, pts: OLLIE },
    { delay: 0.3, pts: arc(0.5, 0.5, 0.24, -90, -270, 0.36) },
  ],
  // A half circle given up partway (a quarter-ish): on a grind, that's a bail.
  ollieHalfStop: [
    { delay: 0, pts: OLLIE },
    { delay: 0.3, pts: arc(0.5, 0.5, 0.24, -90, -175, 0.3) },
  ],
};
