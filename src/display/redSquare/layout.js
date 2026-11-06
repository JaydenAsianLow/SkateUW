// Red Square level layout (MAP.md). Hand-placed gameplay geometry on top of the OpenStreetMap data
// in osm.js: stair sets, the lower ground they lead to, invisible boundaries, paved areas, props.
// Units: meters. +x = east, +z = south (north is -z). Plaza deck at y = 0.
import { BUILDINGS, PLAZA, POI } from './osm.js';

// Red Square is a deck over a parking garage; Rainier Vista and the west lawn sit a stair flight lower.
export const LOW = -2;

const norm = ([x, z]) => {
  const l = Math.hypot(x, z);
  return [x / l, z / l];
};
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];

// --- Spawn (MAP.md §5): north part of the plaza near the monoliths/Kane side, facing south.
// Facing south: Suzzallo on the left, the low sun ahead-right, Gerberding + Rainier Vista steps ahead-left.
export const SPAWN = { position: [4, -14], heading: Math.PI };
// Debug: ?spawn=x,z,headingDeg starts somewhere else (heading 0 = north, 90 = west, 180 = south).
{
  const q = new URLSearchParams(globalThis.location?.search ?? '').get('spawn');
  const v = q?.split(',').map(Number);
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
    top: [43.5, 57.5],
    dir: VISTA_DIR,
    width: 16,
    risers: RISERS,
    tread: 0.38,
  },
  {
    key: 'west', // down to the George Washington statue; visual only (outside the playable area)
    top: [-50.5, -5.5],
    dir: [-1, 0],
    width: 15,
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
    [27, 67], [34, 83.5], [6, 96], [-70, 100], [-70, 650], [650, 650], [650, 90],
    [151, 51], [99, 52], [64, 68.5], [58, 58], se.bl,
  ],
  // West: the lawn and paving around the George Washington statue, between Odegaard and Meany.
  [w.tr, w.tl, [-59.5, 2], [-59.5, 6], [-148, 6], [-148, -20.5], [-56, -20.5], [-56, -13]],
];

// --- Invisible boundaries (MAP.md §3) across the gaps between buildings. Buildings have their own colliders.
export const BOUNDS = [
  [[-31.5, -73.5], [-10, -73.5]], // NW: path between Odegaard and Kane toward the Quad
  [[50.2, -42.7], [66.5, -25.5], [70.1, -17.5]], // NE: between Kane and Suzzallo
  [[-39.2, -34], [-39.2, -20], [-45.8, -13.6], [-50.8, -13.6], [-50.8, 52.2], [-38.5, 53], [-30.5, 55.2]], // W + SW
  [[35, 84], [78, 63.5]], // end of the playable landing below the Rainier Vista steps
];

// --- Paved areas for the ground mask (brick); everything else is lawn.
export const PAVED = {
  polygons: [
    PLAZA,
    [[46, -25], [66.1, -17.1], [54.7, 47.8], [57.4, 58.2], [46.5, 52.9]], // forecourt up to Suzzallo's facade
    [[45, -27.4], [50.2, -42.7], [66.5, -25.5], [70.1, -17.5], [66, -17], [61, -9]], // Broken Obelisk corner
    [se.tl, se.tr, se.br, [27, 67], [35, 84], [78, 63.5], [64, 68.5], [58, 58], se.bl], // landing below the steps
    [[-148, -20.5], [-50, -20.5], [-50, 6], [-148, 6]], // west paving (OSM: paving_stones)
  ],
  // [width, ...points] polylines
  paths: [
    [11, [46, 66], [53, 81], [113, 213], [126, 243], [142, 319], [193, 427]], // Rainier Vista path
    [6, [-124, -7], [-170, -7]],
  ],
  dilate: 10, // stroke width around the plaza polygon so brick reaches the building walls
  rings: [[...POI.drumheller.center, POI.drumheller.radius + 4, 7]],
};

