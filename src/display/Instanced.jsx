import { useLayoutEffect, useMemo, useRef } from 'react';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

// Draw many copies of one geometry + material in a single draw call.
// `items` = [{ position: [x, y, z], rotY, scale }]; mesh props (castShadow, ...) pass through.
export function Instanced({ geometry, material, items, ...props }) {
  const ref = useRef(null);
  const matrices = useMemo(() => {
    const e = new Euler();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    return items.map(({ position, rotY = 0, scale = 1 }) =>
      new Matrix4().compose(p.fromArray(position), q.setFromEuler(e.set(0, rotY, 0)), s.setScalar(scale)),
    );
  }, [items]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} {...props} />;
}
