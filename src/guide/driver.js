// Plays a demo script (demos.js) as phone input, inside the demo iframe. Every frame it works out what the scripted
// phone is doing (fingers on the deck, tilt, joystick, button presses) and feeds it to the game exactly the way the
// real phone's input arrives: swipes go through the real gesture reader (controller/gestures.js) and come out as the
// same events (phoneEvents.js); tilt and the joystick go into the same `phone` state the laptop fills from the tilt
// stream. It also returns a record of the phone for that frame, which draws the phone and finger in the guide.
import { createComboReader, createStrokeTracker } from '../controller/gestures.js';
import { STAGE_PIPS, TRICK_LABEL } from '../controller/Controller.jsx';
import { SWIPE_MIN } from '../display/tuning.js';
import { applyPhoneEvent } from '../phoneEvents.js';
import { board, haptics, phone } from '../state.js';
import { settings, updateSettings } from '../settings.js';
import { CHOICES, CHOICE_UI } from '../shared.js';
import { DECK, GESTURES } from './fingers.js';

const PHONE_H = 844; // the real phone page's height the swipe threshold is measured against
const HOLD_MS = 90; // as Controller.jsx: a finger resting this long counts as holding
const HOLD_SLOP_PX = 14;
const EASE = 0.22; // s to tilt / push the stick in and back out
const SUB = 4; // finger samples per frame (like coalesced pointer events)

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// 0..1: how much a held input (tilt, stick) is on at time T, easing in after `at` and out after `to`.
const envelope = (s, T) => smooth((T - s.at) / EASE) * (1 - smooth((T - s.to) / EASE));

// Position of a finger path at time u (s since touch-down): straight lines between the points.
function pathAt(pts, u) {
  if (u <= pts[0][2]) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (u <= b[2]) {
      const k = (u - a[2]) / Math.max(1e-6, b[2] - a[2]);
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, u];
    }
  }
  return pts[pts.length - 1];
}

const viewName = CHOICE_UI.find(([k]) => k === 'camera')[2];

// The joystick pointing at the loose board (after a fall), relative to the camera like the real joystick
// (Skateboard.jsx: camera forward * up + camera right * right).
function stickToBoard(camera) {
  const l = board.loose;
  if (!l || !camera) return [0, 0];
  const dx = l.x - board.x, dz = l.z - board.z;
  const d = Math.hypot(dx, dz) || 1;
  const v = camera.getWorldDirection(camera.position.clone());
  const cl = Math.hypot(v.x, v.z) || 1;
  const cx = v.x / cl, cz = v.z / cl;
  const m = d < 1.2 ? 0.45 : 0.85;
  return [((-cz * dx + cx * dz) / d) * m, ((cx * dx + cz * dz) / d) * m];
}

