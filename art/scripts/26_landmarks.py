# Red Square landmarks, built in world coordinates (game x, z -> Blender x, -y):
#  - the three brick monoliths (garage vents) with their banners (photos IMG_4708, 4709, 4714, 4722, 4724)
#  - the raised walking level by Kane with its sloped granite bank, Broken Obelisk standing on it (photo 4709, videos)
#  - the exposed-aggregate planter slabs with brick tops round the brass drain, in front of Meany (4711, 4713, webcam)
# Everything here is skateable: the granite edge of the raised level is a long bank, the slabs are ledges.
# The real slabs have metal skate stoppers; they are left off on purpose.
# Run: python art/scripts/19_banners.py, then blender.exe -b --python art/scripts/26_landmarks.py
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rs_lib import *

clear()
b = Builder()
TEX = os.path.join(ROOT, 'textures')
L = json.load(open(os.path.join(PROJECT, 'public', 'map', 'rs-landmarks.json')))


def P(x, z):  # game (x, z) -> Blender (x, y)
    return (x, -z)


# --- Monoliths: OSM footprints, brick to the top, aggregate base course, louvred vents near the top
MH = L['monolithHeight']
for i, pts in enumerate(L['monoliths']):
    poly = [P(*p) for p in pts]
    b.slab('M_brick', poly, 0.0, MH)
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    b.box('M_aggregate', min(xs) - 0.12, max(xs) + 0.12, min(ys) - 0.12, max(ys) + 0.12, 0.0, 0.35)
    b.box('M_concrete', min(xs) - 0.05, max(xs) + 0.05, min(ys) - 0.05, max(ys) + 0.05, MH, MH + 0.25)
    for k in range(5):
        z = MH - 2.4 + k * 0.38
        b.box('M_metal', min(xs) + 0.5, max(xs) - 0.5, min(ys) - 0.04, max(ys) + 0.04, z, z + 0.12)
    b.collider(f'monolith{i}', min(xs), max(xs), min(ys), max(ys), 0.0, MH)

# Banners (cut from IMG_4722): on the plaza (east) faces of two towers
for key, tex in (('huskies', 'banner_huskies.jpg'), ('uw', 'banner_uw.jpg')):
    bn = L['banners'][key]
    x, z0, z1 = bn['x'] + 0.04, bn['z'][0], bn['z'][1]   # z0 = south edge (viewer's left), z1 = north edge
    h0, h1 = bn['y']
    m = ('M_banner_' + key, os.path.join(TEX, tex))
    b.quad(m, (x, -z0, h0), (x, -z1, h0), (x, -z1, h1), (x, -z0, h1))
    b.box('M_metal', x - 0.02, x + 0.02, -z0 + 0.05, -z1 - 0.05, h1, h1 + 0.06)  # top batten

# --- Raised levels at the top of Kane's staircase (one height, rs-landmarks.json "levels"):
#  north: the big space in front of Odegaard joining Kane's walking space, stairs down past the monoliths;
#  kane_east: east of Kane's stairs, where Broken Obelisk stands: a granite bank to the plaza on the south-west and
#  a small hill (ramp) on the east side up to it (photos 4709, aerial, tour photo, videos).
LV = L['levels']
H, RUN, CURB, RAMP = LV['height'], LV['bankRun'], LV['curb'], LV['rampRun']
SR, ST = LV['stairRisers'], LV['stairTread']


def inside(pt, pg):
    c = False
    for i in range(len(pg)):
        (x1, z1), (x2, z2) = pg[i], pg[i - 1]
        if (z1 > pt[1]) != (z2 > pt[1]) and pt[0] < (x2 - x1) * (pt[1] - z1) / (z2 - z1) + x1:
            c = not c
    return c


def out_normal(p, q, pg):
    dx, dz = q[0] - p[0], q[1] - p[1]
    ln = math.hypot(dx, dz)
    n = (dz / ln, -dx / ln)
    mid = ((p[0] + q[0]) / 2 + n[0] * 0.2, (p[1] + q[1]) / 2 + n[1] * 0.2)
    return (-n[0], -n[1]) if inside(mid, pg) else n


def V(pt, h):
    return (*P(*pt), h)


def off(pt, n, d):
    return (pt[0] + n[0] * d, pt[1] + n[1] * d)


