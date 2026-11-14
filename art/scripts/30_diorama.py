# Portfolio diorama: the whole Red Square level as one small, self-contained model on a square base
# (portfolio/red-square-3d/red-square.glb, shown by portfolio/red-square-3d/index.html).
# It reuses the game's pieces: the Blender facades and landmarks (public/models/redsquare/*.glb, placed the same way
# Glb.jsx places them), the OpenStreetMap building blocks and plaza outline (src/display/redSquare/osm.js), trees and
# lamps from layout.js. Colliders and grind lines are dropped; everything is cut to the square.
# Run after the 2x scripts: blender.exe -b --python art/scripts/30_diorama.py
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rs_lib import *
from mathutils import Matrix

DST = os.path.join(PROJECT, 'portfolio', 'red-square-3d')
os.makedirs(DST, exist_ok=True)

osm = open(os.path.join(PROJECT, 'src', 'display', 'redSquare', 'osm.js'), encoding='utf8').read()
grab = lambda name: json.loads(re.search(r'export const ' + name + r' = (.*?);\n', osm, re.S).group(1))
PLAZA, BUILDINGS = grab('PLAZA'), grab('BUILDINGS')
layout_js = open(os.path.join(PROJECT, 'src', 'display', 'redSquare', 'layout.js'), encoding='utf8').read()
lamps_src = re.search(r'export const LAMPS = \[(.*?)\];', layout_js, re.S).group(1)
LAMPS = [(float(a), float(b)) for a, b in re.findall(r'\[(-?[\d.]+), (-?[\d.]+)\]', lamps_src)]

# The square the diorama shows (game x, z), and its base
CX, CZ, HALF = 8.0, -6.0, 105.0
X0, X1, Z0, Z1 = CX - HALF, CX + HALF, CZ - HALF, CZ + HALF
BASE = 4.0

clear()


def P(x, z):
    return (x, -z)


def mat(name, rgb, rough=0.9):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m


def obj_from_bm(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def prism(bm, pts, z0, z1):
    if sum(pts[i - 1][0] * p[1] - p[0] * pts[i - 1][1] for i, p in enumerate(pts)) < 0:
        pts = pts[::-1]
    f = bm.faces.new([bm.verts.new((x, y, z0)) for x, y in pts])
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, 0, z1 - z0), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])


