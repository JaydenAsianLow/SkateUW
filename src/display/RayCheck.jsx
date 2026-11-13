import { useEffect } from 'react';
import { useRapier } from '@react-three/rapier';
import { urlParams } from './util.js';

// Dev only: ?raycheck casts rays straight down at the given spots a few seconds after load and writes the ground
// height under each into <pre id="raycheck"> (read with a headless browser's --dump-dom). Checks that raised levels,
// banks and hills really are solid. ?raycheck=x,z;x,z;... or the default spots below.
const SPOTS = [
  ['hill', 50, -2], ['obelisk level', 42, -10], ['bank', 28.5, -6], ['north level', -25, -50],
  ['kane walk', 8, -31], ['pad', 0.3, 6], ['plaza', 0, 0],
];
export default function RayCheck() {
  const { world, rapier } = useRapier();
  useEffect(() => {
    const custom = urlParams.get('raycheck');
    const spots = custom ? custom.split(';').map((s, i) => [`p${i}`, ...s.split(',').map(Number)]) : SPOTS;
    const t = setTimeout(() => {
      world.step(); // the scene-query index is only built by a step (physics is paused behind the menu)
      const out = spots.map(([name, x, z]) => {
        const ray = new rapier.Ray({ x, y: 20, z }, { x: 0, y: -1, z: 0 });
        const hit = world.castRay(ray, 40, true);
        return `${name} (${x}, ${z}): ${hit ? (20 - hit.timeOfImpact).toFixed(2) + ' m' : 'no ground'}`;
      });
      const pre = document.createElement('pre');
      pre.id = 'raycheck';
      pre.textContent = out.join('\n');
      document.body.appendChild(pre);
    }, 6000);
    return () => clearTimeout(t);
  }, [world, rapier]);
  return null;
}
