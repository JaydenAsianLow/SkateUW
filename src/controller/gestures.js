// Swipe gesture recognition for the skateboard controller. Multi-touch.
//
// Two layers:
//  1. createStrokeTracker: follows every finger on the deck. Splits each finger's path into
//     straight-ish segments ('D', 'U', 'UR', ...) and spots half-circle strokes (arcs).
//     A curving stroke holds its segments back briefly, so drawing a half circle doesn't also push.
//  2. createComboReader: turns segments, arcs and held fingers into skate moves:
//       D                                   -> push
//       D, U                                -> ollie (fires immediately)
//       U, D                                -> nollie (pops off the nose; no push)
//       D, U, UR (or UL)                    -> kickflip (UL spins it the other way)
//       D, U, then UR + DL with two fingers -> varial flip
//       D, U, hold, DL                      -> tre flip. The hold is the same finger resting a moment at the top of
//                                              the up-swipe before flicking down-left, or another finger resting
//                                              anywhere on the deck. A down diagonal with no hold is no trick.
//       R + DL with two fingers             -> pop shove-it (pops by itself)
//       half circle                         -> revert (on the ground)
//       D, U, then half circle(s)           -> frontside 180 (left finger arcs down, right finger arcs up)
//                                              or backside 180 (the opposite way)
//       half circle started, not finished   -> partial (a bail if it's the trick choice on a grind)

const STEP_PX = 6; // resample distance; smooths out touch jitter
const TURN_DEG = 38; // a step this far off the segment's direction starts a new segment (up -> up-right is 45°)
const CORNER_DEG = 40; // turning this much within two steps (~12 px) is a corner (zig-zag), not a curve
const REVERSE_DEG = 14; // turning back the other way this much ends a curve
const CURVE_DEG = 15; // a stroke that has curved this much might be a half circle: hold its segments back
const ARC_DEG = 115; // smooth turning that counts as a half circle (fires before you finish drawing it)
const ARC_MIN_PX = 55;
const PARTIAL_DEG = 55; // a smooth curve this far round, let go before ARC_DEG, is a half circle given up halfway
const COMBO_GAP_MS = 550; // max time between segments of one combo
// After the pop, trick swipes still upgrade the ollie. Sized for the display's default airtime
// (~0.9 s in the air, settings.js); the display still rejects a trick that comes too late for its setting.
const TRICK_WINDOW_MS = 820;
const ARC_WINDOW_MS = 1050; // half circles take longer to draw
const MULTI_MS = 130; // two fingers within this time count as "at the same time"
const HOLD_MS = 120; // a finger resting this long, then moving on, marks its next swipe as "after a hold"

const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 0° = up (toward the nose), 90° = right, ±180° = down (toward the tail).
export function classify(dx, dy) {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const a = Math.abs(deg);
  const side = deg < 0 ? 'L' : 'R';
  if (a <= 25) return 'U';
  if (a >= 155) return 'D';
  if (a < 70) return 'U' + side;
  if (a > 110) return 'D' + side;
  return side;
}

const newRun = () => ({ turn: 0, len: 0, dx: 0, dy: 0, sx: 0, n: 0 });

