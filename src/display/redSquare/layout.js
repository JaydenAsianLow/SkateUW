// Red Square level layout (MAP.md). Hand-placed gameplay geometry on top of the OpenStreetMap data
// in osm.js: stair sets, the lower ground they lead to, invisible boundaries, paved areas, props.
// Units: meters. +x = east, +z = south (north is -z). Plaza deck at y = 0.
import { BUILDINGS, PLAZA, POI } from './osm.js';
import { urlParams } from '../util.js';
import FACADES from '../../../public/map/rs-facades.json';

// Red Square is a deck over a parking garage; Rainier Vista and the west lawn sit a stair flight lower.
export const LOW = -2;

const norm = ([x, z]) => {
  const l = Math.hypot(x, z);
  return [x / l, z / l];
};
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];

// --- Spawn (MAP.md §5): north part of the plaza near the monoliths/Kane side, facing south.
// Facing south: Suzzallo on the left, the low sun ahead-right, Gerberding + Rainier Vista steps ahead-left.
export const SPAWN = { position: [7.5, -7.5], heading: Math.PI }; // just in front of Kane's stairs (the old spot is now on the raised strip)
// Debug: ?spawn=x,z,headingDeg starts somewhere else (heading 0 = north, 90 = west, 180 = south).
{
  const v = urlParams.get('spawn')?.split(',').map(Number);
  if (v?.length >= 2 && v.every(Number.isFinite)) {
    SPAWN.position = [v[0], v[1]];
    if (v.length > 2) SPAWN.heading = (v[2] * Math.PI) / 180;
  }
}

// --- Stair sets. `top` is the centre of the top edge, `dir` points down the stairs.
// Rainier Vista runs SSE toward Drumheller Fountain and Mount Rainier (OSM path direction).
export const VISTA_DIR = norm([60, 132]);
const RISERS = 12;
export const STAIRS = [
  {
    key: 'rainierVista', // main skate spot (MAP.md §8). Step count/handrails: verify on site.
    top: [54.38, 71.88],
    dir: VISTA_DIR,
    width: 20,
    risers: RISERS,
    tread: 0.38,
  },
  {
    key: 'west', // down to the George Washington statue (skateable)
    top: [-63.12, -6.88],
    dir: [-1, 0],
    width: 18.75,
    risers: RISERS,
    tread: 0.4,
  },
];
export const RISER = -LOW / RISERS;

// Corners of a stair set, named by compass-free sides: `l`/`r` = left/right when walking down.
export function stairCorners(s) {
  const right = [-s.dir[1], s.dir[0]]; // right-hand side when walking down the stairs
  const run = (s.risers - 1) * s.tread;
  const tl = add(s.top, right, -s.width / 2);
  const tr = add(s.top, right, s.width / 2);
  return { tl, tr, br: add(tr, s.dir, run), bl: add(tl, s.dir, run), right, run };
}

// --- Lower ground (holes in the plaza deck). Each starts with its stair's top edge (no wall there).
// Edges that run inside buildings are hidden by them; the others become retaining walls with colliders.
// Rainier Vista stairs, walking down (SSE): left = east (Suzzallo side), right = west (Gerberding side).
const se = stairCorners(STAIRS[0]);
// West stairs, walking down (west): left = south (Meany side), right = north (Odegaard side).
const w = stairCorners(STAIRS[1]);
export const HOLES = [
  // Rainier Vista: between Gerberding and Suzzallo, then everything south-east to the horizon.
  [
    se.tl, se.tr, se.br,
    [33.75, 83.75], [42.5, 104.38], [7.5, 120], [-87.5, 125], [-87.5, 812.5], [812.5, 812.5], [812.5, 112.5],
    [188.75, 63.75], [123.75, 65], [80, 85.62], [72.5, 72.5], se.bl,
  ],
  // West: the lawn and paving around the George Washington statue, between Odegaard and Meany.
  [w.tr, w.tl, [-74.38, 2.5], [-74.38, 7.5], [-185, 7.5], [-185, -25.62], [-70, -25.62], [-70, -16.25]],
];

