# Step 5: tag every face of the 25k skater as one body part, by position on the body AND texture colour.
# Boundaries come from cross-sections of the cleaned mesh (1.65 m tall, faces -Y, character's left = +X):
#   legs are separate below the crotch (0.59 m), arms are separate from the torso from 1.15 m down to the
#   fingertips (0.77 m), so no seams need splitting: parts only need tagging.
# In:  art/character/clean.blend (skater_low)
# Out: art/character/parts.blend (skater_low with face attribute "part" + preview colours),
#      art/renders/05_parts.png (flat colour per part, front | back | right side)
# Run: blender.exe -b --python art/scripts/05_parts.py
import os

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'character', 'clean.blend')
OUT = os.path.join(ROOT, 'character', 'parts.blend')
RENDER = os.path.join(ROOT, 'renders', '05_parts.png')

PARTS = ['head', 'hair', 'cap', 'torso', 'hips', 'arm_L', 'arm_R', 'hand_L', 'hand_R', 'leg_L', 'leg_R', 'shoe_L', 'shoe_R']
COLOURS = {  # preview colours, one per part
    'head': (0.95, 0.75, 0.6), 'hair': (1.0, 0.9, 0.2), 'cap': (0.1, 0.1, 0.6), 'torso': (0.9, 0.3, 0.1),
    'hips': (0.4, 0.2, 0.1), 'arm_L': (0.2, 0.7, 0.2), 'arm_R': (0.6, 0.9, 0.3), 'hand_L': (0.0, 0.6, 0.6),
    'hand_R': (0.4, 0.9, 0.9), 'leg_L': (0.5, 0.2, 0.7), 'leg_R': (0.8, 0.5, 0.9), 'shoe_L': (0.9, 0.9, 0.9),
    'shoe_R': (0.6, 0.6, 0.6),
}
CROTCH_Z = 0.59  # legs separate below this
NECK_Z = 1.36  # shoulder top / bottom of the head region
SHOULDER_X = 0.185  # torso half-width; further out is arm (A-pose)
ARM_MIN_Z = 0.74
ARMPIT_Z = 1.16  # arms are separate from the torso below this
HAND_LEN = 0.17  # m, measured back from the fingertip along the arm
SHOE_TOP = 0.13

bpy.ops.wm.open_mainfile(filepath=SRC)
obj = bpy.data.objects['skater_low']
mesh = obj.data
nf = len(mesh.polygons)

# Face centres and normals.
cen = np.empty(nf * 3, np.float32)
mesh.polygons.foreach_get('center', cen)
cen = cen.reshape(-1, 3)
x, y, z = cen.T

# Face colour: baked base colour sampled at the UV centre of each face.
img = bpy.data.images['skater_basecolor']
W, H = img.size
tex = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[..., :3]
uv = np.empty(len(mesh.loops) * 2, np.float32)
mesh.uv_layers.active.data.foreach_get('uv', uv)
uv = uv.reshape(-1, 2)
loop_start = np.empty(nf, np.int32)
mesh.polygons.foreach_get('loop_start', loop_start)
loop_total = np.empty(nf, np.int32)
mesh.polygons.foreach_get('loop_total', loop_total)
fuv = np.add.reduceat(uv, loop_start) / loop_total[:, None]
px = np.clip((fuv[:, 0] * W).astype(int), 0, W - 1)
py = np.clip((fuv[:, 1] * H).astype(int), 0, H - 1)
rgb = tex[py, px]
r, g, b = rgb.T
lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
sat = rgb.max(axis=1) - rgb.min(axis=1)

side = np.where(x > 0, 'L', 'R')  # character's left is +X
part = np.full(nf, 'torso', dtype=object)

# Legs and shoes (below the crotch).
low = z < CROTCH_Z
part[low] = np.char.add('leg_', side[low])
shoe = low & (z < SHOE_TOP) & (lum > 0.42) & (sat < 0.15)
part[shoe] = np.char.add('shoe_', side[shoe])