export function createStrokeTracker({ onSegment, onArc, onPartialArc, minSegPx = 24 }) {
  const fingers = new Map();
  const cosTurn = Math.cos(TURN_DEG * RAD);

  const flush = (f) => {
    for (const ev of f.pending.splice(0)) onSegment(ev);
  };

  function step(id, f, vx, vy, len, t, x) {
    // Rested a moment and moving again: the next swipe comes "after a hold" (tre flip), and starts fresh.
    if (t - f.lastT > HOLD_MS) {
      flush(f);
      f.seg = null;
      f.run = newRun();
      f.prevAng = null;
      f.prevD = 0;
      f.afterHold = true;
    }
    f.lastT = t;
    // Curvature: how much the stroke has turned smoothly since the last corner.
    const ang = Math.atan2(vy, vx);
    if (f.prevAng != null) {
      const d = wrap(ang - f.prevAng);
      if (Math.abs(d) + Math.abs(f.prevD) > CORNER_DEG * RAD) {
        // A corner: the zig-zag of an ollie, or the kink into a flick. Start measuring a new curve.
        flush(f);
        f.run = newRun();
        f.prevD = 0;
      } else if (f.run.turn * d < 0 && Math.abs(d) > REVERSE_DEG * RAD) {
        flush(f);
        f.run = newRun();
        f.run.turn = d;
        f.prevD = d;
      } else {
        f.run.turn += d;
        f.prevD = d;
      }
    }
    f.prevAng = ang;
    const r = f.run;
    r.len += len;
    r.dx += vx;
    r.dy += vy;
    r.sx += x;
    r.n++;
    const ratio = Math.hypot(r.dx, r.dy) / (r.len || 1); // 0.64 for a half circle, ~0 for a hairpin zig-zag
    if (!f.arced && Math.abs(r.turn) >= ARC_DEG * RAD && r.len >= ARC_MIN_PX && ratio > 0.35 && ratio < 0.92) {
      f.arced = true;
      f.pending.length = 0;
      // sense: +1 = clockwise on screen, -1 = counter-clockwise. dy > 0 = the stroke went down overall.
      onArc({ id, sense: r.turn > 0 ? 1 : -1, dy: r.dy, x: r.sx / r.n, t });
    }

    // Straight segments.
    if (f.seg) {
      const sl = Math.hypot(f.seg.dx, f.seg.dy) || 1;
      if ((vx * f.seg.dx + vy * f.seg.dy) / (len * sl) < cosTurn) f.seg = null; // direction changed
    }
    if (!f.seg) f.seg = { dx: 0, dy: 0, len: 0, t0: t, confirmed: false };
    const sg = f.seg;
    sg.dx += vx;
    sg.dy += vy;
    sg.len += len;
    if (!sg.confirmed && sg.len >= minSegPx) {
      sg.confirmed = true;
      if (f.arced) return; // the rest of a half circle is not a swipe
      const ev = { id, dir: classify(sg.dx, sg.dy), len: sg.len, speed: sg.len / Math.max(16, t - sg.t0), t, held: f.afterHold };
      f.afterHold = false;
      if (Math.abs(r.turn) > CURVE_DEG * RAD) f.pending.push(ev);
      else {
        flush(f);
        onSegment(ev);
      }
    }
  }

  return {
    down(id, x, y, t = performance.now()) {
      fingers.set(id, { last: { x, y }, seg: null, prevAng: null, prevD: 0, run: newRun(), pending: [], arced: false, lastT: t, afterHold: false });
    },
    move(id, x, y, t) {
      const f = fingers.get(id);
      if (!f) return;
      const vx = x - f.last.x;
      const vy = y - f.last.y;
      const len = Math.hypot(vx, vy);
      if (len < STEP_PX) return;
      step(id, f, vx, vy, len, t, x);
      f.last = { x, y };
    },
    up(id) {
      const f = fingers.get(id);
      if (f && !f.arced) {
        const r = f.run;
        const ratio = Math.hypot(r.dx, r.dy) / (r.len || 1);
        if (Math.abs(r.turn) >= PARTIAL_DEG * RAD && r.len >= ARC_MIN_PX * 0.5 && ratio > 0.35) {
          f.pending.length = 0; // it was meant as a half circle: its straight bits are not swipes
          onPartialArc?.({ id, t: f.lastT });
        }
        flush(f);
      }
      fingers.delete(id);
    },
  };
}

// speed is px/ms; ~0.3 is a lazy swipe, ~2 is a hard flick. Map to 0.75..1.3 (lazy swipes still count).
const power = (speed) => clamp(0.8 + (speed - 0.3) * 0.4, 0.75, 1.3);