// env.camera(): the demo scene's camera (for the joystick helper).
export function createDriver(demo, env = {}) {
  const steps = demo.steps ?? [];
  let T = 0; // script time of the current frame (s)
  const now = () => performance.now();

  // Virtual timers for the gesture reader (its two-finger wait), fired as the demo clock passes them.
  const timers = [];
  let nextId = 1;
  const vt = {
    set: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, at: now() + ms, fn });
      return id;
    },
    clear: (id) => {
      const i = timers.findIndex((x) => x.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
  };

  const rec = { flash: null, ring: null, tapFlash: null, pips: 0, pipsUntil: -1, sheet: false, press: null, lastTap: -9, back: 0 };
  const send = (ev, d, label) => {
    applyPhoneEvent(ev, d);
    if (label) rec.flash = { label, t: T };
  };

  // Fingers on the deck: id -> { x, y (deck px), restX, restY, restT }
  const touches = new Map();
  const reader = createComboReader({
    pointers: () => [...touches.entries()].map(([id, p]) => ({ id, holding: now() - p.restT > HOLD_MS })),
    timers: vt,
    now,
    onPush: (power) => send('push', { power }, 'PUSH'),
    onPop: (power, nose = false) => send('pop', { power, nose }, nose ? 'NOLLIE' : 'OLLIE'),
    onTrick: (type, side) => send('trick', { type, side }, TRICK_LABEL[type] ?? type),
    onRevert: (dir) => send('revert', { dir }, 'REVERT'),
    onPartial: () => {
      applyPhoneEvent('partial', {});
      rec.ring = { ok: false, t: T };
    },
    onStage: (stage) => {
      rec.pips = STAGE_PIPS[stage] ?? 0;
      rec.pipsUntil = T + 0.6;
    },
  });
  const tracker = createStrokeTracker({
    onSegment: (ev) => reader.segment(ev),
    onArc: (ev) => {
      rec.ring = { ok: true, t: T }; // the guide's green "drawn right" flash
      reader.arc(ev);
    },
    onPartialArc: () => reader.partial(),
    minSegPx: Math.max(16, PHONE_H * SWIPE_MIN),
  });

  // Every finger stroke in the script, with its own id and absolute start time.
  let fid = 0;
  const strokes = [];
  for (const s of steps) {
    if (!s.swipe) continue;
    const fingers = typeof s.swipe === 'string' ? GESTURES[s.swipe] : s.swipe;
    if (!fingers) throw new Error(`demos.js: unknown swipe "${s.swipe}"`);
    for (const f of fingers) strokes.push({ id: ++fid, start: s.at + (f.delay ?? 0), pts: f.pts, end: s.at + (f.delay ?? 0) + f.pts[f.pts.length - 1][2], down: false, up: false });
  }

  function press(target) {
    rec.press = { target, t: T };
    if (target === 'onoff') send('carry', {});
    else if (target === 'jump') send('jump', {});
    else if (target === 'tap') {
      send('grindTap', {});
      rec.lastTap = T;
    } else if (target === 'view') {
      const views = CHOICES.camera;
      const next = views[(views.indexOf(settings.camera) + 1) % views.length];
      updateSettings({ camera: next });
      rec.flash = { label: `VIEW: ${viewName[next].toUpperCase()}`, t: T };
    } else if (target === 'settings') rec.sheet = true;
    else if (target === 'done') rec.sheet = false;
    else if (target === 'goofy' || target === 'regular') updateSettings({ stance: target });
    else if (target === 'setspawn') send('setSpawn', {}, 'SPAWN SET');
    else if (target === 'tospawn') send('reset', {}, 'TO SPAWN');
  }

  function fingersAt(ts) {
    const tms = now() - (T - ts) * 1000;
    for (const st of strokes) {
      if (st.up || ts < st.start) continue;
      const [x, y] = pathAt(st.pts, ts - st.start);
      const px = x * DECK.w, py = y * DECK.h;
      if (!st.down) {
        st.down = true;
        tracker.down(st.id, px, py, tms);
        touches.set(st.id, { x: px, y: py, restX: px, restY: py, restT: tms });
        continue;
      }
      const tp = touches.get(st.id);
      if (Math.hypot(px - tp.x, py - tp.y) > 0.3) {
        tracker.move(st.id, px, py, tms);
        tp.x = px;
        tp.y = py;
        if (Math.hypot(px - tp.restX, py - tp.restY) > HOLD_SLOP_PX) (tp.restX = px), (tp.restY = py), (tp.restT = tms);
      }
      if (ts >= st.end) {
        st.up = true;
        touches.delete(st.id);
        tracker.up(st.id);
      }
    }
  }

  const tap = { inPass: false, done: false };

  return {
    // Advance the script from T0 to T1 (s). Call before the game's frame at T1 (performance.now() already at T1).
    update(T0, T1) {
      T = T1;
      if (rec.press?.hover) rec.press = null; // a timing step sets it again while it lasts
      for (let k = 1; k <= SUB; k++) fingersAt(T0 + ((T1 - T0) * k) / SUB);
      for (const tm of timers.slice()) if (tm.at <= now()) vt.clear(tm.id), tm.fn();
      for (const s of steps) if (s.press && s.at > T0 && s.at <= T1) press(s.press);

      // Tilt (steer / lean: the shaped -1..1 values the phone sends), the manual helper, and the joystick.
      let steer = 0, lean = 0, jx = 0, jy = 0;
      for (const s of steps) {
        if (s.tilt && T1 > s.at - 0.01) {
          const e = envelope(s, T1);
          steer += (s.tilt.steer ?? 0) * e;
          lean += (s.tilt.lean ?? 0) * e;
        }
        if (s.stick && T1 > s.at - 0.01) {
          const e = envelope(s, T1);
          const [x, y] = s.stick === 'toBoard' ? stickToBoard(env.camera?.()) : s.stick;
          jx += x * e;
          jy += y * e;
        }
        if (s.balance && T1 >= s.at && T1 < s.to + EASE) {
          // Manual: tilt the top of the phone up to lift the front wheels, then follow the green zone with the tilt
          // (like a player watching the bar). 'tooFar': after a while keep leaning back until you fall.
          const zone = board.anim.zone;
          let want = zone ? zone.c : 0.55;
          if (s.balance === 'tooFar' && T1 > (s.at + s.to) / 2) want = Math.min(1, 0.6 + (T1 - (s.at + s.to) / 2) * 0.5);
          if (T1 > s.to) want = 0;
          rec.back += (want - rec.back) * 0.12;
          lean -= rec.back;
        }
        if (s.timing && T1 >= s.at && T1 <= s.to) {
          // Long grind: tap the TAP button when the marker is in the green ('hit'), or at the wrong moments ('miss').
          const t = board.anim.timing;
          rec.press = { target: 'tap', t: rec.lastTap, hover: true };
          if (t) {
            const off = Math.abs(t.m - 0.5);
            const dir = Math.sign(t.m - (tap.prevM ?? t.m));
            tap.prevM = t.m;
            if (s.timing === 'hit') {
              // Just past the middle: a phone tap is judged where the marker was a moment earlier (grinding.js).
              const inZone = off <= t.zw;
              if (inZone && !tap.inPass && (t.m - 0.5) * dir >= 0 && off < t.zw * 0.6) (tap.inPass = true), press('tap');
              if (!inZone) tap.inPass = false;
            } else {
              const atEnd = off > 0.4;
              if (atEnd && !tap.done) (tap.done = true), press('tap');
              if (off < 0.2) tap.done = false;
            }
          }
        }
      }
      if (!steps.some((s) => s.balance && T1 >= s.at && T1 < s.to + EASE)) rec.back = 0;
      Object.assign(phone, { steer: Math.max(-1, Math.min(1, steer)), lean: Math.max(-1, Math.min(1, lean)), jx, jy, lastUpdate: now() });
      phone.packets++;

      // Haptics the game sent the phone: the TAP button flashes green / red on each tap's result.
      for (const h of haptics) if (h === 'tapGood' || h === 'tapMiss') rec.tapFlash = { kind: h === 'tapGood' ? 'good' : 'miss', t: T };
      haptics.length = 0;
    },

    // What the phone looks like this frame (drawn by the guide's PhoneMock).
    record() {
      const v = board.view;
      const fingers = [];
      for (const [id, p] of touches) fingers.push([id, +(p.x / DECK.w).toFixed(4), +(p.y / DECK.h).toFixed(4)]);
      const stickOn = steps.some((s) => s.stick && T >= s.at - 0.35 && T <= s.to + EASE + 0.2);
      const press = rec.press && (rec.press.hover || T - rec.press.t < 0.3) ? rec.press : nextPress();
      return {
        t: +T.toFixed(4),
        fingers,
        press: press ? { target: press.target, s: +(T - press.t).toFixed(3), hover: !!press.hover } : null,
        stick: stickOn ? [phone.jx, phone.jy] : null,
        tilt: [phone.steer, phone.lean],
        mode: v.mode ?? 'ride',
        tapOn: !!v.tap,
        view: { roll: v.roll, pitch: v.pitch, yaw: v.yaw, spin: v.spin, lift: v.lift, height: v.height },
        flash: rec.flash,
        ring: rec.ring,
        tapFlash: rec.tapFlash,
        pips: T < rec.pipsUntil ? rec.pips : 0,
        sheet: rec.sheet,
        stance: settings.stance,
        camera: settings.camera,
      };
    },
  };

  // A press coming up soon: the finger moves over the button first.
  function nextPress() {
    const s = steps.find((x) => x.press && x.at > T && x.at - T < 0.35);
    return s ? { target: s.press, t: s.at } : null;
  }
}
