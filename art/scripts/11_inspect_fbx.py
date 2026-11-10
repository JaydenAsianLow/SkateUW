# Inspect Mixamo FBX files: meshes, bones, actions (name, frames, fps), hips root motion, rest pose.
# Run: blender -b --python art/scripts/11_inspect_fbx.py -- "art/character/Running (1).fbx" art/character/Skateboarding.fbx
import bpy, sys, json
from mathutils import Vector

files = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
report = {}
for path in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    scn = bpy.context.scene
    arms = [o for o in scn.objects if o.type == 'ARMATURE']
    meshes = [o for o in scn.objects if o.type == 'MESH']
    r = {'meshes': [], 'armatures': [], 'actions': []}
    for m in meshes:
        r['meshes'].append({
            'name': m.name, 'verts': len(m.data.vertices), 'tris': sum(len(p.vertices) - 2 for p in m.data.polygons),
            'materials': [s.material.name if s.material else None for s in m.material_slots],
            'groups': len(m.vertex_groups), 'parent': m.parent.name if m.parent else None,
            'images': sorted({n.image.name for s in m.material_slots if s.material and s.material.use_nodes
                              for n in s.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}),
        })
    for a in arms:
        bones = [b.name for b in a.data.bones]
        rest = {b.name: [round(v, 4) for v in (a.matrix_world @ b.head_local)] for b in a.data.bones}
        r['armatures'].append({'name': a.name, 'bones': len(bones), 'first': bones[:8], 'scale': list(a.scale),
                               'rest': rest})
    fps = scn.render.fps / scn.render.fps_base
    for act in bpy.data.actions:
        f0, f1 = act.frame_range
        info = {'name': act.name, 'frames': [f0, f1], 'fps': fps, 'seconds': round((f1 - f0) / fps, 3)}
        # Hips root motion: world position of the Hips at the first and last frame.
        if arms:
            a = arms[0]
            hips = next((b for b in a.pose.bones if b.name.endswith('Hips')), None)
            if hips:
                a.animation_data.action = act
                pos = []
                for f in (int(f0), int(f1)):
                    scn.frame_set(f)
                    pos.append([round(v, 3) for v in (a.matrix_world @ hips.head)])
                info['hips_first_last'] = pos
                info['hips_travel'] = round((Vector(pos[1]) - Vector(pos[0])).length, 3)
        r['actions'].append(info)
    report[path] = r

# Same character? Compare bone sets and rest joint positions.
paths = list(report)
if len(paths) == 2:
    a, b = (report[p]['armatures'][0] for p in paths)
    common = set(a['rest']) & set(b['rest'])
    diff = max((Vector(a['rest'][n]) - Vector(b['rest'][n])).length for n in common) if common else None
    ma, mb = (report[p]['meshes'] for p in paths)
    report['compare'] = {
        'same_bone_names': set(a['rest']) == set(b['rest']),
        'max_rest_joint_diff_m': round(diff, 4) if diff is not None else None,
        'same_mesh_counts': [(m['verts'], m['tris']) for m in ma] == [(m['verts'], m['tris']) for m in mb],
    }
for p in report:
    if p != 'compare':
        for arm in report[p]['armatures']:
            arm['rest'] = {k: v for k, v in arm['rest'].items() if k.endswith(('Hips', 'Head', 'LeftFoot', 'LeftHand', 'LeftArm', 'LeftForeArm'))}
print('REPORT ' + json.dumps(report))
