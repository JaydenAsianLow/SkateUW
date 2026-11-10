# Restyle the Mixamo "Beta" body (from Running (1).fbx) to look like the player, and export it as the game skater.
# Skeleton, bone names and rest pose are untouched; only the skin mesh changes, plus hair / cap / chain / studs that
# are skinned 100% to one bone each. Colours are a dozen flat materials assigned per face (crisp borders).
#
# Run: blender -b --python art/scripts/13_me_body.py
# Out: public/models/skater/me.glb (body + skeleton, no animation), art/character/me.blend
import bpy, bmesh, math, os, random
from mathutils import Vector

SRC = os.path.abspath('art/character/Running (1).fbx')
OUT_GLB = os.path.abspath('public/models/skater/me.glb')
OUT_BLEND = os.path.abspath('art/character/me.blend')
TRI_BUDGET = 25000
random.seed(7)

def lin(c):  # sRGB 0..1 -> linear
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

SKIN = lin((0.93, 0.77, 0.66))
ORANGE = lin((0.94, 0.45, 0.12))
WHITE = lin((0.95, 0.95, 0.93))
DENIM = (0.22, 0.22, 0.24)  # sRGB, washed per vertex
BELT = lin((0.05, 0.05, 0.05))
SHOE = lin((0.94, 0.94, 0.94))
SHOE_GREY = lin((0.62, 0.63, 0.66))
BLONDE = lin((0.88, 0.74, 0.45))
PURPLE = lin((0.46, 0.26, 0.62))
NAVY = lin((0.09, 0.12, 0.26))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
scn = bpy.context.scene
arm = next(o for o in scn.objects if o.type == 'ARMATURE')
if arm.animation_data:
    arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
bpy.context.view_layer.update()