def clip_to_square(o, top=80):
    """Keep only the part of `o` inside the diorama square."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    cut = bpy.context.active_object
    cut.scale = (X1 - X0, Z1 - Z0, top + 10)
    cut.location = ((X0 + X1) / 2, -(Z0 + Z1) / 2, top / 2 - 1)
    mod = o.modifiers.new('clip', 'BOOLEAN')
    mod.operation = 'INTERSECT'
    mod.object = cut
    mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='clip')
    bpy.data.objects.remove(cut)


# --- Base: a dark plinth with the lawn on top, the brick plaza on the lawn
M_BASE = mat('D_base', (0.09, 0.075, 0.065), 0.7)
M_LAWN = mat('D_lawn', (0.30, 0.34, 0.17))
M_PLAZA = mat('M_paverbrick', (0.47, 0.20, 0.14))
bm = bmesh.new()
prism(bm, [P(X0, Z0), P(X1, Z0), P(X1, Z1), P(X0, Z1)], -BASE, -0.02)
obj_from_bm('base', bm, M_BASE)
bm = bmesh.new()
prism(bm, [P(X0 + 0.3, Z0 + 0.3), P(X1 - 0.3, Z0 + 0.3), P(X1 - 0.3, Z1 - 0.3), P(X0 + 0.3, Z1 - 0.3)], -0.02, 0.0)
obj_from_bm('lawn', bm, M_LAWN)


def offset(poly, d):
    """Mitred outward offset of a simple polygon (the brick reaches the building walls, as in the game's ground mask)."""
    area = sum(poly[i - 1][0] * p[1] - p[0] * poly[i - 1][1] for i, p in enumerate(poly))
    s = 1 if area > 0 else -1
    out = []
    n = len(poly)
    for i in range(n):
        a, b, c = poly[i - 1], poly[i], poly[(i + 1) % n]
        def nrm(p, q):
            dx, dz = q[0] - p[0], q[1] - p[1]
            l = math.hypot(dx, dz)
            return (s * dz / l, -s * dx / l)
        n1, n2 = nrm(a, b), nrm(b, c)
        mx, mz = n1[0] + n2[0], n1[1] + n2[1]
        ml = math.hypot(mx, mz) or 1
        mx, mz = mx / ml, mz / ml
        k = d / max(0.35, mx * n1[0] + mz * n1[1])
        out.append((b[0] + mx * k, b[1] + mz * k))
    return out


bm = bmesh.new()
prism(bm, [P(*q) for q in offset(PLAZA, 6.0)], -0.01, 0.005)
plaza = obj_from_bm('plaza', bm, M_PLAZA)
clip_to_square(plaza)

# --- OSM building blocks (the game extrudes the same footprints behind the modelled fronts)
FAC = LAYOUT
HEIGHT_KEY = {'Kane Hall': 'kane', 'Odegaard Undergraduate Library': 'odegaard', 'Meany Hall': 'meany',
              'Gerberding Hall': 'gerberding', 'Suzzallo Library': 'suzzallo'}
STONE = {'Suzzallo Library', 'Gerberding Hall'}
M_BLOCK = mat('D_brick_block', (0.42, 0.20, 0.13))
M_STONEB = mat('D_stone_block', (0.66, 0.58, 0.50))
M_BACK = mat('D_backdrop', (0.62, 0.55, 0.49))
M_ROOF = mat('D_roof', (0.24, 0.22, 0.21))
groups = {'brick': ([], M_BLOCK), 'stone': ([], M_STONEB), 'back': ([], M_BACK)}
for bl in BUILDINGS:
    xs = [p[0] for p in bl['pts']]
    zs = [p[1] for p in bl['pts']]
    if max(xs) < X0 or min(xs) > X1 or max(zs) < Z0 or min(zs) > Z1:
        continue
    key = HEIGHT_KEY.get(bl['name'])
    h = FAC[key]['height'] if key else bl['height']
    kind = 'stone' if bl['name'] in STONE else 'brick' if key else 'back'
    groups[kind][0].append(([P(*q) for q in bl['pts']], h))
for kind, (items, m) in groups.items():
    bm = bmesh.new()
    for pts, h in items:
        prism(bm, pts, 0.0, h)
    o = obj_from_bm('blocks_' + kind, bm, m)
    clip_to_square(o)

# --- The modelled pieces, placed like Glb.jsx facadePlacement / GlbPiece
pm = (sum(p[0] for p in PLAZA) / len(PLAZA), sum(p[1] for p in PLAZA) / len(PLAZA))


def place(name, x=0.0, z=0.0, rot=0.0):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.name.startswith(('COL_', 'COLMESH_', 'RAIL_')) or o.name.split('.')[0].endswith(('COL_unit',)) or \
                re.match(r'^(COL|COLMESH|RAIL)_', o.name) or (o.type == 'MESH' and not o.data.materials):
            bpy.data.objects.remove(o)
    roots = [o for o in bpy.data.objects if o not in before and o.parent is None]
    for o in roots:
        o.rotation_mode = 'XYZ'
        o.rotation_euler.z += rot
        o.location = (o.location.x * math.cos(rot) - o.location.y * math.sin(rot) + x,
                      o.location.x * math.sin(rot) + o.location.y * math.cos(rot) - z, o.location.z)


for key, f in FAC.items():
    a, b = f['a'], f['b']
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    ln = math.hypot(b[0] - a[0], b[1] - a[1])
    n = (-(b[1] - a[1]) / ln, (b[0] - a[0]) / ln)
    if n[0] * (pm[0] - mid[0]) + n[1] * (pm[1] - mid[1]) < 0:
        n = (-n[0], -n[1])
    place(key, mid[0], mid[1], math.atan2(n[0], n[1]))
place('landmarks')

# --- Trees (as in layout.js: plane trees along Gerberding, small ones in front of Meany) and lamps
M_TRUNK = mat('D_trunk', (0.17, 0.12, 0.09))
M_LEAF = mat('D_leaves', (0.62, 0.36, 0.12))
M_LAMP = mat('D_lamp', (0.10, 0.10, 0.10))
M_GLOBE = mat('D_globe', (1.0, 0.86, 0.6), 0.4)


def infront(key, t, out):
    a, b = FAC[key]['a'], FAC[key]['b']
    p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    ln = math.hypot(b[0] - a[0], b[1] - a[1])
    n = (-(b[1] - a[1]) / ln, (b[0] - a[0]) / ln)
    if n[0] * (5 - p[0]) + n[1] * (5 - p[1]) < 0:
        n = (-n[0], -n[1])
    return (p[0] + n[0] * out, p[1] + n[1] * out)


trees = [(infront('gerberding', t, 6.5), 1.0) for t in (0.12, 0.3, 0.68, 0.88)] + \
        [(infront('meany', t, 10), 0.5) for t in (0.18, 0.5, 0.82)]
tb, lb = bmesh.new(), bmesh.new()
for (x, z), s in trees:
    bmesh.ops.create_cone(tb, cap_ends=True, segments=8, radius1=0.35 * s, radius2=0.22 * s, depth=5 * s,
                          matrix=Matrix.Translation((x, -z, 2.5 * s)))
    for k, (dx, dz, dh, r) in enumerate(((0, 0, 8.5, 3.6), (1.6, 0.8, 7.2, 2.6), (-1.4, -1.0, 7.0, 2.8), (0.3, -1.5, 9.6, 2.3))):
        bmesh.ops.create_icosphere(lb, subdivisions=1, radius=r * s,
                                   matrix=Matrix.Translation((x + dx * s, -z - dz * s, dh * s)))
obj_from_bm('tree_trunks', tb, M_TRUNK)
obj_from_bm('tree_crowns', lb, M_LEAF)
pb, gb = bmesh.new(), bmesh.new()
for x, z in LAMPS:
    if X0 < x < X1 and Z0 < z < Z1:
        bmesh.ops.create_cone(pb, cap_ends=True, segments=8, radius1=0.09, radius2=0.06, depth=4.0,
                              matrix=Matrix.Translation((x, -z, 2.0)))
        bmesh.ops.create_icosphere(gb, subdivisions=2, radius=0.3, matrix=Matrix.Translation((x, -z, 4.2)))
obj_from_bm('lamp_posts', pb, M_LAMP)
obj_from_bm('lamp_globes', gb, M_GLOBE)

# --- Export one GLB (the viewer centres it on CX, CZ)
for o in bpy.data.objects:
    o.select_set(o.type == 'MESH')
path = os.path.join(DST, 'red-square.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_normals=True, export_texcoords=True)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('DIORAMA', path, f'{os.path.getsize(path) / 1e6:.1f} MB, ~{tris} tris, centre', (CX, CZ), 'half', HALF)