for lv in LV['list']:
    poly, kinds = lv['polygon'], {int(k): v for k, v in lv['edges'].items()}
    nm = lv['name']
    b.slab('M_paverbrick', [P(*p) for p in poly], 0.0, H)
    b.mesh('COLMESH_' + nm, [V(p, H) for p in poly], [tuple(range(len(poly)))])
    toes = {}
    for i, kind in sorted(kinds.items()):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        n = out_normal(p, q, poly)
        if kind == 'bank':
            run, low = RUN, CURB
            tp, tq = off(p, n, run), off(q, n, run)
            top = [V(p, H), V(q, H), V(tq, low), V(tp, low)]
            b.solid_down('M_aggregate', top)
            b.mesh('COLMESH_' + nm, top, [(0, 1, 2, 3)])
            b.rail(f'{nm}_{kind}{i}_top', V(p, H), V(q, H))
            if True:  # aggregate curb at the toe (photo 4709)
                cp, cq = off(tp, n, 0.06), off(tq, n, 0.06)
                b.solid_down('M_aggregate', [V(tp, CURB), V(tq, CURB), V(cq, 0.01), V(cp, 0.01)])
                b.mesh('COLMESH_' + nm, [V(tp, CURB), V(tq, CURB), V(cq, 0.0), V(cp, 0.0)], [(0, 1, 2, 3)])
                b.rail(f'{nm}_bank{i}_curb', V(tp, CURB), V(tq, CURB))
                seg = math.hypot(tq[0] - tp[0], tq[1] - tp[1])
                for j in range(1, int(seg / 1.6)):  # joints between the precast curb segments (photo)
                    f = j * 1.6 / seg
                    jp = (tp[0] + (tq[0] - tp[0]) * f, tp[1] + (tq[1] - tp[1]) * f)
                    jo = off(jp, n, 0.07)
                    b.mesh('M_metal', [V(jp, CURB + 0.003), V(jo, 0.003), V(off(jo, (n[1], -n[0]), 0.025), 0.003),
                                       V(off(jp, (n[1], -n[0]), 0.025), CURB + 0.003)], [(0, 1, 2, 3)])
            toes[i] = (n, run, low)
        elif kind == 'stairs':
            rise = H / SR
            for k in range(SR - 1):  # bands outward from the top edge, one riser lower each
                h = H - (k + 1) * rise
                o0, o1 = k * ST, (k + 1) * ST
                band = [V(off(p, n, o0), h), V(off(q, n, o0), h), V(off(q, n, o1), h), V(off(p, n, o1), h)]
                b.solid_down('M_concrete', band)
                mid = off(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2), n, (o0 + o1) / 2)
                ln = math.hypot(q[0] - p[0], q[1] - p[1])
                b.col_center(f'{nm}_stair{i}_{k}', (*P(*mid), h / 2), (ln, ST, h), (0, 0, math.atan2(-(q[1] - p[1]), q[0] - p[0])))
            b.rail(f'{nm}_stairs{i}_top', V(p, H), V(q, H))
    # fill the wedge at each corner between two neighbouring sloped edges
    for i in toes:
        j = (i + 1) % len(poly)
        if j not in toes:
            continue
        v = poly[j]
        (n1, r1, l1), (n2, r2, l2) = toes[i], toes[j]
        a_, b_ = off(v, n1, r1), off(v, n2, r2)
        mat = 'M_aggregate' if l1 > 0 and l2 > 0 else 'M_paverbrick'
        b.solid_down(mat, [V(v, H), V(a_, l1), V(b_, l2)])
        b.mesh('COLMESH_' + nm, [V(v, H), V(a_, l1), V(b_, l2)], [(0, 1, 2)])

# --- Handrail on the pillar's side face where Kane's stairs meet it (photo): wall brackets, curled ends
m3 = L['monoliths'][2]
fpts = sorted(m3, key=lambda q: -q[0])[:2]
fpts.sort(key=lambda q: q[1])                      # north corner (top of the stairs) first
(ax_, az_), (bx_, bz_) = fpts
fx = max(ax_, bx_) + 0.09
top_z, bot_z = az_ + 0.25, bz_ - 0.15
ra, rb = (fx, -top_z, H + 0.9), (fx, -bot_z, 0.9)
b.tube('M_metal', ra, rb, 0.022)
for zz, hh in ((top_z, H + 0.9), (bot_z, 0.9)):
    b.tube('M_metal', (fx, -zz, hh), (fx - 0.09, -zz, hh), 0.018)          # return into the wall
for f in (0.25, 0.75):
    zz = top_z + (bot_z - top_z) * f
    hh = H + 0.9 + (0.9 - H - 0.9) * f
    b.tube('M_metal', (fx, -zz, hh), (fx - 0.09, -zz, hh - 0.05), 0.014)    # bracket
b.rail('pillar_handrail', ra, rb)

