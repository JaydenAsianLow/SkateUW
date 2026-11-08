# Step 8: pose test. Put the rig in skate poses, measure how much the mesh stretches against the rest pose
# (longest edge ratio + worst vertices with their main bone) and render front + side of each pose.
# In: art/character/rig.blend   Out: art/renders/08_pose_<name>.png
# Run: blender.exe -b --python art/scripts/08_pose_test.py
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'character', 'rig.blend'))
arm = bpy.data.objects['Armature']
obj = bpy.data.objects['skater']
scene = bpy.context.scene
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# Each pose: list of (bone, world axis, degrees), applied parent-first. Character faces -Y, left is +X.
POSES = {
    'stance': [  # skate stance: hips down, knees bent forward, lean forward, arms out 60°, head turned 60°
        ('Hips', X, 0), ('Spine', X, -12), ('Spine2', X, -6), ('Head', Z, 60),
        ('LeftUpLeg', X, -55), ('LeftLeg', X, 85), ('LeftFoot', X, -30),
        ('RightUpLeg', X, -55), ('RightLeg', X, 85), ('RightFoot', X, -30),
        ('LeftArm', Y, -15), ('RightArm', Y, 15), ('LeftForeArm', X, -20), ('RightForeArm', X, -20),
    ],
    'ollie_tuck': [  # deep crouch: thighs up high, arms out wide
        ('Spine', X, -20), ('LeftUpLeg', X, -95), ('LeftLeg', X, 120), ('RightUpLeg', X, -95), ('RightLeg', X, 120),
        ('LeftArm', Y, -40), ('RightArm', Y, 40),
    ],
    'lean_push': [  # lean 20° left, one leg swung back (push), torso twisted
        ('Spine', Y, 20), ('Spine1', Z, -25), ('RightUpLeg', X, 35), ('RightLeg', X, 40), ('LeftUpLeg', X, -30),
        ('LeftLeg', X, 45), ('LeftArm', X, -35), ('RightArm', X, 35),
    ],
}


def edge_lengths(m):
    co = np.empty(len(m.vertices) * 3, np.float32)
    m.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    e = np.empty(len(m.edges) * 2, np.int32)
    m.edges.foreach_get('vertices', e)
    e = e.reshape(-1, 2)
    return np.linalg.norm(co[e[:, 0]] - co[e[:, 1]], axis=1), e


rest_len, edges = edge_lengths(obj.data)
rest_co = np.array([v.co[:] for v in obj.data.vertices])
groups = {g.index: g.name for g in obj.vertex_groups}
main_bone = [groups[max(v.groups, key=lambda g: g.weight).group] for v in obj.data.vertices]

for o in scene.objects:
    o.hide_render = o is arm
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x, scene.render.resolution_y = 1024, 768
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.4

for pose_name, steps in POSES.items():
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for bone, axis, deg in steps:
        pb = arm.pose.bones[bone]
        head = pb.head.copy()
        R = Matrix.Translation(head) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-head)
        pb.matrix = R @ pb.matrix
        bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg).to_mesh()
    ln, _ = edge_lengths(ev)
    ratio = ln / np.maximum(rest_len, 1e-6)
    worst = np.argsort(-ratio)[:10]
    print(f'POSE {pose_name}: longest stretch x{ratio.max():.2f}, edges stretched >1.5x: {(ratio > 1.5).sum()} '
          f'of {len(ratio)}, >2x: {(ratio > 2).sum()}')
    print('   worst:', ', '.join(f'{main_bone[edges[i][0]]} x{ratio[i]:.1f} @z{rest_co[edges[i][0]][2]:.2f}' for i in worst))
    for b in sorted({main_bone[edges[i][0]] for i in np.where(ratio > 2)[0]}):
        n = sum(1 for i in np.where(ratio > 2)[0] if main_bone[edges[i][0]] == b)
        if n > 20:
            print(f'   >2x on {b}: {n} edges')
    obj.evaluated_get(dg).to_mesh_clear()
    strips = []
    for d in (Vector((0, -1, 0)), Vector((-1, 0, 0))):
        cam.location = Vector((0, 0, 0.85)) + d * 5
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(ROOT, 'renders', '_tmp.png')
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(scene.render.filepath)
        strips.append(np.array(im.pixels[:], np.float32).reshape(768, 1024, 4))
        bpy.data.images.remove(im)
    out = bpy.data.images.new(pose_name, 2048, 768)
    out.pixels[:] = np.concatenate(strips, axis=1).ravel()
    out.filepath_raw = os.path.join(ROOT, 'renders', f'08_pose_{pose_name}.png')
    out.file_format = 'PNG'
    out.save()
os.remove(os.path.join(ROOT, 'renders', '_tmp.png'))
print('DONE')