// --- Invisible boundaries (MAP.md §3) across the gaps between buildings. Buildings have their own colliders.
export const BOUNDS = [
  [[-39.38, -91.88], [-12.5, -91.88]], // NW: path between Odegaard and Kane toward the Quad
  [[62.75, -53.38], [83.12, -31.88], [87.62, -21.88]], // NE: between Kane and Suzzallo
  [[-49.45, -42.5], [-49.45, -25], [-57.25, -17], [-63.5, -17]], // W: Odegaard's corner (inside the flights' brick wall, clear of its handrail), down to the west steps
  [[-54.88, 73.5], [-38.12, 69.12]], // SW: between Meany and Gerberding (Meany's front and the west steps are open)
  [[43.75, 105], [97.5, 79.38]], // end of the playable landing below the Rainier Vista steps
];

// --- Paved areas for the ground mask (brick); everything else is lawn.
export const PAVED = {
  polygons: [
    PLAZA,
    [[57.5, -31.25], [82.62, -21.38], [68.38, 59.75], [71.75, 72.75], [58.12, 66.12]], // forecourt up to Suzzallo's facade
    [[56.25, -34.25], [62.75, -53.38], [83.12, -31.88], [87.62, -21.88], [82.5, -21.25], [76.25, -11.25]], // Broken Obelisk corner
    [se.tl, se.tr, se.br, [33.75, 83.75], [43.75, 105], [97.5, 79.38], [80, 85.62], [72.5, 72.5], se.bl], // landing below the steps
    [[-185, -25.62], [-62.5, -25.62], [-62.5, 7.5], [-185, 7.5]], // west paving (OSM: paving_stones)
  ],
  // [width, ...points] polylines
  paths: [
    [11, [57.5, 82.5], [66.25, 101.25], [141.25, 266.25], [157.5, 303.75], [177.5, 398.75], [241.25, 533.75]], // Rainier Vista path
    [6, [-155, -8.75], [-212.5, -8.75]],
  ],
  dilate: 10, // stroke width around the plaza polygon so brick reaches the building walls
  rings: [[...POI.drumheller.center, POI.drumheller.radius + 4, 7]],
};

// --- Building groups
// Heights from the photos (rs-facades.json) override the OSM estimates where a facade is modelled.
const HEIGHT_KEY = { 'Kane Hall': 'kane', 'Odegaard Undergraduate Library': 'odegaard', 'Meany Hall': 'meany', 'Gerberding Hall': 'gerberding', 'Suzzallo Library': 'suzzallo' };
const named = (name) => {
  const b = BUILDINGS.find((x) => x.name === name);
  const h = FACADES[HEIGHT_KEY[name]]?.height;
  return h ? { ...b, height: h } : b;
};
export const MID = [
  { b: named('Kane Hall'), style: 'modern' },
  { b: named('Odegaard Undergraduate Library'), style: 'modern' },
  { b: named('Meany Hall'), style: 'modern' },
  { b: named('Gerberding Hall'), style: 'stone' },
  { b: named('Suzzallo Library'), style: 'gothic' },
];
const midIds = new Set(MID.map((m) => m.b.id));
export const BACKDROP = BUILDINGS.filter((b) => !midIds.has(b.id));


// --- Props
export const LAMPS = [
  [-56.25, -6.25], [-56.25, 27.5], [-56.25, 56.25], [-25, 62.5], [10, 68.12], [62.5, 50], [68.75, 12.5],
  [-0.5, -12.5], [-16.12, -20.5], [-41.25, -15], // in front of Kane's stairs, clear of the open strip, the hill and the levels
];
export const BENCHES = [
  // [x, z, rotY]: seat faces -z (north) at rotY 0
  [-15, 64.38, 0.18], [0, 66.75, 0.18], [15, 69.5, 0.18],
  [-67.88, 27.5, -Math.PI / 2], [-67.88, 42.5, -Math.PI / 2], // against Meany's brick plinth (photo IMG_4721)
];

const vistaTree = (s, off) => {
  const p = add(add([66.25, 101.25], VISTA_DIR, s), [VISTA_DIR[1], -VISTA_DIR[0]], off);
  return p;
};
// A point in front of a modelled facade: `t` along its wall (0..1 from a to b), `out` metres toward the plaza.
function infront(key, t, out) {
  const { a, b } = FACADES[key];
  const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let n = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  if (n[0] * (5 - p[0]) + n[1] * (5 - p[1]) < 0) n = [-n[0], -n[1]];
  return [p[0] + n[0] * out, p[1] + n[1] * out];
}

