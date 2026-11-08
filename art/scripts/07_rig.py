# Step 7: build the Mixamo-named armature on joints.json and set skin weights by rules (not automatic
# weights: rules per tagged part are exact and can't fail on a generated mesh).
#   head / hair / cap : spine field near the neck, 100% Head above the jaw
#   torso (shirt)     : spine field by height (Hips..Neck), blended into the clavicle (Shoulder) near the
#                       shoulder line, so the shirt seam meets the sleeve on a shared bone. 0 on arm bones.
#   arm               : Shoulder -> Arm -> ForeArm -> Hand along the arm, blended only at shoulder/elbow/wrist
#   hand              : 100% Hand
#   hips (jeans top)  : Hips, handing over to each UpLeg below the hip sockets (crotch seam meets the legs)
#   leg (jeans)       : UpLeg -> Leg at the knee, Leg + some Foot at the hem
#   shoe              : Foot -> ToeBase
# Max 4 bones per vertex (in practice 3), normalized.
# In:  art/character/parts.blend, art/character/joints.json   Out: art/character/rig.blend
# Run: blender.exe -b --python art/scripts/07_rig.py
import json
import os

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'character', 'parts.blend')
OUT = os.path.join(ROOT, 'character', 'rig.blend')
J = {k: Vector(v) for k, v in json.load(open(os.path.join(ROOT, 'character', 'joints.json')))['joints'].items()}
PARTS = ['head', 'hair', 'cap', 'torso', 'hips', 'arm_L', 'arm_R', 'hand_L', 'hand_R', 'leg_L', 'leg_R', 'shoe_L', 'shoe_R']

# bone: (head joint, tail joint, parent)
BONES = {
    'Hips': ('Hips', 'Spine', None),
    'Spine': ('Spine', 'Spine1', 'Hips'),
    'Spine1': ('Spine1', 'Spine2', 'Spine'),
    'Spine2': ('Spine2', 'Neck', 'Spine1'),
    'Neck': ('Neck', 'Head', 'Spine2'),
    'Head': ('Head', 'HeadTop_End', 'Neck'),
}
for side in ('Left', 'Right'):
    BONES.update({
        side + 'Shoulder': (side + 'Shoulder', side + 'Arm', 'Spine2'),
        side + 'Arm': (side + 'Arm', side + 'ForeArm', side + 'Shoulder'),
        side + 'ForeArm': (side + 'ForeArm', side + 'Hand', side + 'Arm'),
        side + 'Hand': (side + 'Hand', side + 'HandEnd', side + 'ForeArm'),
        side + 'UpLeg': (side + 'UpLeg', side + 'Leg', 'Hips'),
        side + 'Leg': (side + 'Leg', side + 'Foot', side + 'UpLeg'),
        side + 'Foot': (side + 'Foot', side + 'ToeBase', side + 'Leg'),
        side + 'ToeBase': (side + 'ToeBase', side + 'Toe_End', side + 'Foot'),
    })

bpy.ops.wm.open_mainfile(filepath=SRC)
for o in list(bpy.data.objects):
    if o.name != 'skater_low':
        bpy.data.objects.remove(o)
obj = bpy.data.objects['skater_low']
obj.name = 'skater'
mesh = obj.data

