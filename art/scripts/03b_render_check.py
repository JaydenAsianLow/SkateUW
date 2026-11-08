# Check render: import a GLB and render it orthographic from 4 sides (+X, -X, +Y, -Y), with texture colours,
# side by side in one image, to see which way the model faces before cleanup.
# Run: blender.exe -b --python art/scripts/03b_render_check.py -- [path/to/model.glb] [out.png]
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
src = args[0] if args else os.path.join(ROOT, 'character', 'model.glb')
out = os.path.abspath(args[1] if len(args) > 1 else os.path.join(ROOT, 'renders', '03_check.png'))
src = os.path.abspath(src)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
mid, size = (lo + hi) / 2, hi - lo
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print(f'BBOX size x={size.x:.3f} y={size.y:.3f} z={size.z:.3f}  triangles={tris}  meshes={len(meshes)}')

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
has_tex = any(n.type == 'TEX_IMAGE' for o in meshes for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes)
has_col = any(o.data.color_attributes for o in meshes)
scene.display.shading.color_type = 'TEXTURE' if has_tex else ('VERTEX' if has_col else 'MATERIAL')
scene.render.resolution_x = scene.render.resolution_y = 768
scene.render.film_transparent = False
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = max(size) * 1.1

views = {'+X': Vector((1, 0, 0)), '-X': Vector((-1, 0, 0)), '+Y': Vector((0, 1, 0)), '-Y': Vector((0, -1, 0))}
files = []
for name, d in views.items():
    cam.location = mid + d * (max(size) * 3)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = out.replace('.png', f'_{name.replace("+", "p").replace("-", "m")}.png')
    bpy.ops.render.render(write_still=True)
    files.append(scene.render.filepath)

# Stitch the 4 renders into one strip.
import numpy as np
imgs = [bpy.data.images.load(f) for f in files]
arr = [np.array(i.pixels[:], np.float32).reshape(768, 768, 4) for i in imgs]
# 5 cm grid (stronger every 50 cm), drawn in world units: rows = height, columns = the image-right axis.
mpp = cam.data.ortho_scale / 768
for a, d in zip(arr, views.values()):
    right = (-d).cross(Vector((0, 0, 1)))
    for axis_val, centre, cols in ((None, mid.z, False), (right, mid.dot(right), True)):
        for k in range(-60, 61):
            world = round(centre / 0.05) * 0.05 + k * 0.05
            px_pos = int(round(384 + (world - centre) / mpp))
            if not 0 <= px_pos < 768:
                continue
            strength = 0.35 if abs(round(world / 0.05)) % 10 == 0 else 0.12
            sl = a[:, px_pos, :3] if cols else a[px_pos, :, :3]
            sl[:] = sl * (1 - strength) + 0.6 * strength
strip = np.concatenate(arr, axis=1)
img = bpy.data.images.new('strip', 768 * 4, 768)
img.pixels[:] = strip.ravel()
img.filepath_raw = out
img.file_format = 'PNG'
img.save()
for f in files:
    os.remove(f)
print('SAVED', out, 'order:', ' | '.join(f'camera at {k}' for k in views))
