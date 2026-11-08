# Step 10: export the rigged skater for the game, then re-import it and check it.
# No animation clips: the game drives the skeleton live from the board physics (src/display/RiderModel.jsx),
# so pushes, pops, flips, carves and bails always match what the board does, with the feet locked to the deck.
# In:  art/character/rig.blend
# Out: public/models/skater/skater.glb, public/models/skater/joints.json (rest joints in three.js axes:
#      +Y up, +Z forward, +X = character's left)
# Run: blender.exe -b --python art/scripts/10_export.py
import json
import os

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(os.path.dirname(ROOT), 'public', 'models', 'skater')
os.makedirs(GAME, exist_ok=True)
GLB = os.path.join(GAME, 'skater.glb')

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'character', 'rig.blend'))
obj = bpy.data.objects['skater']
arm = bpy.data.objects['Armature']
# Strip the working data the game doesn't need (part tags, preview colours).
for a in [a for a in obj.data.attributes if a.name in ('part',)]:
    obj.data.attributes.remove(a)
while obj.data.color_attributes:
    obj.data.color_attributes.remove(obj.data.color_attributes[0])
for o in bpy.context.scene.objects:
    o.select_set(o in (obj, arm))
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=GLB, export_format='GLB', use_selection=True, export_yup=True,
    export_skins=True, export_animations=False, export_apply=False,
    export_image_format='JPEG', export_jpeg_quality=90,
)

joints = json.load(open(os.path.join(ROOT, 'character', 'joints.json')))['joints']
three = {k: [v[0], v[2], -v[1]] for k, v in joints.items()}  # Blender (x, y, z) -> glTF (x, z, -y)
json.dump({'units': 'metres', 'axes': 'three.js: +Y up, +Z forward, +X = character left', 'joints': three},
          open(os.path.join(GAME, 'joints.json'), 'w'), indent=1)

# Re-import into an empty scene and check.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.find_armature()]  # skip importer bone shapes
tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
zs = [(m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices]
imgs = [i.name for i in bpy.data.images]
print(f'CHECK bones={len(arms[0].data.bones) if arms else 0} triangles={tris} height={max(zs) - min(zs):.3f} m '
      f'feet at {min(zs):.3f} images={imgs} size={os.path.getsize(GLB) / 1e6:.1f} MB')
