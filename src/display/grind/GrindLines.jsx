import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { BoxGeometry, Color, Euler, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { merge } from '../look.js';
import { urlParams } from '../util.js';
import { CURB, LEDGE, RAIL, buildGrindLines, grind } from './lines.js';
import { scuffs } from './grinding.js';

// Builds the grind lines once the level is in the physics world, and draws them when asked: key G toggles them in
// game, ?grinddebug shows them from the start (and clears the fog for top-down shots). Mount inside <Physics>.
// Colours: blue rail, orange ledge, pink curb; long lines (balance + side camera) are drawn thicker.

const DEBUG = import.meta.env.DEV && urlParams.has('grinddebug');
export const GRIND_COLORS = { [RAIL]: '#2ad4ff', [LEDGE]: '#ff9a1f', [CURB]: '#ff3fd2' };

export default function GrindLines() {
  const { world, rapier } = useRapier();
  const [version, setVersion] = useState(0);
  const [show, setShow] = useState(DEBUG);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'KeyG' || e.repeat || e.target?.closest?.('input, textarea, select')) return;
      setShow((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    // The level's pieces load at different times (each Blender model adds its colliders when it arrives), so build
    // once the number of colliders has stopped changing, and again if a late piece adds more. A cheap count check
    // every 0.4 s; the build itself runs only when the level changed.
    let seen = -1;
    let built = -1;
    const timer = setInterval(() => {
      const n = world.colliders.len();
      const stable = n === seen;
      seen = n;
      if (!stable || n === built || n === 0) return;
      built = n;
      try {
        buildGrindLines(world, rapier);
      } catch (e) {
        console.error('[grind] build failed', e);
        return;
      }
      const c = { rail: 0, ledge: 0, curb: 0 };
      grind.lines.forEach((l) => c[l.type]++);
      if (grind.trimmed.length) console.info('[grind] ends cut back: ' + grind.trimmed.join('; '));
      console.info(`[grind] ${grind.lines.length} lines (rails ${c.rail}, ledges ${c.ledge}, curbs ${c.curb}) from ${n} colliders in ${grind.buildMs.toFixed(0)} ms`);
      if (import.meta.env.DEV && window.__skate) (window.__skate.grind = grind), (window.__skate.scuffs = scuffs);
      setVersion((v) => v + 1);
    }, 400);
    return () => clearInterval(timer);
  }, [world, rapier]);
  return (
    <>
      <Scuffs />
      {show && version > 0 && <GrindDebug key={version} />}
    </>
  );
}

// Dark scuff marks where the trucks / deck ground along a ledge or curb (grinding.js addScuff).
const SCUFF_W = 0.1;
function Scuffs() {
  const mesh = useMemo(() => {
    const g = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new MeshBasicMaterial({ color: '#0d0907', transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return { g, m };
  }, []);
  const ref = useRef(null);
  const seen = useRef(-1);
  useFrame(() => {
    const im = ref.current;
    if (!im || seen.current === scuffs.version) return;
    seen.current = scuffs.version;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    scuffs.list.forEach((sc, i) => {
      m.compose(new Vector3(sc.x, sc.y, sc.z), q.setFromEuler(e.set(0, sc.yaw + Math.PI / 2, 0)), new Vector3(sc.len, 1, SCUFF_W));
      im.setMatrixAt(i, m);
    });
    im.count = scuffs.list.length;
    im.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[mesh.g, mesh.m, scuffs.max]} count={0} frustumCulled={false} renderOrder={2} />;
}

const W = Number(urlParams.get('grindwidth')) || 0.35; // ribbon width in the debug view (wider for far top-down shots)

function GrindDebug() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!DEBUG) return undefined;
    const fog = scene.fog;
    scene.fog = null; // ?grinddebug: see the whole plaza from above
    return () => void (scene.fog = fog);
  }, [scene]);
  const meshes = useMemo(() => {
    const byType = { [RAIL]: [], [LEDGE]: [], [CURB]: [] };
    const m = new Matrix4();
    const up = new Vector3(0, 1, 0);
    for (const l of grind.lines) {
      for (let i = 0; i < l.pts.length - 1; i++) {
        const a = new Vector3(...l.pts[i]), b = new Vector3(...l.pts[i + 1]);
        const len = a.distanceTo(b);
        const z = b.clone().sub(a).normalize();
        const x = new Vector3().crossVectors(up, z).normalize();
        const y = new Vector3().crossVectors(z, x);
        m.makeBasis(x, y, z).setPosition(a.clone().lerp(b, 0.5).add(new Vector3(0, 0.06, 0)));
        byType[l.type].push(new BoxGeometry(l.long ? W * 1.6 : W, 0.08, len).applyMatrix4(m));
      }
    }
    return Object.entries(byType)
      .filter(([, g]) => g.length)
      .map(([type, g]) => ({ type, geo: merge(g), mat: new MeshBasicMaterial({ color: new Color(GRIND_COLORS[type]), depthTest: false, toneMapped: false }) }));
  }, []);
  useEffect(() => {
    // Table of every line for the report (read with a headless browser's --dump-dom).
    const pre = document.createElement('pre');
    pre.id = 'grindlist';
    pre.style.display = 'none';
    pre.textContent = grind.lines
      .map((l) => [l.id, l.type, l.long ? 'long' : 'short', l.length.toFixed(1) + 'm', 'h' + l.height.toFixed(2), l.name, l.pts.map((p) => `(${p[0].toFixed(1)},${p[1].toFixed(2)},${p[2].toFixed(1)})`).join('-')].join(' '))
      .join('\n');
    document.body.appendChild(pre);
    return () => pre.remove();
  }, []);
  return (
    <>
      {meshes.map(({ type, geo, mat }) => (
        <mesh key={type} geometry={geo} material={mat} renderOrder={10} />
      ))}
      {!urlParams.has('nolabels') &&
        grind.lines.map((l) => {
          const k = Math.floor(l.pts.length / 2) - (l.pts.length % 2 ? 0 : 1);
          const a = l.pts[k], b = l.pts[k + 1];
          return (
            <Html key={l.id} position={[(a[0] + b[0]) / 2, a[1] + 0.3, (a[2] + b[2]) / 2]} center zIndexRange={[10, 0]}>
              <div style={{ background: GRIND_COLORS[l.type], color: '#111', font: 'bold 10px sans-serif', padding: '0 3px', borderRadius: 3, whiteSpace: 'nowrap', opacity: 0.92 }}>
                {l.id} {l.long ? 'LONG' : 'short'}
              </div>
            </Html>
          );
        })}
    </>
  );
}