// --- Building groups
const named = (name) => BUILDINGS.find((b) => b.name === name);
export const MID = [
  { b: named('Kane Hall'), style: 'modern' },
  { b: named('Odegaard Undergraduate Library'), style: 'modern' },
  { b: named('Meany Hall'), style: 'modern' },
  { b: named('Gerberding Hall'), style: 'stone' },
];
export const SUZZALLO = named('Suzzallo Library');
const midIds = new Set([...MID.map((m) => m.b.id), SUZZALLO.id]);
export const BACKDROP = BUILDINGS.filter((b) => !midIds.has(b.id));

// Suzzallo's straight west façade (OSM nodes), the side that faces Red Square.
export const SUZZALLO_FACADE = { a: [66.08, -17.07], b: [54.7, 47.8] };

// --- Props
export const LAMPS = [
  [-45, -5], [-45, 22], [-45, 45], [-20, 50], [8, 54.5], [50, 40], [55, 10], [58, -15],
  [28, -22], [2, -36], [-22, -46], [-33, -12],
];
export const BENCHES = [
  // [x, z, rotY]: seat faces -z (north) at rotY 0
  [-12, 51.5, 0.18], [0, 53.4, 0.18], [12, 55.6, 0.18],
  [-36.5, -40, -Math.PI / 2], [-36.5, -28, -Math.PI / 2],
];

const vistaTree = (s, off) => {
  const p = add(add([53, 81], VISTA_DIR, s), [VISTA_DIR[1], -VISTA_DIR[0]], off);
  return p;
};
export const TREES = [
  // Rainier Vista lawn edges, on the lower ground
  ...[45, 75, 105, 135].flatMap((s, i) => [
    { p: vistaTree(s, 21), y: LOW, v: i % 4, s: 1.1 },
    { p: vistaTree(s, -21), y: LOW, v: (i + 2) % 4, s: 1.05 },
  ]),
  // South-west, toward the low sun (DESIGN.md: sun shining through bare branches)
  { p: [-40, 108], y: LOW, v: 1, s: 1.15 }, { p: [-22, 112], y: LOW, v: 2, s: 1.1 }, { p: [-62, 116], y: LOW, v: 3, s: 1.2 },
  { p: [-8, 106], y: LOW, v: 0, s: 1.05 }, { p: [-80, 104], y: LOW, v: 2, s: 1.1 },
  // The Quad (backdrop, north-east beyond Kane)
  { p: [150, -125], y: LOW, v: 0, s: 1.2 }, { p: [168, -140], y: LOW, v: 1, s: 1.15 }, { p: [182, -122], y: LOW, v: 2, s: 1.2 },
  { p: [158, -160], y: LOW, v: 3, s: 1.1 }, { p: [184, -156], y: LOW, v: 0, s: 1.2 }, { p: [140, -148], y: LOW, v: 1, s: 1.1 },
  // Between Kane and Suzzallo, toward the Quad
  { p: [78, -36], y: 0, v: 2, s: 1.0 }, { p: [88, -26], y: 0, v: 3, s: 1.05 },
  // West lawn around George Washington
  { p: [-104, -16], y: LOW, v: 1, s: 1.0 }, { p: [-140, 2], y: LOW, v: 3, s: 1.1 },
];

export const WALKERS = [
  { a: [-30, 0], b: [40, 20], speed: 1.25, i: 0 },
  { a: [10, -35], b: [-20, 45], speed: 1.35, i: 1 },
  { a: [45, 45], b: [-10, -25], speed: 1.2, i: 2, offset: 0.6 },
  { a: [-42, 30], b: [20, 50], speed: 1.15, i: 3, offset: 0.3 },
  { a: [30, -20], b: [50, 35], speed: 1.3, i: 4, offset: 1.2 },
  { a: [-35, -60], b: [-20, -10], speed: 1.1, i: 5, offset: 0.9, backpack: false },
  { a: [0, 10], b: [-40, 15], speed: 1.25, i: 6, offset: 1.5 },
  { a: [20, 5], b: [25, 50], speed: 1.2, i: 7, offset: 0.4, backpack: false },
  { a: [-15, -40], b: [35, -5], speed: 1.4, i: 8, offset: 1.7 },
];
export const SITTERS = [
  { position: [0.05, 53.7], rotY: 0.18, seat: 0.47, i: 11 },
  { position: [12.05, 55.9], rotY: 0.18, seat: 0.47, i: 12 },
];
