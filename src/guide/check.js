// Demo checks: play a demo through the real game (in the demo scene, nothing drawn) and see that the game did what
// the demo says it does (its `expect` list in demos.js). Open /?demo&check to check every demo after changing the
// game: a demo that no longer works (say, the ollie got weaker and misses the rail) shows up as a fail.
//
// Things the game can do, as `expect` tokens (matched in order; others may happen in between):
//   'trick:NAME'    a callout that starts with NAME ('trick:KICKFLIP', 'trick:50-50', 'trick:CAVEMAN')
//   'fall'          a bail or a slam
//   'grind:KIND'    a grind starts or changes: 'grind:5050', 'grind:boardslide'
//   'tap:good' / 'tap:miss'   a TAP on the timing bar landed in the green / missed
//   'mode:MODE'     on the board or off it: 'mode:ride', 'mode:carry' (board in hand), 'mode:find' (after a fall)
//   'phone:LABEL'   the phone flashed LABEL ('phone:PUSH', 'phone:SPAWN SET')
//   'camera:VIEW', 'stance:STANCE'   a setting changed
//   'turn:left' / 'turn:right'       the skater turned that way (a quarter turn or so)
//   'run'           running on foot;  'jump'   in the air on foot
import { board } from '../state.js';

export async function checkDemo(api, demo) {
  const got = [];
  const add = (tok, again = false) => (again || got[got.length - 1] !== tok) && got.push(tok); // again: a repeat is a new event
  await api.load(demo);
  let last = {};
  let ref = board.heading;
  const n = Math.round(demo.length * 60);
  for (let i = 0; i < n; i++) {
    const r = api.step(false);
    const cur = {
      trick: board.trick?.name ?? null,
      trickAt: board.trick?.at ?? null,
      grind: board.grind?.kind ?? null,
      mode: r.mode,
      flash: r.flash ? `${r.flash.label}@${r.flash.t}` : null,
      tap: r.tapFlash ? `${r.tapFlash.kind}@${r.tapFlash.t}` : null,
      camera: r.camera,
      stance: r.stance,
    };
    if (cur.trickAt !== last.trickAt && cur.trick) add(/^(BAIL|SLAM)$/.test(cur.trick) ? 'fall' : `trick:${cur.trick}`);
    if (cur.grind && cur.grind !== last.grind) add(`grind:${cur.grind}`);
    if (cur.mode !== last.mode && i > 0) add(`mode:${cur.mode}`);
    if (cur.flash && cur.flash !== last.flash) add(`phone:${r.flash.label}`, true);
    if (cur.tap && cur.tap !== last.tap) add(`tap:${r.tapFlash.kind}`, true);
    if (i > 0 && cur.camera !== last.camera) add(`camera:${cur.camera}`);
    if (i > 0 && cur.stance !== last.stance) add(`stance:${cur.stance}`);
    const d = Math.atan2(Math.sin(board.heading - ref), Math.cos(board.heading - ref));
    if (Math.abs(d) > 0.6) add(d < 0 ? 'turn:right' : 'turn:left'), (ref = board.heading);
    if (r.mode === 'carry' && board.speed > 3.5) add('run');
    if (r.mode === 'carry' && board.y > 0.35) add('jump');
    last = cur;
  }
  // Every expected token, in order.
  const missing = [];
  let at = 0;
  for (const want of demo.expect ?? []) {
    const k = got.findIndex((g, i) => i >= at && (g === want || g.startsWith(want)));
    if (k < 0) missing.push(want);
    else at = k + 1;
  }
  return { id: demo.id, ok: missing.length === 0, missing, got };
}
