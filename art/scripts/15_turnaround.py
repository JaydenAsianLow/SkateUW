# Turnaround sheet: the character at rest from 5 angles (front, 3/4, side, 3/4 back, back)
# side by side in one orthographic render, 768 px per view, into art/renders/.
# Run: blender -b --python art/scripts/15_turnaround.py -- <file.glb> <out_name>
import bpy, sys, math, os
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
path, name = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

VIEWS = [('FRONT', 0), ('3/4', 45), ('SIDE', 90), ('3/4 BACK', 135), ('BACK', 180)]
SPACING = 2.0  # metres between figures (T-pose arm span is ~1.7 m)
PANEL_PX = 768

text_mat = bpy.data.materials.new('label')
text_mat.use_nodes = True
text_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.08, 0.08, 0.1, 1)

lo = Vector((1e9,) * 3)
hi = Vector((-1e9,) * 3)
for i, (label, ang) in enumerate(VIEWS):
    before = set(scn.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in scn.objects if o not in before]
    for o in new:
        if o.name.startswith('Icosphere'):  # glTF bone-display sphere
            bpy.data.objects.remove(o)
    new = [o for o in scn.objects if o not in before]
    for o in new:
        if o.type == 'ARMATURE':
            if o.animation_data:
                o.animation_data.action = None
            for pb in o.pose.bones:
                pb.matrix_basis.identity()
    x = (i - (len(VIEWS) - 1) / 2) * SPACING
    pivot = bpy.data.objects.new(f'turn_{i}', None)
    scn.collection.objects.link(pivot)
    pivot.location = (x, 0, 0)
    pivot.rotation_euler = (0, 0, math.radians(ang))
    for o in new:
        if o.parent is None:
            o.parent = pivot
    # Label under the feet.
    cu = bpy.data.curves.new(f'lbl_{i}', 'FONT')
    cu.body = label
    cu.align_x = 'CENTER'
    cu.size = 0.14
    t = bpy.data.objects.new(f'lbl_{i}', cu)
    t.data.materials.append(text_mat)
    t.location = (x, -1.0, -0.22)
    t.rotation_euler = (math.radians(90), 0, 0)
    scn.collection.objects.link(t)

bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
for o in scn.objects:
    if o.type != 'MESH':
        continue
    me = o.evaluated_get(dg).to_mesh()
    for v in me.vertices:
        w = o.matrix_world @ v.co
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
print('BOUNDS', [round(v, 3) for v in lo], [round(v, 3) for v in hi])

width = len(VIEWS) * SPACING
z_lo, z_hi = -0.35, hi.z + 0.12
height = z_hi - z_lo
scn.render.engine = 'BLENDER_EEVEE_NEXT'
scn.render.resolution_x = PANEL_PX * len(VIEWS)
scn.render.resolution_y = round(PANEL_PX * len(VIEWS) * height / width)
scn.world = bpy.data.worlds.new('w')
scn.world.use_nodes = True
scn.world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.75, 0.78, 1)
# Light from the camera side so every view is lit the same way.
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3
sun.rotation_euler = (math.radians(60), 0, math.radians(-20))
scn.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type = 'ORTHO'
cam.data.ortho_scale = width
cam.location = (0, -10, (z_lo + z_hi) / 2)
cam.rotation_euler = (math.radians(90), 0, 0)
scn.collection.objects.link(cam)
scn.camera = cam
os.makedirs(os.path.abspath('art/renders'), exist_ok=True)
scn.render.filepath = os.path.abspath(f'art/renders/{name}.png')
bpy.ops.render.render(write_still=True)
print('DONE', scn.render.filepath)