J = {b.name.replace('mixamorig:', ''): arm.matrix_world @ b.head_local for b in arm.data.bones}
print('JOINTS', {k: [round(c, 3) for c in J[k]] for k in ['Hips', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftLeg', 'LeftFoot']})
hipsZ, neckZ = J['Hips'].z, J['Neck'].z
shX, elX = J['LeftArm'].x, J['LeftForeArm'].x
kneeZ = J['LeftLeg'].z
ankleZ = J['LeftFoot'].z

# --- One body mesh, decimated to leave room for the extras.
meshes = [o for o in scn.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = 'Body'
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
dec = body.modifiers.new('dec', 'DECIMATE')
dec.ratio = 21000 / tris
bpy.ops.object.modifier_apply(modifier='dec')
# Keep the armature modifier first and only.
for m in body.modifiers:
    if m.type != 'ARMATURE':
        body.modifiers.remove(m)

me = body.data
mw = body.matrix_world
mwi = mw.inverted()
# Leg axis at height z (for flaring the pants): straight line knee -> ankle, hip -> knee.
def leg_axis(side, z):
    up, knee, foot = J[side + 'UpLeg'], J[side + 'Leg'], J[side + 'Foot']
    a, b = (knee, foot) if z < knee.z else (up, knee)
    t = (z - a.z) / ((b.z - a.z) or 1)
    return a.lerp(b, max(0, min(1, t)))

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

# --- Shape: wide legs below the knee, chunkier sneakers.
gidx = {g.index: g.name for g in body.vertex_groups}
HEM = ankleZ + 0.075
for v in me.vertices:
    w = mw @ v.co
    side = 'Left' if w.x > 0 else 'Right'
    weights = {gidx[g.group].replace('mixamorig:', ''): g.weight for g in v.groups}
    leg = sum(weights.get(side + n, 0) for n in ('UpLeg', 'Leg'))
    foot = sum(weights.get(side + n, 0) for n in ('Foot', 'ToeBase', 'Toe_End'))
    if leg > 0.3 and HEM - 0.02 < w.z < kneeZ + 0.12:
        ax = leg_axis(side, w.z)
        k = 1.15 + 1.5 * smooth((kneeZ + 0.12 - w.z) / (kneeZ + 0.12 - HEM))
        d = Vector((w.x - ax.x, w.y - ax.y, 0)) * (k - 1)
        v.co = mwi @ (w + d)
    elif foot > 0.5 and w.z < HEM:
        c = J[side + 'Foot']
        d = Vector((w.x - c.x, 0, 0)) * 0.3
        v.co = mwi @ (w + d + Vector((0, 0, 0.004)))

# --- Colours by body region (rest T-pose: Z up, front = -Y, character's left = +X). One material per colour, picked
# per face from its centre, so borders stay crisp (vertex colours smeared them across the reduced mesh).
PALETTE = {
    'skin': SKIN, 'orange': ORANGE, 'white': WHITE, 'denim': lin(DENIM), 'denim_wash': lin((0.3, 0.3, 0.32)),
    'fray': lin((0.48, 0.48, 0.48)), 'belt': BELT, 'shoe': SHOE, 'shoe_grey': SHOE_GREY, 'blonde': BLONDE,
    'purple': PURPLE, 'navy': NAVY, 'metal': None,
}
MATS = {}
for k, c in PALETTE.items():
    m = bpy.data.materials.new(k)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    if c is None:
        bsdf.inputs['Base Color'].default_value = (0.8, 0.8, 0.82, 1)
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = 0.3
    else:
        bsdf.inputs['Base Color'].default_value = (*c, 1)
        bsdf.inputs['Roughness'].default_value = 0.85 if k.startswith('denim') or k == 'fray' else 0.7
    MATS[k] = m
ORDER = list(MATS)

def region(w):
    ax = abs(w.x)
    if w.z < HEM:
        return 'shoe_grey' if (w.z < ankleZ - 0.06 or abs(w.z - (ankleZ - 0.025)) < 0.01) else 'shoe'
    if w.z < hipsZ - 0.03 and ax < 0.3:
        if w.z < HEM + 0.035:  # frayed hem: lighter threads around the cuff
            ang = math.atan2(w.y, w.x - (0.1 if w.x > 0 else -0.1))
            return 'fray' if (ang * 7 / math.pi) % 1 < 0.45 else 'denim'
        if w.y < -0.06 and kneeZ + 0.08 < w.z < hipsZ - 0.15:
            return 'denim_wash'  # washed, lighter thigh fronts
        return 'denim'
    if w.z < hipsZ + 0.05 and ax < 0.3:
        return 'belt'
    sleeve_end = shX + 0.6 * (elX - shX)
    if w.z < neckZ + 0.02 and ax < sleeve_end:
        if ax > sleeve_end - 0.025 and ax > shX + 0.05:
            return 'white'  # sleeve trim
        if w.z > neckZ - 0.04 and ax < 0.11:
            return 'white'  # collar
        if ax < 0.085:
            return 'white'  # wide centre panel, front and back
        return 'orange'
    return 'skin'

def paint(obj, fn):
    obj.data.materials.clear()
    for k in ORDER:
        obj.data.materials.append(MATS[k])
    m = obj.matrix_world
    for poly in obj.data.polygons:
        poly.material_index = ORDER.index(fn(m @ poly.center))

paint(body, region)

# --- Head size (vertices mostly on the Head bone).
head_pts = [mw @ v.co for v in me.vertices if any(gidx[g.group].endswith('Head') and g.weight > 0.6 for g in v.groups)]
lo = Vector(map(min, *head_pts)) if len(head_pts) > 1 else J['Head'] - Vector((0.1, 0.1, 0))
hi = Vector(map(max, *head_pts)) if len(head_pts) > 1 else J['Head'] + Vector((0.1, 0.1, 0.2))
hc = (lo + hi) / 2
hr = (hi - lo) / 2
print('HEAD', [round(x, 3) for x in hc], [round(x, 3) for x in hr])

def new_obj(name, bm, mat, bone):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    scn.collection.objects.link(o)
    paint(o, mat if callable(mat) else (lambda c: mat))
    g = o.vertex_groups.new(name='mixamorig:' + bone)
    g.add([v.index for v in mesh.vertices], 1.0, 'REPLACE')
    return o

# Mullet: a shell over the skull (open at the face), longer at the back to the shoulders; blonde on top, purple
# underneath and at the back.
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1)
for v in bm.verts:
    v.co = Vector((hc.x + v.co.x * hr.x * 1.12, hc.y + v.co.y * hr.y * 1.14, hc.z + v.co.z * hr.z * 1.06 + 0.01))
face = [v for v in bm.verts if v.co.y < hc.y - hr.y * 0.35 and v.co.z < hc.z + hr.z * 0.35]
low = [v for v in bm.verts if v.co.z < hc.z - hr.z * 0.55 and v not in face]
bmesh.ops.delete(bm, geom=face, context='VERTS')
# Back of the mullet: pull the lower back of the shell down to the shoulders.
for v in bm.verts:
    if v.co.y > hc.y and v.co.z < hc.z:
        t = (hc.z - v.co.z) / hr.z
        v.co.z -= 0.16 * t
        v.co.y += 0.02 * t
# Blonde on top, purple underneath (the lower layer and the tail of the mullet).
hair = new_obj('Hair', bm, lambda p: 'blonde' if p.z > hc.z - hr.z * 0.25 else 'purple', 'Head')

# Cap: crown on top of the hair, brim to the front (-Y).
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=1)
cut = [v for v in bm.verts if v.co.z < 0.22]
bmesh.ops.delete(bm, geom=cut, context='VERTS')
for v in bm.verts:
    v.co = Vector((hc.x + v.co.x * hr.x * 1.24, hc.y + v.co.y * hr.y * 1.2, hc.z + 0.012 + v.co.z * hr.z * 1.16))
band = hc.z + 0.012 + 0.22 * hr.z * 1.16  # the cap's lower edge, at the forehead
brim = bmesh.ops.create_circle(bm, cap_ends=True, segments=16, radius=1)
for v in brim['verts']:
    x, y = v.co.x, v.co.y
    if y > 0:  # half disc only toward the front
        y = 0
    v.co = Vector((hc.x + x * hr.x * 1.1, hc.y - hr.y * 1.05 + y * hr.y * 0.75, band - (-y) * 0.025))
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.008)
cap = new_obj('Cap', bm, 'navy', 'Head')

# Chain: thin torus round the base of the neck, dipping down the chest.
bm = bmesh.new()
bmesh.ops.create_circle(bm, segments=24, radius=1)
neck_pts = [mw @ v.co for v in me.vertices if abs((mw @ v.co).z - (neckZ - 0.02)) < 0.015 and abs((mw @ v.co).x) < 0.09 and abs((mw @ v.co).y - J['Neck'].y) < 0.12]
nr = max((Vector((p.x, p.y)) - Vector((J['Neck'].x, J['Neck'].y))).length for p in neck_pts) if neck_pts else 0.06
edges = bm.edges[:]
for v in bm.verts:
    v.co = Vector((J['Neck'].x + v.co.x * (nr + 0.012), J['Neck'].y + v.co.y * (nr + 0.015), neckZ - 0.03 - max(0, -v.co.y) * 0.05))
geom = bmesh.ops.extrude_edge_only(bm, edges=edges)
for v in [e for e in geom['geom'] if isinstance(e, bmesh.types.BMVert)]:
    v.co.z -= 0.004
chain = new_obj('Chain', bm, 'metal', 'Spine2')

# Studs round the belt.
bm = bmesh.new()
belt_pts = [mw @ v.co for v in me.vertices if abs((mw @ v.co).z - (hipsZ + 0.01)) < 0.015 and abs((mw @ v.co).x) < 0.3]
bx = max(abs(p.x - J['Hips'].x) for p in belt_pts) if belt_pts else 0.16
by = max(abs(p.y - J['Hips'].y) for p in belt_pts) if belt_pts else 0.11
for i in range(16):
    a = 2 * math.pi * i / 16
    r = bmesh.ops.create_cube(bm, size=0.014)
    for v in r['verts']:
        v.co += Vector((J['Hips'].x + math.cos(a) * (bx + 0.006), J['Hips'].y + math.sin(a) * (by + 0.006), hipsZ + 0.01))
studs = new_obj('Studs', bm, 'metal', 'Hips')

# Skin the extras to the armature, then join everything into one mesh.
for o in (hair, cap, chain, studs):
    o.parent = arm
    o.matrix_parent_inverse = arm.matrix_world.inverted()
    o.matrix_world = o.matrix_world  # extras were built in world space
    mod = o.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
bpy.ops.object.select_all(action='DESELECT')
for o in (body, hair, cap, chain, studs):
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print('TRIS', tris, 'budget', TRI_BUDGET)
assert tris <= TRI_BUDGET, 'over the triangle budget'
# Max 4 bones per vertex.
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
body.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_animations=False,
                          export_skins=True, export_yup=True)
print('EXPORTED', OUT_GLB)