# --- The hill right of the obelisk: one long, wide, smooth ramp up onto the level. Cosine profile along the run, so
# the slope eases in at the bottom and out at the top (max slope = atan(pi/2 * H / run), about 6 degrees), and side
# wings that roll down the same way so it has no hard sides. One smooth surface for both the mesh and the collider.
HL = LV['hill']
(hx0, hz0), (hx1, hz1) = HL['top']
hlen = math.hypot(hx1 - hx0, hz1 - hz0)
he = ((hx1 - hx0) / hlen, (hz1 - hz0) / hlen)
dl = math.hypot(*HL['dir'])
hd = (HL['dir'][0] / dl, HL['dir'][1] / dl)
HRUN, WING = HL['run'], HL['wing']
us = [-WING + k * 0.75 for k in range(int((hlen + 2 * WING) / 0.75) + 1)] + [hlen + WING]
ROWS = 30
grid = []
for u in us:
    side = 1.0 if 0 <= u <= hlen else 0.5 * (1 + math.cos(math.pi * min(1.0, (-u if u < 0 else u - hlen) / WING)))
    row = []
    for r in range(ROWS + 1):
        t = r / ROWS
        h = H * 0.5 * (1 + math.cos(math.pi * t)) * side
        row.append(V((hx0 + he[0] * u + hd[0] * HRUN * t, hz0 + he[1] * u + hd[1] * HRUN * t), max(h, 0.0) + 0.002))
    grid.append(row)
verts = [v for row in grid for v in row]
faces = []
for k in range(len(grid) - 1):
    for r in range(ROWS):
        a0 = k * (ROWS + 1) + r
        quad = (a0, a0 + 1, a0 + ROWS + 2, a0 + ROWS + 1)
        (x0_, y0_, _), (x1_, y1_, _), (x2_, y2_, _) = verts[quad[0]], verts[quad[1]], verts[quad[2]]
        faces.append(quad if (x1_ - x0_) * (y2_ - y0_) - (y1_ - y0_) * (x2_ - x0_) > 0 else quad[::-1])
b.mesh('M_paverbrick', verts, faces)
b.mesh('COLMESH_hill', verts, faces)
b.rail('hill_crest', V((hx0, hz0), H), V((hx1, hz1), H))
print('HILL max slope deg', math.degrees(math.atan(math.pi / 2 * H / HRUN)), 'width', hlen + 2 * WING)

# --- The two short flights next to the monolith up to the north level, brick wall + handrail on the Odegaard side
OS = L['odegaardStairs']
x0, x1 = OS['x']
rise = H / (OS['lower'] + OS['upper'])
y = -OS['footZ']                       # Blender y = -z; the stairs climb toward +y (north)
z = 0.0
rail_pts = []
for fi, (fname, nr) in enumerate((('lower', OS['lower']), ('upper', OS['upper']))):
    y_start, z_start = y, z
    for k in range(nr):
        z += rise
        b.box('M_aggregate', x0, x1, y, y + OS['tread'], 0.0, z)
        b.collider(f'od_{fname}{k}', x0, x1, y, y + OS['tread'], 0.0, z)
        y += OS['tread']
    rail_pts.append(((x0 + 0.22, y_start - 0.3, z_start + 0.85), (x0 + 0.22, y + 0.3, z + 0.85)))
    if fi == 0:  # landing
        b.box('M_paverbrick', x0, x1, y, y + OS['landing'], 0.0, z)
        b.collider('od_landing', x0, x1, y, y + OS['landing'], 0.0, z)
        b.rail('od_landing_edge', (x0, y, z), (x1, y, z))
        y += OS['landing']
y_foot = -OS['footZ']
b.prism_x('M_brick', [(y_foot, 0.0), (y + 0.4, 0.0), (y + 0.4, H + 0.95), (y_foot + 1.0, rise * OS['lower'] + 0.95), (y_foot, 0.95)], x0 - 0.45, x0)
b.collider('od_wall', x0 - 0.45, x0, y_foot, y + 0.4, 0.0, H + 0.95)
for i, (ra, rb) in enumerate(rail_pts):
    b.tube('M_metal', ra, rb, 0.022)
    b.rail(f'od_handrail{i}', ra, rb)

# --- Broken Obelisk at the top of the sloped aggregate edge of the kane_east level (photos, tour photo)
ob = L['obelisk']
cx, cy = P(*ob['center'])
yaw = -ob['yaw']  # game yaw about +Y -> Blender yaw about +Z (z flips)
c, s = math.cos(yaw), math.sin(yaw)
# flat exposed-aggregate top round the sculpture, running out to the sloped edge (photo); the steel sits on a thin plate
pad = []
for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
    pad.append((cx + 3.3 * (sx * c - sy * s), cy + 3.3 * (sx * s + sy * c), H + 0.012))  # stops at the edge
