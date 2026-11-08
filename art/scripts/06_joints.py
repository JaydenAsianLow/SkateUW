# Step 6: place the joints (Mixamo names) and draw them on front + side renders for checking.
# Each joint sits at the centre of its body part's cross-section at that point:
#   legs / spine / neck: horizontal slices of the right parts at a given height,
#   arms: slices perpendicular to the shoulder -> fingertip line (A-pose).
# Heights come from standard proportions for 1.65 m, checked against what the mesh shows
# (shoulder top 1.33-1.36, neck 1.38-1.44, shirt hem 0.86, crotch of the baggy jeans 0.59).
# In:  art/character/parts.blend   Out: art/character/joints.json, art/renders/06_joints.png
# Run: blender.exe -b --python art/scripts/06_joints.py
import json
import os

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'character', 'parts.blend')
OUT = os.path.join(ROOT, 'character', 'joints.json')
RENDER = os.path.join(ROOT, 'renders', '06_joints.png')
PARTS = ['head', 'hair', 'cap', 'torso', 'hips', 'arm_L', 'arm_R', 'hand_L', 'hand_R', 'leg_L', 'leg_R', 'shoe_L', 'shoe_R']

# Heights (m). H = 1.65.
Z = {
    'Hips': 0.90, 'Spine': 1.00, 'Spine1': 1.11, 'Spine2': 1.22, 'Neck': 1.38, 'Head': 1.47, 'HeadTop_End': 1.65,
    'UpLeg': 0.85, 'Leg': 0.47, 'Foot': 0.085, 'ToeBase': 0.025,
}
SHOULDER_JOINT = (0.165, 1.285)  # |x|, z of the ball of the shoulder
CLAVICLE = (0.05, 1.33)
UPPER_ARM = 0.29  # shoulder -> elbow, m (≈0.18 H)

bpy.ops.wm.open_mainfile(filepath=SRC)
obj = bpy.data.objects['skater_low']
mesh = obj.data
nf = len(mesh.polygons)
cen = np.empty(nf * 3, np.float32)
mesh.polygons.foreach_get('center', cen)
cen = cen.reshape(-1, 3)
area = np.empty(nf, np.float32)
mesh.polygons.foreach_get('area', area)
part = np.empty(nf, np.int32)
mesh.attributes['part'].data.foreach_get('value', part)
in_parts = lambda *names: np.isin(part, [PARTS.index(n) for n in names])


def slice_centre(sel, z, half=0.015):
    """Centre of the faces in `sel` within a horizontal slab around height z (bounding-box middle in x, y)."""
    m = sel & (np.abs(cen[:, 2] - z) < half)
    assert m.sum() > 3, f'no faces at z={z}'
    p = cen[m]
    return np.array([(p[:, 0].min() + p[:, 0].max()) / 2, (p[:, 1].min() + p[:, 1].max()) / 2, z])


def limb_centre(sel, origin, axis, t, half=0.015):
    """Centre of the faces in `sel` within a slab perpendicular to `axis` at distance t from origin."""
    d = (cen - origin) @ axis
    m = sel & (np.abs(d - t) < half)
    assert m.sum() > 3, f'no faces at t={t}'
    p = cen[m]
    w = area[m][:, None]
    return (p * w).sum(axis=0) / w.sum()


J = {}
body = in_parts('torso', 'hips')
J['Hips'] = slice_centre(body, Z['Hips'])
J['Spine'] = slice_centre(body, Z['Spine'])
J['Spine1'] = slice_centre(in_parts('torso'), Z['Spine1'])
J['Spine2'] = slice_centre(in_parts('torso'), Z['Spine2'])
J['Neck'] = slice_centre(in_parts('head', 'hair', 'torso'), Z['Neck'])
J['Neck'][0] = 0.0
J['Head'] = slice_centre(in_parts('head', 'hair', 'cap'), Z['Head'])
J['Head'][0] = 0.0
J['HeadTop_End'] = np.array([0.0, J['Head'][1], Z['HeadTop_End']])
for k in ('Hips', 'Spine', 'Spine1', 'Spine2'):
    J[k][0] = 0.0  # keep the spine on the symmetry line

