// Shared look for the Campus Plaza (Golden Hour) scene. See DESIGN.md.
// Palette, sun direction, procedural textures and the small shader patches used by the world.
import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- Palette (DESIGN.md §5) ----------
export const C = {
  brickSun: '#B8705A',
  brickMid: '#8A4A3C',
  brickShadow: '#5A2E28',
  stoneBand: '#B9A08A',
  buildingBrick: '#7A3A2C',
  limestone: '#BFAE96',
  skyNearSun: '#F7C47C',
  skyUpper: '#F1E3CF',
  sunCore: '#FFF2D6',
  tree: '#3B2E26',
  lawn: '#4E5B34',
  iron: '#1E1E1E',
  jacket: '#E6DCCB',
  pants: '#5B5E3C',
  hat: '#46502F',
  sneakers: '#F2F1EC',
  deck: '#D8C6A4',
  wheels: '#E8E3D6',
  trucks: '#8E8E8E',
  sunLight: '#FFB66B',
  hemiSky: '#F3D9B5',
  hemiGround: '#5A2E28',
  fog: '#F0CFA8',
  lampGlow: '#FFD9A0',
};

// ---------- Sun (DESIGN.md §4.1, MAP.md §5): ~12° up, low in the south-west ----------
// The spawn faces south (+Z), so the sun sits ahead and to the right of the start view.
const SUN_ELEVATION = (12 * Math.PI) / 180;
const SUN_AZIMUTH = (31 * Math.PI) / 180; // west of due south = right of the start heading
export const SUN_DIR = new Vector3(
  -Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
  Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
).normalize();

// Sun direction in view space, updated every frame by the camera rig (drives the rim light).
export const sunView = { value: new Vector3(0, 0, -1) };

// Board / rider shared dimensions.
export const DECK_TOP = 0.1; // grip surface height above the ground (m)
export const BOARD_HALF_Y = 0.08; // half height of the board's physics box (its centre sits this far above the ground)
export const PUSH_ANIM = 0.62; // seconds for one push stroke animation

// Where the ground is paved (brick) vs lawn: a world-space mask texture painted by the level
// (redSquare/Ground.jsx). R channel 1 = paved. Bounds are [xMin, zMin, width, depth] in meters.
export const groundMask = { value: null };
export const groundMaskBounds = { value: [-200, -200, 500, 500] };

// ---------- Small helpers ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Merge geometries regardless of whether they're indexed.
export function merge(list) {
  if (!list.length) return null;
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
}