// pointers() -> [{ id, holding }] for every finger currently on the deck (holding = resting still).
// timers / now: the clock (the Controls guide's demos run the reader on their own virtual clock).
const REAL_TIMERS = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
export function createComboReader({ onPush, onPop, onTrick, onRevert, onPartial, onStage, pointers, timers = REAL_TIMERS, now = () => performance.now() }) {
  let stage = 'idle'; // 'idle' | 'down' | 'up' | 'pop'
  let lastT = -Infinity;
  let popT = -Infinity;
  let trickSent = false;
  let flicks = [];
  let arcs = [];
  let flickTimer = 0;
  let arcTimer = 0;
  const inPop = (win) => stage === 'pop' && now() - popT < win;
  const setStage = (s) => {
    stage = s;
    onStage?.(s);
  };
  // Is another finger on the deck that might still swipe as the partner of a two-finger move?
  const partnerPossible = (ids) => pointers().some((p) => !ids.has(p.id) && !p.holding);

  function resolveFlicks() {
    timers.clear(flickTimer);
    const list = flicks;
    flicks = [];
    if (!list.length) return;
    const air = inPop(TRICK_WINDOW_MS + MULTI_MS) && !trickSent;
    const pair = (a, b) => list.some((x) => x.dir === a && list.some((y) => y.dir === b && y.id !== x.id));
    let type = null;
    let side = 1;
    if (pair('R', 'DL')) type = 'shove';
    else if (pair('L', 'DR')) (type = 'shove'), (side = -1);
    else if (air && pair('UR', 'DL')) type = 'varial';
    else if (air && pair('UL', 'DR')) (type = 'varial'), (side = -1);
    else if (air) {
      const f = list[0];
      side = f.dir.includes('L') ? -1 : 1;
      const held = f.held || pointers().some((p) => p.id !== f.id && p.holding);
      if (held && (f.dir === 'DL' || f.dir === 'DR')) type = 'tre';
      else if (f.dir === 'UR' || f.dir === 'UL') type = 'kickflip';
    }
    if (!type) return;
    if (type === 'shove' && !air) popT = now(); // from flat ground: the shove-it pops by itself
    stage = 'pop';
    trickSent = true;
    onTrick(type, side);
    onStage?.('trick');
  }

  function queueFlick(ev) {
    flicks.push(ev);
    const ids = new Set(flicks.map((f) => f.id));
    timers.clear(flickTimer);
    if (ids.size >= 2 || !partnerPossible(ids)) resolveFlicks();
    else flickTimer = timers.set(resolveFlicks, MULTI_MS);
  }

  function resolveArcs() {
    timers.clear(arcTimer);
    const list = arcs;
    arcs = [];
    if (!list.length) return;
    let ccw;
    if (list.length >= 2) {
      // Two hands: left finger going down + right finger going up turns the board counter-clockwise.
      const byX = [...list].sort((a, b) => a.x - b.x);
      ccw = byX[0].dy - byX.at(-1).dy > 0;
    } else ccw = list[0].sense < 0;
    if (inPop(ARC_WINDOW_MS)) {
      if (trickSent) return;
      trickSent = true;
      onTrick(ccw ? 'fs180' : 'bs180', 1);
    } else {
      onRevert(ccw ? 1 : -1);
      setStage('idle');
    }
    onStage?.('trick');
  }

  return {
    segment(ev) {
      const t = now();
      if (inPop(TRICK_WINDOW_MS)) {
        if (ev.dir === 'U' || ev.dir === 'D') return; // feet are in the air: no pushes
        if (!trickSent) queueFlick(ev);
        return;
      }
      if (t - lastT > COMBO_GAP_MS) stage = 'idle';
      lastT = t;
      if (ev.dir === 'D' && stage === 'up') {
        onPop(power(ev.speed), true); // nollie
        popT = t;
        trickSent = false;
        setStage('pop');
      } else if (ev.dir === 'D') {
        onPush(power(ev.speed));
        setStage('down');
      } else if (ev.dir === 'U' && stage === 'down') {
        onPop(power(ev.speed));
        popT = t;
        trickSent = false;
        setStage('pop');
      } else if (ev.dir !== 'U') {
        setStage('idle');
        queueFlick(ev); // maybe half of a two-finger pop shove-it
      } else setStage('up'); // maybe the start of a nollie
    },
    partial() {
      onPartial?.();
    },
    arc(ev) {
      arcs.push(ev);
      const ids = new Set(arcs.map((a) => a.id));
      timers.clear(arcTimer);
      if (ids.size >= 2 || !partnerPossible(ids)) resolveArcs();
      else arcTimer = timers.set(resolveArcs, MULTI_MS * 1.5);
    },
  };
}
