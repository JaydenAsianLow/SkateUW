# Step 3c: colour the generated shape by projecting the orthographic views onto it.
# The views are flat (no perspective) and line up with the model, so each vertex takes its colour from
# the views that see it head-on and aren't blocked (an arm in the side view doesn't paint the torso).
# The left side has no view, so it uses the right view mirrored.
# In:  art/character/model_shape.glb, art/reference/{front,back,right}.png
# Out: art/character/model.glb (vertex colours; step 4 bakes them into a texture)
# Run: blender.exe -b --python art/scripts/03c_project_texture.py
import os

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference')
SRC = os.path.join(ROOT, 'character', 'model_shape.glb')
OUT = os.path.join(ROOT, 'character', 'model.glb')
EDGE_TRIM = 6  # px shaved off each view's silhouette edge (removes the light halo)
BG_TOL = 0.015  # max colour distance from the background grey that can still be background (flood fill from the edge)
SHARP = 10  # higher = each vertex sticks to the view facing it most squarely (fewer blurry blends)

# Model faces -Y, up +Z, its right side is -X (checked in renders/03_shape_check.png).
# For each view: direction from the model toward the camera, and which model axis runs to image-right.
VIEWS = [
    # name, image, toward camera, image-right axis (index, sign)
    ('front', 'front.png', Vector((0, -1, 0)), (0, +1)),
    ('back', 'back.png', Vector((0, 1, 0)), (0, -1)),
    ('right', 'right.png', Vector((-1, 0, 0)), (1, -1)),
    ('left', 'right.png', Vector((1, 0, 0)), (1, -1)),  # mirrored right view
]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
obj.data.transform(obj.matrix_world)  # bake the import transform so mesh coords are world coords
obj.matrix_world.identity()
mesh = obj.data
n = len(mesh.vertices)
co = np.empty(n * 3, np.float32)
mesh.vertices.foreach_get('co', co)
co = co.reshape(n, 3)
nor = np.empty(n * 3, np.float32)
mesh.vertex_normals.foreach_get('vector', nor)
nor = nor.reshape(n, 3)
lo, hi = co.min(axis=0), co.max(axis=0)
print(f'{n} vertices, size {hi - lo}')
bvh = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())


def load_view(fname):
    img = bpy.data.images.load(os.path.join(REF, fname))
    w, h = img.size
    px = np.array(img.pixels[:], np.float32).reshape(h, w, img.channels)[::-1, :, :3]
    border = np.concatenate([px[:10].reshape(-1, 3), px[-10:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    # Background = grey connected to the image edge (flood fill). A colour threshold alone isn't enough:
    # the white shirt is only ~0.02 away from the grey background, so it has to be enclosed to count.
    close = np.abs(px - bg).max(axis=2) < BG_TOL
    seen = np.zeros_like(close)
    seen[0, :] = close[0, :]; seen[-1, :] = close[-1, :]; seen[:, 0] = close[:, 0]; seen[:, -1] = close[:, -1]
    while True:
        grow = seen.copy()
        grow[1:] |= seen[:-1]; grow[:-1] |= seen[1:]; grow[:, 1:] |= seen[:, :-1]; grow[:, :-1] |= seen[:, 1:]
        grow &= close
        if (grow == seen).all():
            break
        seen = grow
    mask = ~seen
    # Trim the pale halo the image generator leaves around the character: shave EDGE_TRIM px off the
    # silhouette, so the dilation below refills the edge with colour from just inside it.
    core = mask.copy()
    for _ in range(EDGE_TRIM):
        e = core.copy()
        e[1:] &= core[:-1]; e[:-1] &= core[1:]; e[:, 1:] &= core[:, :-1]; e[:, :-1] &= core[:, 1:]
        core = e
    print(f'{fname}: character covers {mask.mean():.1%} of the image')
    ys, xs = np.where(mask)
    top, bot = ys.min(), ys.max()
    # Horizontal alignment band: hips to knees (below the hands, no arms), where model and image agree best.
    band = mask[int(top + 0.50 * (bot - top)):int(top + 0.75 * (bot - top))]
    bcols = np.where(band.any(axis=0))[0]
    # Push character colours outward over the background, so a slightly-off silhouette doesn't pick up grey.
    filled, known = px.copy(), core.copy()
    for _ in range(40):
        grow = np.zeros_like(known)
        acc = np.zeros_like(filled)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            k = np.roll(known, (dy, dx), axis=(0, 1))
            acc += np.roll(filled, (dy, dx), axis=(0, 1)) * k[..., None]
            cnt += k
        new = (~known) & (cnt > 0)
        filled[new] = acc[new] / cnt[new][:, None]
        known |= new
    return filled, mask, ((bcols.min() + bcols.max()) / 2, top, bot)


cache = {}
colours = np.zeros((n, 3), np.float32)
weights = np.zeros(n, np.float32)
fallback = np.zeros((n, 3), np.float32)
best = np.full(n, -2.0, np.float32)
for name, fname, d, (axis, sign) in VIEWS:
    if fname not in cache:
        cache[fname] = load_view(fname)
    img, mask, (xc, y0, y1) = cache[fname]
    h, w, _ = img.shape
    # Uniform scale from height; centre on the hips-to-knees band in both the model and the image.
    s = (y1 - y0) / (hi[2] - lo[2])
    zb = (co[:, 2] < hi[2] - 0.50 * (hi[2] - lo[2])) & (co[:, 2] > hi[2] - 0.75 * (hi[2] - lo[2]))
    hc_model = (co[zb, axis].min() + co[zb, axis].max()) / 2
    u = xc + (co[:, axis] - hc_model) * sign * s
    v = y1 - (co[:, 2] - lo[2]) * s
    ui = np.clip(np.round(u).astype(int), 0, w - 1)
    vi = np.clip(np.round(v).astype(int), 0, h - 1)
    sample = img[vi, ui]
    facing = nor @ np.array(d, np.float32)

    # Visibility: cast a ray from each vertex toward the camera; anything hit means it's hidden in this view.
    vis = np.zeros(n, bool)
    dv = Vector(d)
    for i in np.where(facing > 0.02)[0]:
        p = Vector(co[i]) + dv * 0.003
        vis[i] = bvh.ray_cast(p, dv)[0] is None
    wv = np.where(vis, np.clip(facing, 0, 1) ** SHARP, 0)
    colours += sample * wv[:, None]
    weights += wv
    better = facing > best  # for vertices no view sees (armpits, crotch): the view they face most
    fallback[better] = sample[better]
    best[better] = facing[better]
    miss = (~mask[vi, ui] & vis).sum() / max(1, vis.sum())
    print(f'{name}: {vis.sum()} vertices visible, {miss:.1%} of them land off the character in the image')

hidden = weights < 1e-4
print(f'{hidden.sum()} vertices seen by no view (use the nearest-facing view)')
colours[~hidden] /= weights[~hidden][:, None]
colours[hidden] = fallback[hidden]

attr = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
rgba = np.concatenate([colours, np.ones((n, 1), np.float32)], axis=1)
attr.data.foreach_set('color_srgb', rgba.ravel())
mesh.color_attributes.active_color = attr

# Material that shows the vertex colours (and makes the glTF exporter write them).
mat = bpy.data.materials.new('skater')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
col = mat.node_tree.nodes.new('ShaderNodeVertexColor')
col.layer_name = 'Col'
mat.node_tree.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.8
mesh.materials.clear()
mesh.materials.append(mat)

bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
try:
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_vertex_color='MATERIAL')
except TypeError:
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_colors=True)
print('SAVED', OUT)