export const TREES = [
  // The big bare plane trees along Gerberding's front (photos IMG_4715, 4733) and the small ornamental trees
  // in round grates in front of Meany (IMG_4721, 4735)
  ...[0.12, 0.3, 0.68, 0.88].map((t, i) => ({ p: infront('gerberding', t, 6.5), y: 0, v: i % 4, s: 0.85 })),
  ...[0.18, 0.5, 0.82].map((t, i) => ({ p: infront('meany', t, 10), y: 0, v: (i + 1) % 4, s: 0.42 })),
  // Rainier Vista lawn edges, on the lower ground
  ...[56.25, 93.75, 131.25, 168.75].flatMap((s, i) => [
    { p: vistaTree(s, 26.25), y: LOW, v: i % 4, s: 1.1 },
    { p: vistaTree(s, -26.25), y: LOW, v: (i + 2) % 4, s: 1.05 },
  ]),
  // South-west, toward the low sun (DESIGN.md: sun shining through bare branches)
  { p: [-50, 135], y: LOW, v: 1, s: 1.15 }, { p: [-27.5, 140], y: LOW, v: 2, s: 1.1 }, { p: [-77.5, 145], y: LOW, v: 3, s: 1.2 },
  { p: [-10, 132.5], y: LOW, v: 0, s: 1.05 }, { p: [-100, 130], y: LOW, v: 2, s: 1.1 },
  // The Quad (backdrop, north-east beyond Kane)
  { p: [187.5, -156.25], y: LOW, v: 0, s: 1.2 }, { p: [210, -175], y: LOW, v: 1, s: 1.15 }, { p: [227.5, -152.5], y: LOW, v: 2, s: 1.2 },
  { p: [197.5, -200], y: LOW, v: 3, s: 1.1 }, { p: [230, -195], y: LOW, v: 0, s: 1.2 }, { p: [175, -185], y: LOW, v: 1, s: 1.1 },
  // Between Kane and Suzzallo, toward the Quad
  { p: [97.5, -45], y: 0, v: 2, s: 1.0 }, { p: [110, -32.5], y: 0, v: 3, s: 1.05 },
  // West lawn around George Washington
  { p: [-130, -20], y: LOW, v: 1, s: 1.0 }, { p: [-175, 2.5], y: LOW, v: 3, s: 1.1 },
];

// --- Free-standing rails (Rails.jsx): low flat bars (an ollie reaches ~0.45 m), clear of the walking lines.
// pts = [x, z] corners (bends are rounded off), base = the ground height there, h = bar height above it.
// A point on Kane's raised walkway: t metres along the front from its east end, o metres out toward the plaza.
const KF = FACADES.kane;
const kl = Math.hypot(KF.b[0] - KF.a[0], KF.b[1] - KF.a[1]);
const ke = [(KF.b[0] - KF.a[0]) / kl, (KF.b[1] - KF.a[1]) / kl];
const kn = [-ke[1], ke[0]];
const kaneN = kn[1] < 0 ? [-kn[0], -kn[1]] : kn; // Kane's front faces south, toward the plaza
const kaneAt = (t, o) => [KF.a[0] + ke[0] * t + kaneN[0] * o, KF.a[1] + ke[1] * t + kaneN[1] * o];
export const KANE_WALK = 1.05; // the walkway's height (21_kane.py FLOOR)
export const RAILS = [
  { name: 'meany_long', pts: [[-52, 4], [-52, 32]], base: 0, h: 0.4 }, // 28 m along the Meany side, east of the lamps
  { name: 'suzzallo_side', pts: [[54, 14], [51.3, 30]], base: 0, h: 0.4 }, // 16 m, parallel to Suzzallo's terrace
  { name: 'vista_landing', pts: [[64.2, 80.4], [69.3, 91.3]], base: LOW, h: 0.4 }, // 12 m beside the Rainier Vista path
  { name: 'kane_flat', pts: [kaneAt(10, 14), kaneAt(18, 14)], base: KANE_WALK, h: 0.4 }, // 8 m on Kane's walkway
  { name: 'kane_kink', pts: [kaneAt(28, 12), kaneAt(38, 12), kaneAt(42, 17)], base: KANE_WALK, h: 0.4 }, // ~16 m, one bend
  { name: 'plaza_short', pts: [[18, 10], [24.5, 12.5]], base: 0, h: 0.4 }, // 7 m in the open plaza south of the spawn
];
