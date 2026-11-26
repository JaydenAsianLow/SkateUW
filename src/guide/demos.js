// The Controls guide's demos: one short script per move. To add a demo for a new trick, add an entry here (see the
// format below); the guide picks it up by itself (a card in its group, a demo, a preview clip). If the move needs a
// new finger path, add it to GESTURES in fingers.js, or write the path inline (`swipe: [{ delay, pts }]`).
//
// Each demo plays in the demo scene (DemoStage.jsx): the real game (skater, physics, tricks, grinds, camera) with
// these scripted phone inputs instead of a real phone, so it stays right when the game changes.
//
// {
//   id, name,             unique id; the card's title
//   group,                'Basics' | 'Tricks' | 'Grinds' | 'On Foot' | 'Camera and Settings'
//   input,                the card's tag: 'TILT' | 'TAP' | 'SWIPE' | 'HALF-CIRCLE' | 'JOYSTICK'
//   keys,                 the keyboard keys for the same move (shown under the demo)
//   spawn,                which lane of the practice set to start in: 'flat' | 'rail' | 'curb' | 'long' (DemoWorld.jsx)
//   spawnZ,               optional: start this far back (m) from the lane's start
//   settings,             optional: game settings for this demo, e.g. { stance: 'goofy' }
//   warmup,               seconds played before the demo starts and not shown (steps with a negative `at`, e.g. pushes
//                         to get rolling); the demo itself runs from 0 to `length` seconds, then loops
//   length,
//   steps: [              the scripted phone, in seconds from the start:
//     { at, swipe: 'ollie' }               fingers on the deck (a name from GESTURES in fingers.js, or your own path)
//     { at, to, tilt: { steer, lean } }    tilt the phone: steer -1 (left) .. 1 (right); lean -1 (top of the phone
//                                          up: manual) .. 1 (top down). It eases in after `at` and out after `to`
//     { at, to, balance: 'keep' }          manual: tilt back and follow the green zone ('tooFar': then lean too far)
//     { at, to, stick: [x, y] }            hold the on-foot joystick: x right, y forward, each -1..1
//                                          ('toBoard': point it at the board after a fall)
//     { at, press: 'onoff' }               tap a button: 'onoff' (Get off / Get on), 'jump', 'tap' (the TAP button),
//                                          'view', 'settings', 'goofy', 'regular', 'done' (close Settings),
//                                          'setspawn', 'tospawn'
//     { at, to, timing: 'hit' }            long grind: tap TAP each time the marker is in the green ('miss': at the
//                                          wrong moments)
//   ],
//   captions: [{ at, to, text }],          shown under the demo, in time with the moves (plain, short words)
//   expect: ['trick:KICKFLIP'],            what the game must do in this demo, checked by /?demo&check (check.js
//                                          lists the tokens), so a demo that stops working after a game change shows
//   extra,                optional: the id of a second, small demo shown with this one (e.g. what a mistake looks like)
//   hidden,               true for those extra demos: no card of their own
//   extraLabel,           the button that shows the extra demo, e.g. 'What a miss looks like'
// }

// Rolling at about 5 m/s when the demo starts: three pushes in the warm-up.
const ROLL = [
  { at: -2.3, swipe: 'push' },
  { at: -1.6, swipe: 'push' },
  { at: -0.9, swipe: 'push' },
];
// Off the board, standing still with it in your hand when the demo starts.
const ON_FOOT = [{ at: -1.6, press: 'onoff' }];

export const GROUPS = ['Basics', 'Tricks', 'Grinds', 'On Foot', 'Camera and Settings'];