b.mesh('M_aggregate', pad, [(0, 1, 2, 3)])
b.frustum('M_corten', cx, cy, H, H + 0.09, 2.55, 2.55, 2.55, 2.55, yaw)                 # base plate
b.collider('obelisk_plate', cx - 2.55, cx + 2.55, cy - 2.55, cy + 2.55, H, H + 0.09, rotz=yaw)
PHT = 0.09
PB, PY = 2.3, 3.5                  # pyramid half base, height
base = H + PHT
b.frustum('M_corten', cx, cy, base, base + PY, PB, PB, 0, 0, yaw)
SW = 0.62                          # shaft half width
tip = base + PY
b.frustum('M_corten', cx, cy, tip, tip + 0.95, 0.0, 0.0, SW, SW, yaw)              # inverted pyramidion
b.frustum('M_corten', cx, cy, tip + 0.95, tip + 6.6, SW, SW, SW * 0.98, SW * 0.98, yaw)
for k, (ox, oy, hh) in enumerate(((-0.3, -0.3, 0.55), (0.25, -0.2, 0.3), (0.2, 0.3, 0.7), (-0.25, 0.25, 0.4))):
    px, py = cx + ox * c - oy * s, cy + ox * s + oy * c
    b.frustum('M_corten', px, py, tip + 6.6, tip + 6.6 + hh, 0.27, 0.27, 0.03, 0.05, yaw + k)   # torn top
b.collider('pyramid', cx - 1.45, cx + 1.45, cy - 1.45, cy + 1.45, base, base + 2.1, rotz=yaw)
b.collider('shaft', cx - SW, cx + SW, cy - SW, cy + SW, tip, tip + 7.2, rotz=yaw)

# --- Planter pads (photos 4711, 4713, 4714 and the user's sketch): four long, low exposed-aggregate trapezoids framing
# the brass drain, corners cut on the diagonal so there is a gap at each corner. The pair parallel to Kane is longer.
# Each has an aggregate coping along its outer edge (the grind edge), a thinner one along the inner edge, angled end
# caps, a recessed brick top with a gutter channel, and a brick soldier course along both long sides. All of it is ledge.
PL = L['planters']
pc = P(*PL['center'])
b.cyl('M_brass', pc[0], pc[1], -0.02, 0.015, 0.9, 0.9, 32)                      # brass drain cover (photo 4711)
b.cyl('M_aggregate', pc[0], pc[1], -0.02, 0.01, 1.05, 1.05, 32)                  # its aggregate collar
for k in range(36):                                                                # radial brick around it (4736)
    a_ = k * math.pi / 18
    for r0 in (1.1, 2.3):
        x0_, y0_ = pc[0] + math.cos(a_) * r0, pc[1] + math.sin(a_) * r0
        x1_, y1_ = pc[0] + math.cos(a_) * (r0 + 1.1), pc[1] + math.sin(a_) * (r0 + 1.1)
        b.mesh('M_brick_dark', [(x0_ - math.sin(a_) * 0.012, y0_ + math.cos(a_) * 0.012, 0.004),
                                (x1_ - math.sin(a_) * 0.012, y1_ + math.cos(a_) * 0.012, 0.004),
                                (x1_ + math.sin(a_) * 0.012, y1_ - math.cos(a_) * 0.012, 0.004),
                                (x0_ + math.sin(a_) * 0.012, y0_ - math.cos(a_) * 0.012, 0.004)], [(0, 3, 2, 1)])
# sketch -> world: sketch +x points away from Kane (Kane's plaza normal), sketch +y along Kane (same handedness)
KF = LAYOUT['kane']
kdx, kdz = KF['b'][0] - KF['a'][0], KF['b'][1] - KF['a'][1]
kln = math.hypot(kdx, kdz)
kn = (-kdz / kln, kdx / kln)
if kn[1] < 0:
    kn = (-kn[0], -kn[1])
km = (-kn[1], kn[0])
SK = PL['sketch']
mpp, (scx, scy) = SK['metresPerPx'], SK['center']


def sk(q):  # sketch pixel -> Blender (x, y)
    u, v = (q[0] - scx) * mpp, (q[1] - scy) * mpp
    return P(PL['center'][0] + u * kn[0] + v * km[0], PL['center'][1] + u * kn[1] + v * km[1])