// ---------- Procedural brick textures ----------
function shade(hex, k) {
  const c = new Color(hex);
  return `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
}

function brickCanvases({ px = 1024, cols, rows, colors, mortar, mortarPx, seed }) {
  const r = rng(seed);
  const map = document.createElement('canvas');
  const bump = document.createElement('canvas');
  map.width = map.height = bump.width = bump.height = px;
  const g = map.getContext('2d');
  const b = bump.getContext('2d');
  g.fillStyle = mortar;
  g.fillRect(0, 0, px, px);
  b.fillStyle = '#000';
  b.fillRect(0, 0, px, px);
  const bw = px / cols;
  const bh = px / rows;
  const m = mortarPx / 2;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * (bw / 2);
    for (let k = 0; k < cols; k++) {
      const base = colors[(r() * colors.length) | 0];
      const fill = shade(base, 0.93 + r() * 0.14); // ±7% lightness
      const grey = 175 + ((r() * 70) | 0);
      const speck = [];
      for (let s = 0; s < 10; s++) speck.push([r() * (bw - 2 * m), r() * (bh - 2 * m), r() < 0.5 ? 0.82 : 1.12, 1 + r() * 3]);
      for (const x of [k * bw + off, k * bw + off - px]) {
        if (x + bw < 0 || x > px) continue;
        const y = row * bh;
        g.fillStyle = fill;
        g.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
        for (const [sx, sy, sk, sz] of speck) {
          g.fillStyle = shade(base, sk);
          g.globalAlpha = 0.35;
          g.fillRect(x + m + sx, y + m + sy, sz, sz);
        }
        g.globalAlpha = 1;
        // Slightly darker lower edge so each brick reads in grazing light.
        g.fillStyle = 'rgba(40,15,10,0.18)';
        g.fillRect(x + m, y + bh - m - 2, bw - 2 * m, 2);
        b.fillStyle = `rgb(${grey},${grey},${grey})`;
        b.fillRect(x + m + 1, y + m + 1, bw - 2 * m - 2, bh - 2 * m - 2);
      }
    }
  }
  return { map, bump };
}

function tex(canvas, srgb) {
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

// ---------- Shader patches ----------
const NOISE_GLSL = /* glsl */ `
float lkHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float lkNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lkHash(i), lkHash(i + vec2(1,0)), u.x), mix(lkHash(i + vec2(0,1)), lkHash(i + vec2(1,1)), u.x), u.y);
}`;

function addWorldVaryings(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLkWPos;\nvarying vec3 vLkWNrm;')
    .replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvLkWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLkWNrm = normalize(mat3(modelMatrix) * objectNormal);',
    );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    '#include <common>\nvarying vec3 vLkWPos;\nvarying vec3 vLkWNrm;\n' + NOISE_GLSL,
  );
}

// Plaza ground: running-bond brick, large-scale colour drift, diagonal stone bands, lawn outside the plaza.
function groundMaterial() {
  const { map, bump } = brickCanvases({
    cols: 10, // 2 m tile → 20 × 10 cm bricks
    rows: 20,
    colors: ['#A0604A', '#9A5A46', '#A86852', '#96563F', '#AC6650', '#9C5C48'],
    mortar: '#5a3f35',
    mortarPx: 5,
    seed: 7,
  });
  const mapT = tex(map, true);
  const bumpT = tex(bump, false);
  // Ground meshes carry uv = world xz / 2 (see redSquare/Ground.jsx), so one tile = 2 m.
  const mat = new MeshStandardMaterial({ map: mapT, bumpMap: bumpT, bumpScale: 1.2, roughness: 0.72 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStone = { value: new Color(C.stoneBand) };
    shader.uniforms.uLawn = { value: new Color(C.lawn) };
    shader.uniforms.uMask = groundMask;
    shader.uniforms.uMaskB = groundMaskBounds;
    addWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uStone; uniform vec3 uLawn; uniform sampler2D uMask; uniform float uMaskB[4];\nfloat gPlaza; float gBand;',
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          vec2 p = vLkWPos.xz;
          vec2 mUv = (p - vec2(uMaskB[0], uMaskB[1])) / vec2(uMaskB[2], uMaskB[3]);
          float inside = step(0.0, mUv.x) * step(mUv.x, 1.0) * step(0.0, mUv.y) * step(mUv.y, 1.0);
          gPlaza = smoothstep(0.35, 0.65, texture2D(uMask, mUv).r) * inside;
          // Lighter stone bands on a rotated 13 m grid (real pattern still to verify, MAP.md §12).
          float ang = 0.42; float ca = cos(ang), sa = sin(ang);
          vec2 q = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
          // Few, long concrete bands like the real paving (photos IMG_4708, 4732, 4734): ~27 m apart one way, ~41 m the other.
          vec2 g = abs(fract(q / vec2(27.0, 41.0) + 0.5) - 0.5) * vec2(27.0, 41.0);
          float dLine = min(g.x, g.y);
          gBand = (1.0 - smoothstep(0.17, 0.2, dLine)) * gPlaza * 0.8;
          float n = lkNoise(p * 0.12) * 0.6 + lkNoise(p * 0.55) * 0.4;
          diffuseColor.rgb *= 0.84 + 0.3 * n;
          vec3 stone = uStone * (0.88 + 0.2 * lkNoise(p * 5.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, stone, gBand);
          vec3 lawn = uLawn * (0.65 + 0.45 * lkNoise(p * 0.3) + 0.2 * lkNoise(p * 7.0));
          diffuseColor.rgb = mix(lawn, diffuseColor.rgb, gPlaza);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.98, mix(roughnessFactor, 0.75, gBand), gPlaza);',
      )
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nvec3 gBaseN = normal;')
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = normalize(mix(gBaseN, normal, gPlaza * (1.0 - gBand)));',
      );
  };
  mat.customProgramCacheKey = () => 'lk-ground';
  return mat;
}

// Brick walls: texture is mapped from world position, so any box gets correctly sized bricks.
function wallBrickMaterial() {
  const { map } = brickCanvases({
    cols: 7, // 1.5 m tile → ~21 × 7.5 cm bricks
    rows: 20,
    colors: ['#94603F', '#7E4E33', '#A06A47', '#6B4330', '#8B5A3B', '#5E3A28'], // from IMG_4726
    mortar: '#b3a998',
    mortarPx: 3,
    seed: 21,
  });
  const mapT = tex(map, true);
  const mat = new MeshStandardMaterial({ map: mapT, color: '#d9d0cc', roughness: 0.9 });
  mat.onBeforeCompile = (shader) => {
    addWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */ `{
        vec3 an = abs(vLkWNrm);
        vec2 wuv = an.y > 0.6 ? vLkWPos.xz : (an.x > an.z ? vLkWPos.zy : vLkWPos.xy);
        vec4 sampledDiffuseColor = texture2D(map, wuv / 1.5);
        diffuseColor *= sampledDiffuseColor;
        diffuseColor.rgb *= 0.88 + 0.24 * lkNoise(vLkWPos.xy * 0.2 + vLkWPos.zz * 0.2);
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'lk-wallbrick';
  return mat;
}