# --- Armature.
arm_data = bpy.data.armatures.new('Armature')
arm = bpy.data.objects.new('Armature', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name, (h, t, _) in BONES.items():
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = J[h], J[t]
    b.roll = 0
for name, (_, _, parent) in BONES.items():
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
print(f'armature: {len(BONES)} bones')

# --- Per-vertex part (majority of the faces around it) and position.
nv = len(mesh.vertices)
co = np.empty(nv * 3, np.float32)
mesh.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
fpart = np.empty(len(mesh.polygons), np.int32)
mesh.attributes['part'].data.foreach_get('value', fpart)
votes = np.zeros((nv, len(PARTS)), np.int32)
for p in mesh.polygons:
    for v in p.vertices:
        votes[v, fpart[p.index]] += 1
vpart = [PARTS[i] for i in votes.argmax(axis=1)]


def interp(controls, s):
    """Piecewise-linear blend over [(position, {bone: weight}), ...] sorted by position."""
    if s <= controls[0][0]:
        return dict(controls[0][1])
    if s >= controls[-1][0]:
        return dict(controls[-1][1])
    for (p0, w0), (p1, w1) in zip(controls, controls[1:]):
        if p0 <= s <= p1:
            a = (s - p0) / (p1 - p0)
            out = {}
            for k, v in w0.items():
                out[k] = out.get(k, 0) + v * (1 - a)
            for k, v in w1.items():
                out[k] = out.get(k, 0) + v * a
            return out


def mix(a, b, t):
    out = {k: v * (1 - t) for k, v in a.items()}
    for k, v in b.items():
        out[k] = out.get(k, 0) + v * t
    return out


smooth = lambda t: (lambda c: c * c * (3 - 2 * c))(min(1.0, max(0.0, t)))

mid = lambda a, b: (J[a].z + J[b].z) / 2
SPINE = [(mid('Hips', 'Spine'), {'Hips': 1}), (mid('Spine', 'Spine1'), {'Spine': 1}),
         (mid('Spine1', 'Spine2'), {'Spine1': 1}), (mid('Spine2', 'Neck'), {'Spine2': 1}),
         (J['Neck'].z - 0.01, {'Neck': 1}), (J['Head'].z - 0.05, {'Head': 1})]  # chin up = 100% Head

ARM = {}
for side in ('Left', 'Right'):
    S = J[side + 'Arm']
    axis = (J[side + 'HandEnd'] - S).normalized()
    t_elbow = (J[side + 'ForeArm'] - S).dot(axis)
    t_wrist = (J[side + 'Hand'] - S).dot(axis)
    ARM[side] = (S, axis, [(0.0, {side + 'Shoulder': 1}), (0.09, {side + 'Arm': 1}),
                           (t_elbow - 0.06, {side + 'Arm': 1}), (t_elbow + 0.06, {side + 'ForeArm': 1}),
                           (t_wrist - 0.03, {side + 'ForeArm': 1}), (t_wrist + 0.01, {side + 'Hand': 1})])
# The hem's lowest ring touches the shoe, so it follows the foot; the jeans above it follow the shin.
LEG_Z = lambda side: [(0.02, {side + 'Leg': 0.25, side + 'Foot': 0.75}), (0.10, {side + 'Leg': 1}),
                      (J[side + 'Leg'].z - 0.09, {side + 'Leg': 1}), (J[side + 'Leg'].z + 0.10, {side + 'UpLeg': 1})]
SIDE = {'L': 'Left', 'R': 'Right'}

weights = []
for i in range(nv):
    x, y, z = co[i]
    p = vpart[i]
    if p in ('head', 'hair', 'cap'):
        w = interp(SPINE, z)
    elif p == 'torso':
        w = interp(SPINE, z)
        side = 'Left' if x > 0 else 'Right'
        s = smooth((abs(x) - 0.10) / 0.07) * smooth((z - 1.02) / 0.10)  # reaches down to the armpit
        w = mix(w, {side + 'Shoulder': 1}, s)
    elif p.startswith('arm_'):
        S, axis, ctrl = ARM[SIDE[p[-1]]]
        w = interp(ctrl, (Vector((x, y, z)) - S).dot(axis))
        # Armpit: where the arm meets the torso, share the clavicle with the shirt, then hand over to the arm.
        if z > 1.08:
            w = mix(w, {SIDE[p[-1]] + 'Shoulder': 1}, 1 - smooth((abs(x) - 0.185) / 0.07))
    elif p.startswith('hand_'):
        w = {SIDE[p[-1]] + 'Hand': 1}
    elif p == 'hips':
        w = interp(SPINE, z)
        leg = smooth((J['LeftUpLeg'].z + 0.03 - z) / 0.24)
        left = min(1.0, max(0.0, 0.5 + x / 0.16))
        w = mix(w, {'LeftUpLeg': left, 'RightUpLeg': 1 - left}, leg)
    elif p.startswith('leg_'):
        w = interp(LEG_Z(SIDE[p[-1]]), z)
    else:  # shoe
        side = SIDE[p[-1]]
        ty = J[side + 'ToeBase'].y
        w = interp([(ty - 0.03, {side + 'ToeBase': 1}), (ty + 0.03, {side + 'Foot': 1})], y)
    w = dict(sorted(((k, v) for k, v in w.items() if v > 0.01), key=lambda kv: -kv[1])[:4])
    tot = sum(w.values())
    weights.append({k: v / tot for k, v in w.items()})

groups = {name: obj.vertex_groups.new(name=name) for name in BONES}
for i, w in enumerate(weights):
    for k, v in w.items():
        groups[k].add([i], v, 'REPLACE')
used = {k for w in weights for k in w}
print(f'weights: {nv} vertices, bones used: {len(used)}/{len(BONES)}, max bones per vertex: {max(len(w) for w in weights)}')
for side in ('Left', 'Right'):
    arm_bones = [side + b for b in ('Arm', 'ForeArm', 'Hand')]
    bad = sum(1 for i, w in enumerate(weights) if vpart[i] == 'torso' and any(b in w for b in arm_bones))
    print(f'  torso vertices on {side} arm bones: {bad} (must be 0)')

mod = obj.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
obj.parent = arm
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('SAVED', OUT)