for s, side, sign in (('L', 'Left', 1), ('R', 'Right', -1)):
    leg = in_parts('leg_' + s, 'shoe_' + s)
    up = slice_centre(in_parts('hips') & (cen[:, 0] * sign > 0.02), Z['UpLeg'])
    up[0] = sign * 0.09  # hip sockets ~9 cm either side of centre
    J[side + 'UpLeg'] = up
    J[side + 'Leg'] = slice_centre(leg, Z['Leg'])
    shoe = cen[in_parts('shoe_' + s)]
    sx = (shoe[:, 0].min() + shoe[:, 0].max()) / 2
    toe_y, heel_y = shoe[:, 1].min(), shoe[:, 1].max()  # front of the foot is -Y
    foot_len = heel_y - toe_y
    J[side + 'Foot'] = np.array([sx, heel_y - 0.25 * foot_len, Z['Foot']])
    J[side + 'ToeBase'] = np.array([sx, toe_y + 0.28 * foot_len, Z['ToeBase']])
    J[side + 'Toe_End'] = np.array([sx, toe_y, Z['ToeBase']])

    arm = in_parts('arm_' + s, 'hand_' + s)
    shoulder = np.array([sign * SHOULDER_JOINT[0], 0.0, SHOULDER_JOINT[1]])
    tip_i = np.argmin(np.where(in_parts('hand_' + s), cen[:, 2], np.inf))
    tip = cen[tip_i]
    axis = (tip - shoulder) / np.linalg.norm(tip - shoulder)
    length = np.linalg.norm(tip - shoulder)
    # Wrist: where the hand part starts along the arm.
    t_hand = ((cen[in_parts('hand_' + s)] - shoulder) @ axis).min()
    sh = limb_centre(arm, shoulder, axis, 0.06)  # just outside the shoulder, centred in the sleeve
    J[side + 'Shoulder'] = np.array([sign * CLAVICLE[0], sh[1], CLAVICLE[1]])
    J[side + 'Arm'] = shoulder + axis * 0.0
    J[side + 'Arm'][1] = sh[1]
    J[side + 'ForeArm'] = limb_centre(arm, shoulder, axis, UPPER_ARM)
    J[side + 'Hand'] = limb_centre(arm, shoulder, axis, t_hand + 0.01)
    J[side + 'HandEnd'] = tip
    print(f'{side} arm: shoulder->fingertip {length:.2f} m, elbow at {UPPER_ARM:.2f}, wrist at {t_hand:.2f}')

joints = {k: [round(float(c), 4) for c in v] for k, v in J.items()}
json.dump({'units': 'metres', 'axes': 'Blender: +Z up, -Y forward, +X = character left', 'joints': joints},
          open(OUT, 'w'), indent=1)
for k, v in joints.items():
    print(f'JOINT {k:16s} x={v[0]:+.3f} y={v[1]:+.3f} z={v[2]:.3f}')

# --- Check render: see-through body, red joint dots, labels, 5 cm grid. Front | right side.
scene = bpy.context.scene
for o in list(scene.objects):
    if o != obj:
        bpy.data.objects.remove(o)
mat_dot = bpy.data.materials.new('dot')
mat_dot.diffuse_color = (1, 0.05, 0.05, 1)
dots, labels = [], []
for k, v in J.items():
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, location=Vector(v), segments=12, ring_count=8)
    d = bpy.context.object
    d.color = (1, 0.05, 0.05, 1)
    dots.append(d)
    bpy.ops.object.text_add(location=Vector(v))
    t = bpy.context.object
    t.data.body = k.replace('Left', 'L ').replace('Right', 'R ')
    t.data.size = 0.022
    t.color = (1, 0.95, 0.3, 1)
    labels.append((t, Vector(v), k))
obj.color = (0.75, 0.75, 0.75, 1)
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'FLAT'
scene.display.shading.color_type = 'OBJECT'
scene.display.shading.show_xray = True
scene.display.shading.xray_alpha = 0.35
scene.render.resolution_x = scene.render.resolution_y = 1024
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 1.8
centre = Vector((0, 0, 0.84))
imgs = []
for name, d in (('front', Vector((0, -1, 0))), ('side', Vector((-1, 0, 0)))):
    cam.location = centre + d * 5
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    right = (-d).cross(Vector((0, 0, 1)))
    for t, p, k in labels:
        t.rotation_euler = cam.rotation_euler
        off = 1 if (name == 'side' or not k.startswith('Right')) else -1
        t.location = p + right * (0.02 * off) + d * 0.3 + Vector((0, 0, -0.008))
        t.data.align_x = 'LEFT' if off > 0 else 'RIGHT'
        t.hide_render = name == 'side' and k.startswith('Left')  # side view: right-side labels only
    for dobj in dots:
        dobj.location = dobj.location  # unchanged
    scene.render.filepath = RENDER.replace('.png', f'_{name}.png')
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(scene.render.filepath)
    a = np.array(im.pixels[:], np.float32).reshape(1024, 1024, 4)
    mpp = cam.data.ortho_scale / 1024
    for vals, c0, along_cols in ((None, centre.z, False), (None, centre.dot(right), True)):
        for k in range(-40, 41):
            world = round(c0 / 0.05) * 0.05 + k * 0.05
            pos = int(round(512 + (world - c0) / mpp))
            if 0 <= pos < 1024:
                strength = 0.45 if abs(round(world / 0.05)) % 10 == 0 else 0.15
                sl = a[:, pos, :3] if along_cols else a[pos, :, :3]
                sl[:] = sl * (1 - strength) + 0.5 * strength
    imgs.append(a)
    os.remove(scene.render.filepath)
out = bpy.data.images.new('joints', 2048, 1024)
out.pixels[:] = np.concatenate(imgs, axis=1).ravel()
out.filepath_raw = RENDER
out.file_format = 'PNG'
out.save()
print('SAVED', OUT, RENDER)
