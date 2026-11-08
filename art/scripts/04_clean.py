# Step 4: clean the generated model and make the game-budget version.
#  1. Facing -Y already (checked in 03 renders). Feet on 0, height 1.65 m, transforms applied.
#  2. Merge vertices by distance; count loose parts.
#  3. Recalculate normals; report flipped faces, holes (boundary edges) and zero-area faces.
#  4. Decimate a copy to 25,000 triangles, UV-unwrap it, bake base colour + normal map from the full mesh.
# In:  art/character/model.glb (vertex colours, from 03c)
# Out: art/character/clean.blend (high + low objects, for rigging), art/character/skater_low.glb,
#      art/character/tex/skater_basecolor.png, skater_normal.png
# Run: blender.exe -b --python art/scripts/04_clean.py
import os

import bmesh
import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'character', 'model.glb')
OUT_DIR = os.path.join(ROOT, 'character')
TEX_DIR = os.path.join(OUT_DIR, 'tex')
HEIGHT = 1.65  # metres (5'5")
TRI_BUDGET = 25000
TEX_SIZE = 2048
os.makedirs(TEX_DIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
high = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
high.name = high.data.name = 'skater_high'
high.data.transform(high.matrix_world)
high.matrix_world.identity()

# --- 1. Scale to height, feet on 0, centred on X/Y.
co = np.empty(len(high.data.vertices) * 3, np.float32)
high.data.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
lo, hi = co.min(axis=0), co.max(axis=0)
s = HEIGHT / (hi[2] - lo[2])
co = (co - [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]) * s
high.data.vertices.foreach_set('co', co.ravel())
high.data.update()
print(f'1. scaled x{s:.4f} -> size {(hi - lo) * s} m (x = arm span, y = depth, z = height)')

# --- 2 + 3. Merge, normals, report.
bm = bmesh.new()
bm.from_mesh(high.data)
before = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
print(f'2. merged {before - len(bm.verts)} duplicate vertices ({len(bm.verts)} left)')
islands, seen = [], set()
for v in bm.verts:
    if v.index in seen:
        continue
    stack, size = [v], 0
    seen.add(v.index)
    while stack:
        cur = stack.pop()
        size += 1
        for e in cur.link_edges:
            o = e.other_vert(cur)
            if o.index not in seen:
                seen.add(o.index)
                stack.append(o)
    islands.append(size)
islands.sort(reverse=True)
print(f'   loose parts: {len(islands)} (sizes, largest first: {islands[:8]})')
# Drop tiny floating bits (under 1% of the main part) - generator crumbs.
if len(islands) > 1:
    bm.verts.ensure_lookup_table()
    keep_min = islands[0] * 0.01
    seen, kill = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        comp, stack = [v], [v]
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
                    comp.append(o)
        if len(comp) < keep_min:
            kill += comp
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        print(f'   removed {len(kill)} vertices of tiny floating bits')
old = [f.normal.copy() for f in bm.faces]
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
flipped = sum(1 for f, n in zip(bm.faces, old) if f.normal.dot(n) < 0)
holes = sum(1 for e in bm.edges if len(e.link_faces) == 1)
nonman = sum(1 for e in bm.edges if len(e.link_faces) > 2)
zero = [f for f in bm.faces if f.calc_area() < 1e-10]
if zero:
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
print(f'3. flipped faces fixed: {flipped}, hole edges: {holes}, edges shared by 3+ faces: {nonman}, zero-area faces: {len(zero)}')
bm.to_mesh(high.data)
bm.free()
for p in high.data.polygons:
    p.use_smooth = True
tris_high = sum(len(p.vertices) - 2 for p in high.data.polygons)

# Material on the high mesh that exposes the vertex colours to the bake.
col_name = high.data.color_attributes[0].name
mat_h = bpy.data.materials.new('high_vcol')
mat_h.use_nodes = True
nt = mat_h.node_tree
vc = nt.nodes.new('ShaderNodeVertexColor')
vc.layer_name = col_name
nt.links.new(vc.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
high.data.materials.clear()
high.data.materials.append(mat_h)

# --- 4. Low-poly copy.
low = high.copy()
low.data = high.data.copy()
low.name = low.data.name = 'skater_low'
bpy.context.scene.collection.objects.link(low)
dec = low.modifiers.new('decimate', 'DECIMATE')
dec.ratio = TRI_BUDGET / tris_high
bpy.context.view_layer.objects.active = low
for o in bpy.context.scene.objects:
    o.select_set(o == low)
bpy.ops.object.modifier_apply(modifier='decimate')
tris_low = sum(len(p.vertices) - 2 for p in low.data.polygons)
print(f'4. decimated {tris_high} -> {tris_low} triangles')
while low.data.color_attributes:
    low.data.color_attributes.remove(low.data.color_attributes[0])

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')

base = bpy.data.images.new('skater_basecolor', TEX_SIZE, TEX_SIZE)
normal = bpy.data.images.new('skater_normal', TEX_SIZE, TEX_SIZE, float_buffer=False)
normal.colorspace_settings.name = 'Non-Color'
mat_l = bpy.data.materials.new('skater')
mat_l.use_nodes = True
nt = mat_l.node_tree
bsdf = nt.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = 0.8
t_base = nt.nodes.new('ShaderNodeTexImage')
t_base.image = base
t_norm = nt.nodes.new('ShaderNodeTexImage')
t_norm.image = normal
nmap = nt.nodes.new('ShaderNodeNormalMap')
low.data.materials.clear()
low.data.materials.append(mat_l)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 4
bake = scene.render.bake
bake.use_selected_to_active = True
bake.cage_extrusion = 0.02
bake.max_ray_distance = 0.06
bake.margin = 8
for o in scene.objects:
    o.select_set(o in (high, low))
scene.view_layers[0].objects.active = low


def bake_into(node, kind, **kw):
    for n in nt.nodes:
        n.select = False
    node.select = True
    nt.nodes.active = node
    bpy.ops.object.bake(type=kind, **kw)


bake_into(t_base, 'DIFFUSE', pass_filter={'COLOR'})
print('   baked base colour')
bake_into(t_norm, 'NORMAL', normal_space='TANGENT')
print('   baked normal map')
for img in (base, normal):
    img.filepath_raw = os.path.join(TEX_DIR, img.name + '.png')
    img.file_format = 'PNG'
    img.save()

# Wire the baked maps into the low material for export / rendering.
nt.links.new(t_base.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(t_norm.outputs['Color'], nmap.inputs['Color'])
nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, 'clean.blend'))
for o in scene.objects:
    o.select_set(o == low)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, 'skater_low.glb'), export_format='GLB', use_selection=True)
print('SAVED clean.blend, skater_low.glb, tex/*.png')
