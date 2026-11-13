# Shared helpers for the Red Square Blender scripts (20_*.py ... 29_*.py).
# Convention (CLAUDE.md): metres, ground at z = 0, the face that looks at the plaza points to -Y in Blender
# (= +Z in the game after export). x runs along the facade, y is depth into the building (y = 0 is the wall line).
# Geometry is collected per material, so every GLB ends up with a handful of meshes (cheap to draw).
# Materials are only *named* here (M_brick, M_concrete, ...): the game swaps in its own shaders by name
# (src/display/redSquare/Glb.jsx), the base colours below are just for the preview renders.
# Objects named COL_* are physics boxes (not drawn); Glb.jsx turns them into Rapier cuboids.
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # art/
PROJECT = os.path.dirname(ROOT)
OUT = os.path.join(PROJECT, 'public', 'models', 'redsquare')
RENDERS = os.path.join(ROOT, 'renders')
LAYOUT = json.load(open(os.path.join(PROJECT, 'public', 'map', 'rs-facades.json')))
os.makedirs(OUT, exist_ok=True)
os.makedirs(RENDERS, exist_ok=True)

COLORS = {
    'M_aggregate': (0.48, 0.46, 0.43), 'M_brass': (0.69, 0.55, 0.24), 'M_glass_warm': (0.5, 0.35, 0.15),
    'M_brick': (0.50, 0.24, 0.16), 'M_brick_dark': (0.30, 0.13, 0.09), 'M_brick_tan': (0.52, 0.40, 0.26),
    'M_concrete': (0.42, 0.41, 0.38), 'M_stone': (0.62, 0.55, 0.51), 'M_granite': (0.45, 0.44, 0.42),
    'M_glass': (0.05, 0.06, 0.07), 'M_corten': (0.30, 0.13, 0.06), 'M_metal': (0.16, 0.16, 0.16),
    'M_slate': (0.38, 0.46, 0.45), 'M_roofmetal': (0.35, 0.40, 0.36), 'M_bronze': (0.22, 0.2, 0.12),
    'M_wood': (0.25, 0.15, 0.08), 'M_paverbrick': (0.45, 0.25, 0.2), 'M_tile': (0.62, 0.25, 0.15),
    'M_skylight': (0.55, 0.75, 0.78),
}


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def get_mat(name, tex=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    col = COLORS.get(name, (0.5, 0.5, 0.5))
    m.diffuse_color = (*col, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*col, 1)
    bsdf.inputs['Roughness'].default_value = 0.9
    if tex:
        img = bpy.data.images.load(tex)
        node = m.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = img
        m.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def pointed_arch(w, spring, rise, n=7):
    """Profile (x, z) of a two-centred pointed arch, base at z = 0: straight sides up to `spring`, apex at spring + rise."""
    hw = w / 2
    r = (hw * hw + rise * rise) / (2 * hw)  # radius of each arc
    cx = hw - r  # centre (x) of the right arc (on the left of the axis); the left arc is its mirror image
    a1 = math.acos(-cx / r)  # angle at which the right arc reaches the axis (the apex)
    right = [(cx + r * math.cos(a1 * i / n), spring + r * math.sin(a1 * i / n)) for i in range(n)]
    return [(-hw, 0.0), (hw, 0.0)] + right + [(0.0, spring + rise)] + [(-x, z) for x, z in reversed(right)]


class Builder:
    def __init__(self):
        self.bms = {}
        self.cols = []
        self.rails = []

    def bm(self, m):
        if m not in self.bms:
            self.bms[m] = bmesh.new()
        return self.bms[m]

    def box(self, m, x0, x1, y0, y1, z0, z1, rotz=0.0, uvm=False):
        """Axis-aligned box (optionally turned about Z around its own centre)."""
        bm = self.bm(m)
        r = bmesh.ops.create_cube(bm, size=1.0)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        c, s = math.cos(rotz), math.sin(rotz)
        for v in r['verts']:
            lx, ly = (v.co.x) * (x1 - x0), (v.co.y) * (y1 - y0)
            v.co = Vector((cx + lx * c - ly * s, cy + lx * s + ly * c, (v.co.z + 0.5) * (z1 - z0) + z0))

    def prism(self, m, prof, y0, y1):
        """Polygon given as (x, z) points, extruded along +Y from y0 to y1."""
        bm = self.bm(m)
        f = bm.faces.new([bm.verts.new((x, y0, z)) for x, z in prof])
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        bmesh.ops.translate(bm, vec=(0, y1 - y0, 0), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])

    def prism_x(self, m, prof, x0, x1):
        """Polygon given as (y, z) points, extruded along +X from x0 to x1 (fins, wedges, ramps)."""
        bm = self.bm(m)
        f = bm.faces.new([bm.verts.new((x0, y, z)) for y, z in prof])
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        bmesh.ops.translate(bm, vec=(x1 - x0, 0, 0), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])

    def slab(self, m, pts, z0, z1):
        """Polygon given as (x, y) points, extruded up from z0 to z1."""
        bm = self.bm(m)
        f = bm.faces.new([bm.verts.new((x, y, z0)) for x, y in pts])
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        bmesh.ops.translate(bm, vec=(0, 0, z1 - z0), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])

    def cyl(self, m, x, y, z0, z1, r0, r1=None, seg=12):
        bm = self.bm(m)
        r1 = r0 if r1 is None else r1
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=z1 - z0,
                              matrix=__import__('mathutils').Matrix.Translation((x, y, (z0 + z1) / 2)))

    def tube(self, m, a, b, r=0.025, seg=8):
        """Round bar from point a to point b (handrails)."""
        a, b = Vector(a), Vector(b)
        d = b - a
        bm = self.bm(m)
        from mathutils import Matrix
        mat = Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length, matrix=mat)

    def quad(self, m, p0, p1, p2, p3, uvs=((0, 0), (1, 0), (1, 1), (0, 1))):
        bm = self.bm(m)
        f = bm.faces.new([bm.verts.new(p) for p in (p0, p1, p2, p3)])
        uv = bm.loops.layers.uv.verify()
        for l, t in zip(f.loops, uvs):
            l[uv].uv = t

    def wall_openings(self, m, x0, x1, z0, z1, y0, y1, cols, glass='M_glass', glass_y=None, mullions=None):
        """A wall from x0..x1, z0..z1 (thickness y0..y1) with window openings, plus their glass.
        cols = [(cx, w, [(zb, zt, rise), ...]), ...]: openings stacked in columns; rise > 0 = pointed-arch head
        (zt is the apex). mullions = (material, n_vertical, transom_every_m) adds stone bars across each opening."""
        gy = y0 + 0.6 * (y1 - y0) if glass_y is None else glass_y
        x = x0
        for cx, w, ops in sorted(cols):
            l, r = cx - w / 2, cx + w / 2
            if l > x:
                self.box(m, x, l, y0, y1, z0, z1)
            z = z0
            for zb, zt, rise in sorted(ops):
                if zb > z:
                    self.box(m, l, r, y0, y1, z, zb)
                if rise > 0:
                    spring = zt - rise
                    arch = pointed_arch(w, 0, rise)
                    top = zt + 0.2
                    prof = [(cx + px, spring + pz) for px, pz in arch[2:]] + [(l, top), (r, top)]
                    self.prism(m, prof, y0, y1)
                    self.prism(glass, [(cx + px, zb + pz) for px, pz in pointed_arch(w, spring - zb, rise)], gy, gy + 0.04)
                    z = top
                else:
                    self.box(glass, l, r, gy, gy + 0.04, zb, zt)
                    z = zt
                self.box(m, l - 0.08, r + 0.08, y0 - 0.12, y0 + 0.05, zb - 0.14, zb)  # sill
                if mullions:
                    mm, nv, tr = mullions
                    top_z = zt - (rise * 0.8 if rise > 0 else 0)
                    for k in range(1, nv + 1):
                        mx = l + w * k / (nv + 1)
                        self.box(mm, mx - 0.06, mx + 0.06, gy - 0.1, gy + 0.02, zb, top_z)
                    if tr:
                        n = int((top_z - zb) / tr)
                        for k in range(1, n + 1):
                            tz = zb + (top_z - zb) * k / (n + 1)
                            self.box(mm, l, r, gy - 0.08, gy + 0.02, tz - 0.05, tz + 0.05)
            if z < z1:
                self.box(m, l, r, y0, y1, z, z1)
            x = r
        if x < x1:
            self.box(m, x, x1, y0, y1, z0, z1)

    def stairs(self, m, name, cx, w, y_top, z_top, risers, tread, taper=0.0, rails=()):
        """Straight stair set from the plaza (z 0) up to z_top, its top edge at y_top, climbing toward +y.
        taper widens each lower step by 2*taper (fanned steps). rails = x offsets of handrails from cx."""
        rise = z_top / risers
        for k in range(risers):
            ww = w + 2 * taper * (risers - 1 - k)
            yf = y_top - (risers - k) * tread
            self.box(m, cx - ww / 2, cx + ww / 2, yf, y_top, 0, (k + 1) * rise)
            self.collider(f'{name}_step{k}', cx - ww / 2, cx + ww / 2, yf, y_top, 0, (k + 1) * rise)
        y_bot = y_top - risers * tread
        for i, ox in enumerate(rails):
            x = cx + ox
            a = (x, y_bot - 0.3, 0.9)
            b = (x, y_top + 0.3, z_top + 0.9)
            self.tube('M_metal', a, b, 0.024)
            self.tube('M_metal', (x, y_bot - 0.3, 0), (x, y_bot - 0.3, 0.9), 0.022)
            self.tube('M_metal', (x, y_top + 0.3, z_top), (x, y_top + 0.3, z_top + 0.9), 0.022)
            ym = (y_bot + y_top) / 2
            self.tube('M_metal', (x, ym, z_top / 2), (x, ym, z_top / 2 + 0.9), 0.022)
            self.rail(f'{name}_rail{i}', a, b)
            # thin box so the board can land on / bump the rail
            import math as _m
            L = _m.hypot(b[1] - a[1], b[2] - a[2])
            self.col_center(f'{name}_railcol{i}', ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 - 0.02),
                            (0.05, L, 0.05), (_m.atan2(b[2] - a[2], b[1] - a[1]), 0, 0))

    def mesh(self, m, verts, faces):
        """Raw polygons: verts = [(x, y, z)], faces = [(i, j, k, ...)]."""
        bm = self.bm(m)
        vs = [bm.verts.new(v) for v in verts]
        for f in faces:
            bm.faces.new([vs[i] for i in f])

    def solid_down(self, m, top):
        """Closed solid from a top polygon of 3 or 4 points (x, y, z) straight down to z = 0 (banks, wedges)."""
        n = len(top)
        v = list(top) + [(x, y, 0.0) for x, y, _ in top]
        faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
        faces += [(i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n)]
        self.mesh(m, v, faces)

    def frustum(self, m, cx, cy, z0, z1, hx0, hy0, hx1, hy1, yaw=0.0):
        """Box whose bottom half-size (hx0, hy0) tapers to (hx1, hy1) at the top, turned by yaw (pyramids: hx1 = 0)."""
        c, s = math.cos(yaw), math.sin(yaw)
        R = lambda x, y: (cx + x * c - y * s, cy + x * s + y * c)
        v = [(*R(x * hx0, y * hy0), z0) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        v += [(*R(x * max(hx1, 1e-3), y * max(hy1, 1e-3)), z1) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        self.mesh(m, v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])

    def collider(self, name, x0, x1, y0, y1, z0, z1, rotz=0.0, rot=None):
        """Physics box. `rot` = (rx, ry, rz) tilts it about its centre (banks, sloped faces)."""
        self.cols.append((name, x0, x1, y0, y1, z0, z1, rot or (0, 0, rotz)))

    def col_center(self, name, c, size, rot=(0, 0, 0)):
        """Physics box by centre + full size + rotation."""
        self.cols.append((name, c[0] - size[0] / 2, c[0] + size[0] / 2, c[1] - size[1] / 2, c[1] + size[1] / 2,
                          c[2] - size[2] / 2, c[2] + size[2] / 2, rot))

    def rail(self, name, a, b):
        """Grind line (handrail / ledge edge / coping) from a to b: exported as a 2-point line RAIL_*."""
        self.rails.append((name, a, b))

    def finish(self, name):
        """Turn the collected geometry into objects (one per material) and the colliders into COL_* cubes."""
        coll = bpy.context.scene.collection
        made = []
        for m, bm in self.bms.items():
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            bmesh.ops.triangulate(bm, faces=bm.faces[:])
            mesh = bpy.data.meshes.new(f'{name}_{m}')
            bm.to_mesh(mesh)
            bm.free()
            if isinstance(m, str) and m.startswith('COLMESH_'):
                o = bpy.data.objects.new(m, mesh)  # shaped collider (the game makes a trimesh of it), not drawn
                coll.objects.link(o)
                made.append(o)
                continue
            mesh.materials.append(get_mat(m) if not isinstance(m, tuple) else get_mat(*m))
            o = bpy.data.objects.new(f'{name}_{m if isinstance(m, str) else m[0]}', mesh)
            coll.objects.link(o)
            made.append(o)
        # Colliders: a shared unit cube, sized and placed by the object transform (the game reads the node
        # transform: half extents = scale / 2, position, rotation about the vertical).
        unit = bpy.data.meshes.get('COL_unit')
        if unit is None and self.cols:
            ub = bmesh.new()
            bmesh.ops.create_cube(ub, size=1.0)
            unit = bpy.data.meshes.new('COL_unit')
            ub.to_mesh(unit)
            ub.free()
        for (n, x0, x1, y0, y1, z0, z1, rz) in self.cols:
            o = bpy.data.objects.new('COL_' + n, unit)
            o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
            o.rotation_euler = rz
            o.scale = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
            coll.objects.link(o)
            made.append(o)
        for (n, a, b) in self.rails:
            mesh = bpy.data.meshes.new('RAIL_' + n)
            mesh.from_pydata([a, b], [(0, 1)], [])
            o = bpy.data.objects.new('RAIL_' + n, mesh)
            coll.objects.link(o)
            made.append(o)
        self.bms = {}
        self.cols = []
        self.rails = []
        return made


def export(name):
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_yup=True,
                              export_apply=True, export_image_format='JPEG', export_jpeg_quality=88,
                              export_cameras=False, export_lights=False)
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith(('COL_', 'RAIL_', 'COLMESH_')))
    print(f'EXPORT {path}  ({os.path.getsize(path) // 1024} KB, ~{tris} tris)')


def preview(name, views, size=768):
    """Render quick workbench views. views = [(label, camera_location, look_at, lens_mm)]."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.image_settings.file_format = 'PNG'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_shadows = True
    sc.world = bpy.data.worlds.new('w')
    sc.world.color = (0.62, 0.68, 0.74)
    for o in bpy.data.objects:
        if o.name.startswith(('COL_', 'RAIL_', 'COLMESH_')):
            o.hide_render = True
    cam_d = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    for label, loc, look, lens in views:
        cam_d.lens = lens
        cam.location = Vector(loc)
        cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(RENDERS, f'{name}_{label}.png')
        bpy.ops.render.render(write_still=True)
        print('RENDER', sc.render.filepath)


def args():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def facade_size(key):
    f = LAYOUT[key]
    return math.hypot(f['b'][0] - f['a'][0], f['b'][1] - f['a'][1])
