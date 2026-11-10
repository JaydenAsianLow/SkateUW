# Render an FBX/GLB character at rest (front + side), 768 px, into art/renders/.
# Run: blender -b --python art/scripts/12_render_mixamo.py -- <file> <out_name> [frame]
import bpy, sys, math, os
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
path, name = args[0], args[1]
frame = int(args[2]) if len(args) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
if path.lower().endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath=path)
else:
    bpy.ops.import_scene.gltf(filepath=path)
scn = bpy.context.scene
arm = next((o for o in scn.objects if o.type == 'ARMATURE'), None)
if arm and arm.animation_data and frame is None:
    arm.animation_data.action = None  # rest pose
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
if frame is not None:
    scn.frame_set(frame)

# Bounds of all meshes (evaluated).
dg = bpy.context.evaluated_depsgraph_get()
lo = Vector((1e9,) * 3)
hi = Vector((-1e9,) * 3)
for o in scn.objects:
    if o.type != 'MESH' or o.name.startswith('Icosphere'):  # glTF import adds a bone-display sphere
        continue
    me = o.evaluated_get(dg).to_mesh()
    for v in me.vertices:
        w = o.matrix_world @ v.co
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
c = (lo + hi) / 2
size = max(hi - lo)
print('BOUNDS', [round(x, 3) for x in lo], [round(x, 3) for x in hi])

scn.render.engine = 'BLENDER_EEVEE_NEXT'
scn.render.resolution_x = 768
scn.render.resolution_y = 768
scn.world = bpy.data.worlds.new('w')
scn.world.use_nodes = True
scn.world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.75, 0.78, 1)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
scn.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type = 'ORTHO'
cam.data.ortho_scale = (hi.z - lo.z) * 1.08  # frame the height (T-pose arms may be cut off)
c.x = 0
scn.collection.objects.link(cam)
scn.camera = cam
os.makedirs(os.path.abspath('art/renders'), exist_ok=True)
# Mixamo / glTF characters face -Y in Blender.
for view, loc, rot in [
    ('front', (c.x, c.y - 5, c.z), (math.radians(90), 0, 0)),
    ('side', (c.x + 5, c.y, c.z), (math.radians(90), 0, math.radians(90))),
    ('back', (c.x, c.y + 5, c.z), (math.radians(90), 0, math.radians(180))),
]:
    cam.location = loc
    cam.rotation_euler = rot
    scn.render.filepath = os.path.abspath(f'art/renders/{name}_{view}.png')
    bpy.ops.render.render(write_still=True)
print('DONE')