export const DEMOS = [
  // ---------------- Basics ----------------
  {
    id: 'push', name: 'Push', group: 'Basics', input: 'SWIPE', keys: 'W or ↑ (one tap = one push)',
    spawn: 'flat', warmup: 0.3, length: 4.6,
    steps: [{ at: 0.5, swipe: 'push' }, { at: 1.4, swipe: 'push' }, { at: 2.3, swipe: 'push' }],
    expect: ['phone:PUSH', 'phone:PUSH', 'phone:PUSH'],
    captions: [
      { at: 0.2, to: 2.2, text: 'Swipe down on the board' },
      { at: 2.2, to: 4.6, text: 'Every swipe is one push' },
    ],
  },
  {
    id: 'steer', name: 'Steer', group: 'Basics', input: 'TILT', keys: 'A / D or ← / →',
    spawn: 'flat', warmup: 2.4, length: 6,
    steps: [...ROLL, { at: 0.5, to: 2.2, tilt: { steer: 0.75 } }, { at: 3.1, to: 4.9, tilt: { steer: -0.75 } }],
    expect: ['turn:right', 'turn:left'],
    captions: [
      { at: 0.3, to: 2.7, text: 'Tilt the phone right to turn right' },
      { at: 2.9, to: 5.4, text: 'Tilt it left to turn left' },
    ],
  },
  {
    id: 'manual', name: 'Manual', group: 'Basics', input: 'TILT', keys: 'S or ↓ (hold it: it balances by itself)',
    spawn: 'flat', warmup: 2.4, length: 7.5,
    steps: [...ROLL, { at: 0.5, to: 5.6, balance: 'keep' }],
    expect: ['trick:MANUAL'],
    captions: [
      { at: 0.2, to: 1.6, text: '1. Tilt the top of the phone up' },
      { at: 1.6, to: 3.0, text: '2. The front wheels lift' },
      { at: 3.0, to: 5.6, text: '3. Tilt a little up or down to keep the marker in the green' },
      { at: 5.6, to: 7.5, text: '4. Hold the phone flat again to put the wheels down' },
    ],
    extra: 'manual-miss', extraLabel: 'What a fall looks like',
  },
  {
    id: 'manual-miss', name: 'Manual: leaning too far', group: 'Basics', input: 'TILT', keys: 'S or ↓', hidden: true,
    spawn: 'flat', warmup: 2.4, length: 6.5,
    steps: [...ROLL, { at: 0.5, to: 4.6, balance: 'tooFar' }],
    expect: ['fall'],
    captions: [
      { at: 0.2, to: 2.4, text: 'Tilt up to start the manual' },
      { at: 2.4, to: 4.2, text: 'Keep tilting up: the marker leaves the green' },
      { at: 4.2, to: 6.5, text: 'Too far: you fall backwards' },
    ],
  },
  {
    id: 'revert', name: 'Revert', group: 'Basics', input: 'HALF-CIRCLE', keys: 'Q',
    spawn: 'flat', warmup: 2.4, length: 4.5,
    steps: [...ROLL, { at: 0.8, swipe: 'halfCircle' }],
    expect: ['trick:REVERT'],
    captions: [
      { at: 0.3, to: 2.0, text: 'Draw a half circle with one finger' },
      { at: 2.0, to: 4.5, text: 'The board turns round: now you ride backwards' },
    ],
  },
  {
    id: 'bail', name: 'Fall and get up', group: 'Basics', input: 'JOYSTICK', keys: 'W A S D to walk to the board, then B',
    spawn: 'flat', warmup: 2.4, length: 8,
    steps: [...ROLL, { at: 0.3, swipe: 'ollie' }, { at: 1.2, swipe: [{ delay: 0, pts: [[0.5, 0.5, 0], [0.74, 0.2, 0.08]] }] }, { at: 4.5, to: 6.6, stick: 'toBoard' }, { at: 7.0, press: 'onoff' }],
    expect: ['fall', 'mode:find', 'mode:carry', 'mode:ride'],
    captions: [
      { at: 0.2, to: 1.9, text: 'Flip too late and land on your side...' },
      { at: 1.9, to: 4.0, text: '...you fall, then get up' },
      { at: 4.0, to: 6.6, text: 'Walk to your board with the joystick: you pick it up' },
      { at: 6.6, to: 8, text: 'Tap Get on to ride again' },
    ],
  },

  // ---------------- Tricks ----------------
  {
    id: 'ollie', name: 'Ollie', group: 'Tricks', input: 'SWIPE', keys: 'Shift',
    spawn: 'flat', warmup: 2.4, length: 3.6,
    steps: [...ROLL, { at: 0.7, swipe: 'ollie' }],
    expect: ['trick:OLLIE'],
    captions: [
      { at: 0.2, to: 1.0, text: '1. Swipe down...' },
      { at: 1.0, to: 1.7, text: '2. ...then straight up' },
      { at: 1.7, to: 3.6, text: 'Ollie!' },
    ],
  },
  {
    id: 'nollie', name: 'Nollie', group: 'Tricks', input: 'SWIPE', keys: 'N',
    spawn: 'flat', warmup: 2.4, length: 3.6,
    steps: [...ROLL, { at: 0.7, swipe: 'nollie' }],
    expect: ['trick:NOLLIE'],
    captions: [
      { at: 0.2, to: 1.0, text: '1. Swipe up...' },
      { at: 1.0, to: 1.7, text: '2. ...then down' },
      { at: 1.7, to: 3.6, text: 'Nollie: it pops off the front' },
    ],
  },
  {
    id: 'kickflip', name: 'Kickflip', group: 'Tricks', input: 'SWIPE', keys: 'F',
    spawn: 'flat', warmup: 2.4, length: 3.8,
    steps: [...ROLL, { at: 0.7, swipe: 'kickflip' }],
    expect: ['phone:KICKFLIP', 'trick:KICKFLIP'],
    captions: [
      { at: 0.2, to: 1.0, text: '1. Swipe down, then up' },
      { at: 1.0, to: 1.8, text: '2. Flick up and to the right' },
      { at: 1.8, to: 3.8, text: 'Kickflip!' },
    ],
  },
  {
    id: 'varial', name: 'Varial flip', group: 'Tricks', input: 'SWIPE', keys: 'R',
    spawn: 'flat', warmup: 2.4, length: 3.8,
    steps: [...ROLL, { at: 0.7, swipe: 'varial' }],
    expect: ['phone:VARIAL FLIP', 'trick:VARIAL FLIP'],
    captions: [
      { at: 0.2, to: 1.0, text: '1. Swipe down, then up' },
      { at: 1.0, to: 1.8, text: '2. Two fingers: one up-right, one down-left' },
      { at: 1.8, to: 3.8, text: 'Varial flip!' },
    ],
  },
  {
    id: 'tre', name: 'Tre flip', group: 'Tricks', input: 'SWIPE', keys: 'T',
    spawn: 'flat', warmup: 2.4, length: 4,
    steps: [...ROLL, { at: 0.7, swipe: 'tre' }],
    expect: ['phone:TRE FLIP', 'trick:TRE FLIP'],
    captions: [
      { at: 0.2, to: 1.0, text: '1. Swipe down, then up' },
      { at: 1.0, to: 1.3, text: '2. Stop for a moment' },
      { at: 1.3, to: 2.0, text: '3. Flick down and to the left' },
      { at: 2.0, to: 4, text: 'Tre flip!' },
    ],
  },
  {
    id: 'shove', name: 'Pop shove-it', group: 'Tricks', input: 'SWIPE', keys: 'V',
    spawn: 'flat', warmup: 2.4, length: 3.6,
    steps: [...ROLL, { at: 0.8, swipe: 'shove' }],
    expect: ['trick:POP SHOVE-IT'],
    captions: [
      { at: 0.2, to: 1.5, text: 'Two fingers at once: one right, one down-left' },
      { at: 1.5, to: 3.6, text: 'Pop shove-it: the board spins under you' },
    ],
  },
  {
    id: 'fs180', name: 'Frontside 180', group: 'Tricks', input: 'HALF-CIRCLE', keys: 'E',
    spawn: 'flat', warmup: 2.4, length: 4,
    steps: [...ROLL, { at: 0.7, swipe: 'ollie180' }],
    expect: ['trick:FRONTSIDE 180'],
    captions: [
      { at: 0.2, to: 1.0, text: '1. Swipe down, then up' },
      { at: 1.0, to: 1.8, text: '2. Draw a half circle' },
      { at: 1.8, to: 4, text: 'You spin round in the air' },
    ],
  },

  // ---------------- Grinds ----------------
  {
    id: '5050', name: '50-50', group: 'Grinds', input: 'SWIPE', keys: 'Shift next to a rail',
    spawn: 'rail', spawnZ: 6, warmup: 2.4, length: 5,
    steps: [...ROLL, { at: 1.4, swipe: 'ollie' }],
    expect: ['grind:5050', 'trick:50-50'],
    captions: [
      { at: 0.2, to: 1.4, text: '1. Ride next to the rail' },
      { at: 1.4, to: 2.0, text: '2. Ollie onto it' },
      { at: 2.0, to: 3.4, text: '3. Do nothing else: 50-50!' },
      { at: 3.4, to: 5, text: 'You hop off at the end' },
    ],
  },
  {
    id: 'boardslide', name: 'Boardslide', group: 'Grinds', input: 'HALF-CIRCLE', keys: 'Shift, then Q in the air',
    spawn: 'rail', spawnZ: 6, warmup: 2.4, length: 5,
    steps: [...ROLL, { at: 1.4, swipe: 'ollie180' }],
    expect: ['grind:5050', 'grind:boardslide', 'trick:BOARDSLIDE'],
    captions: [
      { at: 0.2, to: 1.4, text: '1. Ride next to the rail' },
      { at: 1.4, to: 1.7, text: '2. Ollie onto the rail' },
      { at: 1.7, to: 2.2, text: '3. Draw a half circle' },
      { at: 2.2, to: 5, text: 'Boardslide!' },
    ],
    extra: 'boardslide-bail', extraLabel: 'Half circle not finished',
  },
  {
    id: 'boardslide-bail', name: 'Boardslide: half circle not finished', group: 'Grinds', input: 'HALF-CIRCLE', keys: 'Shift, then Q in the air', hidden: true,
    spawn: 'rail', spawnZ: 6, warmup: 2.4, length: 5,
    steps: [...ROLL, { at: 1.4, swipe: 'ollieHalfStop' }],
    expect: ['grind:5050', 'fall'],
    captions: [
      { at: 0.2, to: 1.6, text: 'Ollie onto the rail...' },
      { at: 1.6, to: 2.4, text: '...stop the half circle halfway...' },
      { at: 2.4, to: 5, text: '...and you fall off' },
    ],
  },
  {
    id: 'long', name: 'Long grind', group: 'Grinds', input: 'TAP', keys: 'Space when the marker is in the green',
    spawn: 'long', spawnZ: 6, warmup: 2.4, length: 7.5,
    steps: [...ROLL, { at: 1.4, swipe: 'ollie' }, { at: 1.6, to: 6.4, timing: 'hit' }],
    expect: ['grind:5050', 'tap:good', 'trick:50-50'],
    captions: [
      { at: 0.2, to: 1.7, text: '1. Ollie onto a long rail' },
      { at: 1.7, to: 3.6, text: '2. A bar shows up: tap TAP when the marker is in the green' },
      { at: 3.6, to: 7.5, text: 'Only on long grinds (over about 2 seconds). Short rails and stair rails play by themselves' },
    ],
    extra: 'long-miss', extraLabel: 'What a miss looks like',
  },
  {
    id: 'long-miss', name: 'Long grind: missed taps', group: 'Grinds', input: 'TAP', keys: 'Space', hidden: true,
    spawn: 'long', spawnZ: 6, warmup: 2.4, length: 7,
    steps: [...ROLL, { at: 1.4, swipe: 'ollie' }, { at: 1.6, to: 3.3, timing: 'hit' }, { at: 3.3, to: 6, timing: 'miss' }],
    expect: ['grind:5050', 'tap:good', 'tap:miss', 'fall'],
    captions: [
      { at: 0.2, to: 1.7, text: 'Ollie onto a long rail' },
      { at: 1.7, to: 3.3, text: 'Taps in the green are good' },
      { at: 3.3, to: 4.6, text: 'Tap outside the green, or not at all: a miss' },
      { at: 4.6, to: 7, text: 'Three misses and you fall' },
    ],
  },
  {
    id: 'curb', name: 'Curb grind', group: 'Grinds', input: 'TILT', keys: 'A / D to ride into it',
    spawn: 'curb', spawnZ: 4, warmup: 2.4, length: 4.5,
    steps: [...ROLL, { at: 0.2, to: 0.6, tilt: { steer: 0.12 } }],
    expect: ['grind:5050', 'trick:50-50'],
    captions: [
      { at: 0.1, to: 1.0, text: '1. Ride into a curb at a small angle' },
      { at: 1.0, to: 2.6, text: '2. You grind it, no ollie needed' },
      { at: 2.6, to: 4.5, text: 'Or ollie onto it, like a rail' },
    ],
  },

  // ---------------- On Foot ----------------
  {
    id: 'onoff', name: 'Get off and on', group: 'On Foot', input: 'TAP', keys: 'B',
    spawn: 'flat', warmup: 2.4, length: 6,
    steps: [...ROLL, { at: 0.8, press: 'onoff' }, { at: 3.6, press: 'onoff' }],
    expect: ['mode:carry', 'mode:ride'],
    captions: [
      { at: 0.2, to: 3.2, text: 'Tap Get off: you step off with the board in your hand' },
      { at: 3.2, to: 6, text: 'Tap Get on to ride again' },
    ],
  },
  {
    id: 'walk', name: 'Walk and run', group: 'On Foot', input: 'JOYSTICK', keys: 'W A S D, hold Shift to run',
    spawn: 'flat', warmup: 2.4, length: 6.5,
    steps: [...ON_FOOT, { at: 0.4, to: 2.2, stick: [0, 0.45] }, { at: 2.6, to: 4.6, stick: [0, 1] }, { at: 4.6, to: 5.8, stick: [0.75, 0.65] }],
    expect: ['run', 'turn:right'],
    captions: [
      { at: 0.2, to: 2.4, text: 'Push the joystick a little to walk' },
      { at: 2.4, to: 4.6, text: 'All the way to run' },
      { at: 4.6, to: 6.5, text: 'Point it where you want to go' },
    ],
  },
  {
    id: 'jump', name: 'Jump', group: 'On Foot', input: 'TAP', keys: 'Space (with the board in your hand)',
    spawn: 'flat', warmup: 2.4, length: 4,
    steps: [...ON_FOOT, { at: 0.3, to: 3.0, stick: [0, 0.6] }, { at: 1.4, press: 'jump' }],
    expect: ['jump'],
    captions: [
      { at: 0.2, to: 1.3, text: 'Off the board, walking' },
      { at: 1.3, to: 4, text: 'Tap Jump' },
    ],
  },
  {
    id: 'caveman', name: 'Caveman', group: 'On Foot', input: 'TAP', keys: 'Space, then B in the air',
    spawn: 'flat', warmup: 2.4, length: 5.5,
    steps: [...ON_FOOT, { at: 0.2, to: 2.2, stick: [0, 1] }, { at: 1.7, press: 'jump' }, { at: 1.98, press: 'onoff' }],
    expect: ['jump', 'mode:ride', 'trick:CAVEMAN'],
    captions: [
      { at: 0.1, to: 1.6, text: '1. Run with the board in your hand' },
      { at: 1.6, to: 1.95, text: '2. Tap Jump' },
      { at: 1.95, to: 2.6, text: '3. Tap Get on in the air: let go of the board' },
      { at: 2.6, to: 5.5, text: '4. It drops under your feet: you land riding' },
    ],
  },

  // ---------------- Camera and Settings ----------------
  {
    id: 'camera', name: 'Camera view', group: 'Camera and Settings', input: 'TAP', keys: 'Settings menu → Camera',
    spawn: 'flat', warmup: 2.4, length: 7.5,
    steps: [...ROLL, { at: 1.6, press: 'view' }, { at: 3.6, press: 'view' }, { at: 5.6, press: 'view' }, { at: 4.2, swipe: 'push' }],
    expect: ['camera:shoulder', 'camera:side', 'camera:behind'],
    captions: [
      { at: 0.1, to: 1.6, text: 'Before: the camera behind you' },
      { at: 1.6, to: 3.6, text: 'Tap View: over your shoulder' },
      { at: 3.6, to: 5.6, text: 'Tap View again: from the side' },
      { at: 5.6, to: 7.5, text: 'Once more: back behind you' },
    ],
  },
  {
    id: 'stance', name: 'Goofy stance', group: 'Camera and Settings', input: 'TAP', keys: 'Settings menu → Stance',
    spawn: 'flat', warmup: 2.4, length: 7,
    steps: [...ROLL, { at: 1.7, press: 'settings' }, { at: 2.5, press: 'goofy' }, { at: 3.2, press: 'done' }, { at: 4.2, swipe: 'push' }],
    expect: ['stance:goofy'],
    captions: [
      { at: 0.1, to: 1.7, text: 'Before: regular, left foot in front' },
      { at: 1.7, to: 3.3, text: 'Settings, then Stance: Goofy' },
      { at: 3.3, to: 7, text: 'After: goofy, right foot in front' },
    ],
  },
  {
    id: 'spawn', name: 'Spawn point', group: 'Camera and Settings', input: 'TAP', keys: 'P to set it, Space to go back',
    spawn: 'flat', warmup: 0.3, length: 6,
    steps: [{ at: 0.6, press: 'setspawn' }, { at: 1.4, swipe: 'push' }, { at: 2.1, swipe: 'push' }, { at: 4.6, press: 'tospawn' }],
    expect: ['phone:SPAWN SET', 'phone:TO SPAWN'],
    captions: [
      { at: 0.1, to: 1.3, text: 'Tap Set spawn: this spot is your start' },
      { at: 1.3, to: 4.4, text: 'Ride somewhere else...' },
      { at: 4.4, to: 6, text: 'Tap To spawn: back to that spot' },
    ],
  },
];

export const demoById = Object.fromEntries(DEMOS.map((d) => [d.id, d]));
export const CARDS = DEMOS.filter((d) => !d.hidden);