// Footprint-building brick: uv is (meters along the wall, meters up), so bricks stay square on walls
// at any angle. aWin = (bay width, floor height, top of windows); bay 0 = no painted windows.
function facadeBrickMaterial(stone = false) {
  const { map } = brickCanvases({
    cols: 7,
    rows: 20,
    colors: stone ? ['#B5A38B', '#ADA088', '#BBA990', '#A99A83'] : [C.buildingBrick, '#83402F', '#6E3326', '#8A4636', '#73382B'],
    mortar: stone ? '#8f8270' : '#9a8573',
    mortarPx: stone ? 2 : 3,
    seed: stone ? 29 : 23,
  });
  const mapT = tex(map, true);
  const mat = new MeshStandardMaterial({ map: mapT, color: '#d9d0cc', roughness: 0.9 });
  const tile = stone ? 'vec2(4.5, 1.5)' : 'vec2(1.5)'; // stone ashlar blocks are larger than bricks
  mat.onBeforeCompile = (shader) => {
    addWorldVaryings(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aWin;\nvarying vec3 vWin;\nvarying vec2 vWallUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWin = aWin;\nvWallUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWin;\nvarying vec2 vWallUv;\nfloat fWin;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `{
        vec2 uv = vWallUv;
        diffuseColor *= texture2D(map, uv / ${tile});
        diffuseColor.rgb *= 0.88 + 0.24 * lkNoise(vLkWPos.xz * 0.15 + vLkWPos.yy * 0.2);
        fWin = 0.0;
        if (vWin.x > 0.0 && abs(vLkWNrm.y) < 0.5) {
          vec2 c = vec2(fract(uv.x / vWin.x), fract((uv.y - 1.0) / vWin.y));
          float w = step(0.3, c.x) * step(c.x, 0.7) * step(0.22, c.y) * step(c.y, 0.82);
          float sill = step(0.24, c.x) * step(c.x, 0.76) * step(0.17, c.y) * step(c.y, 0.22);
          float band = step(uv.y, vWin.z) * step(2.2, uv.y);
          fWin = w * band;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.68, 0.58), sill * band);
          vec3 glass = vec3(0.06, 0.05, 0.05) + vec3(0.5, 0.3, 0.12) * step(0.93, lkHash(floor(vec2(uv.x / vWin.x, uv.y / vWin.y)) + 3.1));
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, fWin);
        }
      }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, fWin);');
  };
  mat.customProgramCacheKey = () => 'lk-facade-' + (stone ? 'stone' : 'brick');
  return mat;
}

// Limestone with soft weathering variation so trim doesn't look like plastic.
// Stone and concrete with soft weathering. Options: `ashlar` = [block length, course height] draws the mortar joints
// of cut-stone blocks (Gothic cast stone); `photo` = a tileable photo texture (public/textures/redsquare/) mapped in
// world space on all three axes, `scale` metres per tile (`strength` 0..1 how much of it shows), so Blender models
// need no UVs.
function stoneMaterial(color = '#B5A38B', key = 'stone', { ashlar = null, photo = null, scale = 1, strength = 1 } = {}) {
  const mat = new MeshStandardMaterial({ color, roughness: 0.9 });
  if (photo) {
    const t = new TextureLoader().load(photo);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    mat.map = t;
  }
  mat.onBeforeCompile = (shader) => {
    addWorldVaryings(shader);
    const joints = ashlar
      ? `{
          // running-bond blocks on vertical faces: courses every ${ashlar[1]} m, joints every ${ashlar[0]} m, offset by half
          vec3 an = abs(vLkWNrm);
          vec2 w = an.x > an.z ? p.zy : p.xy;
          float row = floor(w.y / ${ashlar[1].toFixed(3)});
          vec2 q = vec2(w.x / ${ashlar[0].toFixed(3)} + 0.5 * mod(row, 2.0), w.y / ${ashlar[1].toFixed(3)});
          vec2 f = abs(fract(q) - 0.5);
          float jx = smoothstep(0.497, 0.4995, f.x) * step(an.y, 0.6);
          float jy = smoothstep(0.49, 0.497, f.y) * step(an.y, 0.6);
          diffuseColor.rgb *= 1.0 - 0.28 * max(jx, jy);
          diffuseColor.rgb *= 0.94 + 0.12 * lkHash(floor(q) + 7.0); // each block a slightly different shade
        }`
      : '';
    const photoMap = photo
      ? `{
          vec3 an = pow(abs(vLkWNrm), vec3(4.0));
          an /= an.x + an.y + an.z;
          vec3 c = texture2D(map, p.zy / ${scale.toFixed(2)}).rgb * an.x + texture2D(map, p.xz / ${scale.toFixed(2)}).rgb * an.y
                 + texture2D(map, p.xy / ${scale.toFixed(2)}).rgb * an.z;
          diffuseColor.rgb *= mix(vec3(1.0), c * 1.6, ${strength.toFixed(2)});
        }`
      : '';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', '')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      {
        vec3 p = vLkWPos;
        ${photoMap}
        float n = lkNoise(p.xy * 1.7 + p.zz * 1.3) * 0.5 + lkNoise(p.zy * 6.0 + p.xx * 2.0) * 0.3 + lkNoise(p.xz * 0.4) * 0.2;
        diffuseColor.rgb *= ${photo ? '0.9 + 0.15' : '0.8 + 0.3'} * n;
        ${joints}
        // rain streaks below sills and copings, grime near the ground
        diffuseColor.rgb *= 1.0 - 0.1 * smoothstep(0.55, 0.9, lkNoise(vec2(p.x * 3.0 + p.z * 3.0, p.y * 0.15)));
        diffuseColor.rgb *= 1.0 - 0.12 * smoothstep(0.6, 0.0, p.y);
      }`,
      );
  };
  mat.customProgramCacheKey = () => 'lk-' + key;
  return mat;
}