SH = PL['height']
for i, quad in enumerate(SK['pads']):
    O0, O1, I1, I0 = [sk(q) for q in quad]
    lerp = lambda p, q, t: (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    thick = math.hypot(*[(lerp(I0, I1, 0.5)[k] - lerp(O0, O1, 0.5)[k]) for k in (0, 1)])

    def Q(a, t):  # a: 0..1 along the pad, t: 0 (outer edge) .. 1 (inner edge)
        return lerp(lerp(O0, O1, a), lerp(I0, I1, a), t)

    def Qm(e0, e1, t):  # same, but e0/e1 metres in from each end (the ends are angled)
        lt = math.hypot(*[(Q(1, t)[k] - Q(0, t)[k]) for k in (0, 1)])
        return Q(e0 / lt, t), Q(1 - e1 / lt, t)

    tc, tb, tg = 0.6 / thick, 0.35 / thick, 0.85 / thick      # coping, back coping, gutter widths
    b.slab('M_aggregate', [O0, O1, I1, I0], 0.0, SH - 0.1)                                   # body
    b.slab('M_aggregate', [O0, O1, Q(1, tc), Q(0, tc)], SH - 0.1, SH)                        # outer coping
    b.slab('M_aggregate', [Q(0, 1 - tb), Q(1, 1 - tb), I1, I0], SH - 0.1, SH - 0.02)         # inner coping
    for (ea, eb) in ((0.0, 1.0), (1.0, 0.0)):                                                # end caps
        a0, _ = Qm(0.45, 0.45, tc)
        _, a1 = Qm(0.45, 0.45, tc)
        b0, _ = Qm(0.45, 0.45, 1 - tb)
        _, b1 = Qm(0.45, 0.45, 1 - tb)
        cap = [Q(0, tc), a0, b0, Q(0, 1 - tb)] if ea == 0.0 else [a1, Q(1, tc), Q(1, 1 - tb), b1]
        b.slab('M_aggregate', cap, SH - 0.1, SH - 0.01)
    g0 = Qm(0.45, 0.45, tc)
    g1 = Qm(0.45, 0.45, tg)
    b.slab('M_brick_dark', [g0[0], g0[1], g1[1], g1[0]], SH - 0.1, SH - 0.085)                # gutter channel
    t0 = Qm(0.45, 0.45, tg)
    t1 = Qm(0.45, 0.45, 1 - tb)
    b.slab('M_brick', [t0[0], t0[1], t1[1], t1[0]], SH - 0.1, SH - 0.06)                      # recessed brick top
    # brick soldier course on both long faces, just proud of the aggregate
    for (pa, pb, inward) in ((O0, O1, Q(0.5, 0.5)), (I1, I0, Q(0.5, 0.5))):
        dx, dy = pb[0] - pa[0], pb[1] - pa[1]
        ln = math.hypot(dx, dy)
        nx, ny = -dy / ln, dx / ln
        mid = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
        if (inward[0] - mid[0]) * nx + (inward[1] - mid[1]) * ny > 0:
            nx, ny = -nx, -ny
        q0, q1 = (pa[0] + nx * 0.012, pa[1] + ny * 0.012), (pb[0] + nx * 0.012, pb[1] + ny * 0.012)
        b.mesh('M_brick', [(*q0, 0.04), (*q1, 0.04), (*q1, 0.26), (*q0, 0.26)], [(0, 1, 2, 3)])
        b.mesh('M_brick', [(*q0, 0.04), (*q1, 0.04), (*q1, 0.26), (*q0, 0.26)], [(3, 2, 1, 0)])
    # collider: the trapezoid as 8 boxes, one per strip from the outer edge to the inner edge (follows the angled ends)
    NS = 8
    for k in range(NS):
        ta, tz = k / NS, (k + 1) / NS
        e0, e1 = lerp(Q(0, ta), Q(0, tz), 0.5), lerp(Q(1, ta), Q(1, tz), 0.5)
        ln = math.hypot(e1[0] - e0[0], e1[1] - e0[1])
        ang = math.atan2(e1[1] - e0[1], e1[0] - e0[0])
        b.col_center(f'pad{i}_{k}', ((e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2, SH / 2), (ln, thick / NS, SH), (0, 0, ang))
    b.rail(f'pad{i}_edge', (*O0, SH), (*O1, SH))
    b.rail(f'pad{i}_back', (*I1, SH - 0.02), (*I0, SH - 0.02))

b.finish('landmarks')
export('landmarks')
mx, my = P(-22, -12)
preview('landmarks', [('monoliths', (mx + 18, my - 18, 6), (-25, 24, 8), 24), ('hill', (cx + 26, cy - 20, 4), (cx + 10, cy, 1), 30),
                      ('obelisk', (cx - 12, cy - 9, 3), (cx, cy, 2.5), 30),
                      ('planters', (pc[0] + 16, pc[1] - 16, 9), (pc[0], pc[1], 0), 30)])