# Hips: jeans + belt between crotch and the shirt hem (dark, unsaturated).
# The hem is where the body slices stop being mostly dark denim: a clean horizontal cut, not per-face colour.
centre = (np.abs(x) < SHOULDER_X) & (z >= CROTCH_Z) & (z < 1.1)
dark = (lum < 0.33) & (sat < 0.2)
hem_z = CROTCH_Z
for zz in np.arange(CROTCH_Z, 1.1, 0.01):
    sl = centre & (z >= zz) & (z < zz + 0.01)
    if sl.sum() > 10 and dark[sl].mean() > 0.5:
        hem_z = zz + 0.01
print(f'shirt hem at {hem_z:.2f} m')
part[(z >= CROTCH_Z) & (z < hem_z) & (np.abs(x) < 0.215)] = 'hips'

# Arms and hands.
for s, sign in (('L', 1), ('R', -1)):
    # Above the armpit the arm starts at the shoulder line; below it, past the jeans/hip sides (up to 0.21 m).
    on = (x * sign > np.where(z > ARMPIT_Z, SHOULDER_X, 0.215)) & (z > ARM_MIN_Z) & (z < NECK_Z)
    part[on] = 'arm_' + s
    tip_i = np.argmin(np.where(on, z, np.inf))
    tip = cen[tip_i]
    shoulder = np.array([sign * SHOULDER_X, 0.0, 1.30], np.float32)
    axis = tip - shoulder
    L = np.linalg.norm(axis)
    t = (cen - shoulder) @ axis / (L * L)
    part[on & (t > 1 - HAND_LEN / L)] = 'hand_' + s
    print(f'arm {s}: shoulder->fingertip {L:.2f} m, tip at {tip.round(2)}')

# Head region: cap (navy), hair (blonde / purple), head (skin) by colour.
head = z >= NECK_Z
navy = (b > r + 0.03) & (lum < 0.35)
purple = (r > g + 0.08) & (b > g + 0.08)
blonde = (r > b + 0.12) & (g > b + 0.06) & (lum > 0.45) & (r - g < 0.18)
part[head] = 'head'
part[head & (blonde | purple)] = 'hair'
part[head & navy] = 'cap'
part[head & (z > 1.56) & (lum < 0.4)] = 'cap'  # top of the head is all cap
# The mullet hangs below the neck line at the back and sides.
mullet = (z >= NECK_Z - 0.12) & (z < NECK_Z) & (np.abs(x) < 0.13) & (blonde | purple) & (y > -0.02)
part[mullet] = 'hair'

# Store: face attribute "part" (index into PARTS) + a preview colour per face corner.
idx = np.array([PARTS.index(p) for p in part], np.int32)
attr = mesh.attributes.get('part') or mesh.attributes.new('part', 'INT', 'FACE')
attr.data.foreach_set('value', idx)
prev = mesh.color_attributes.get('part_preview') or mesh.color_attributes.new('part_preview', 'FLOAT_COLOR', 'CORNER')
col = np.array([COLOURS[p] + (1.0,) for p in PARTS], np.float32)[idx]
prev.data.foreach_set('color_srgb', np.repeat(col, loop_total, axis=0).ravel())
mesh.color_attributes.active_color = prev
counts = {p: int((idx == i).sum()) for i, p in enumerate(PARTS)}
print('PARTS', counts)
bpy.ops.wm.save_as_mainfile(filepath=OUT)

# Preview render: front | back | right side, flat part colours.
scene = bpy.context.scene
for o in scene.objects:
    o.hide_render = o != obj
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'FLAT'
scene.display.shading.color_type = 'VERTEX'
scene.render.resolution_x = scene.render.resolution_y = 768
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 1.8
strips = []
for name, d in (('front', Vector((0, -1, 0))), ('back', Vector((0, 1, 0))), ('right', Vector((-1, 0, 0)))):
    cam.location = Vector((0, 0, 0.825)) + d * 5
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = RENDER.replace('.png', f'_{name}.png')
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(scene.render.filepath)
    strips.append(np.array(im.pixels[:], np.float32).reshape(768, 768, 4))
    os.remove(scene.render.filepath)
out = bpy.data.images.new('parts', 768 * 3, 768)
out.pixels[:] = np.concatenate(strips, axis=1).ravel()
out.filepath_raw = RENDER
out.file_format = 'PNG'
out.save()
print('SAVED', OUT, RENDER)