// Warm rim light on characters: the sun is behind them, so silhouettes catch a gold edge (DESIGN.md §4.3).
export function withRim(mat, strength = 2.8) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunView = sunView;
    shader.uniforms.uRim = { value: new Color(C.sunLight).multiplyScalar(strength) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunView; uniform vec3 uRim;')
      .replace(
        '#include <lights_fragment_begin>',
        /* glsl */ `{
          vec3 V = normalize(vViewPosition);
          float fres = pow(1.0 - saturate(dot(normal, V)), 2.5);
          float toward = saturate(dot(normal, uSunView) * 0.7 + 0.3);
          float back = saturate(dot(-V, uSunView) * 0.8 + 0.2);
          totalEmissiveRadiance += uRim * fres * toward * back * mix(vec3(1.0), diffuseColor.rgb, 0.4);
        }
        #include <lights_fragment_begin>`,
      );
  };
  mat.customProgramCacheKey = () => 'lk-rim-' + strength;
  return mat;
}

// ---------- Materials (created once, shared) ----------
let cache = null;
export function materials() {
  if (cache) return cache;
  const std = (o) => new MeshStandardMaterial(o);
  cache = {
    ground: groundMaterial(),
    wallBrick: wallBrickMaterial(),
    limestone: stoneMaterial(),
    // Red Square buildings modelled in Blender (redSquare/Glb.jsx maps their material names onto these)
    castConcrete: stoneMaterial('#b4afa6', 'cast-concrete', { photo: '/textures/redsquare/aggregate.jpg', scale: 2.4, strength: 0.3 }), // Kane Hall concrete
    aggregate: stoneMaterial('#a39e96', 'aggregate', { photo: '/textures/redsquare/aggregate.jpg', scale: 0.7 }), // planters, steps, copings (IMG_4713)
    gothicStone: stoneMaterial('#c4b0a6', 'gothic-stone', { ashlar: [1.2, 0.6] }), // Suzzallo / Gerberding cast stone blocks
    brickTan: std({ color: '#8f7656', roughness: 0.9 }), // Suzzallo's buff brick infill between the windows
    brickDark: std({ color: '#4a2a20', roughness: 0.9 }), // Meany's dark header-brick dots and bands
    roofMetal: std({ color: '#6b6a61', roughness: 0.55, metalness: 0.5 }), // Meany's standing-seam roof
    brass: std({ color: '#b8923f', roughness: 0.35, metalness: 0.85 }), // the gold drain cover in the planter circle
    skylight: std({ color: '#9fc4c8', roughness: 0.15, metalness: 0.3 }),
    glass: std({ color: '#141010', roughness: 0.55, metalness: 0.0, envMapIntensity: 0.3 }),
    glassWarm: std({ color: '#3a2618', roughness: 0.15, metalness: 0.4, emissive: '#ffb066', emissiveIntensity: 0.35 }),
    wood: std({ color: '#3a2418', roughness: 0.7 }),
    iron: std({ color: C.iron, roughness: 0.45, metalness: 0.6 }),
    lampGlobe: std({ color: C.lampGlow, emissive: C.lampGlow, emissiveIntensity: 3.2, toneMapped: false }),
    bark: std({ color: C.tree, roughness: 1 }),
    benchWood: std({ color: '#6b4a32', roughness: 0.8 }),
    facadeBrick: facadeBrickMaterial(false),
    facadeStone: facadeBrickMaterial(true),
    roofFlat: std({ color: '#3d3330', roughness: 0.9 }),
    suzzRoof: std({ color: '#6c7a7c', roughness: 0.6, metalness: 0.25 }), // OSM roof:colour lightsteelblue
    concrete: std({ color: '#a39484', roughness: 0.92 }),
    corten: std({ color: '#5c2f1c', roughness: 0.8, metalness: 0.35 }), // Broken Obelisk weathering steel
    bronze: std({ color: '#3f3a2a', roughness: 0.45, metalness: 0.7 }),
    granite: std({ color: '#8d857c', roughness: 0.7 }),
    water: std({ color: '#4d6670', roughness: 0.08, metalness: 0.6 }),
    jet: std({ color: '#ffffff', emissive: '#fff4e2', emissiveIntensity: 0.6, transparent: true, opacity: 0.55, depthWrite: false }),
    // Skater
    jacket: withRim(std({ color: C.jacket, roughness: 0.92 })),
    tee: withRim(std({ color: '#f4f1ea', roughness: 0.9 })),
    pants: withRim(std({ color: C.pants, roughness: 0.95 })),
    hat: withRim(std({ color: C.hat, roughness: 0.95, side: DoubleSide })),
    sneakers: withRim(std({ color: C.sneakers, roughness: 0.55 })),
    skin: withRim(std({ color: '#c99a7a', roughness: 0.7 })),
    hair: withRim(std({ color: '#1a1310', roughness: 0.8 })),
    deck: std({ color: C.deck, roughness: 0.6 }),
    grip: std({ color: '#151515', roughness: 1 }),
    wheels: std({ color: C.wheels, roughness: 0.45 }),
    trucks: std({ color: C.trucks, roughness: 0.35, metalness: 0.85 }),
  };
  return cache;
}
