# Red Square landmarks, built in world coordinates (game x, z -> Blender x, -y):
#  - the three brick monoliths (garage vents) with their banners (photos IMG_4708, 4709, 4714, 4722, 4724)
#  - Broken Obelisk (Barnett Newman) on its low granite platform with sloped sides (photo 4709)
#  - the exposed-aggregate planter slabs with brick tops around the radial drain (photos 4711, 4713, 4714, 4736)
# Everything here is skateable: the obelisk platform is a bank on all four sides, the slabs are ledges.
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

# --- Broken Obelisk on its granite platform
ob = L['obelisk']
cx, cy = P(*ob['center'])
yaw = -ob['yaw']  # game yaw about +Y -> Blender yaw about +Z (z flips)
TOP, BOT, PH = 3.6, 5.3, 0.45     # platform half-size at the top / bottom, height
b.frustum('M_granite', cx, cy, 0.0, PH, BOT, BOT, TOP, TOP, yaw)
b.frustum('M_aggregate', cx, cy, 0.0, 0.08, BOT + 0.35, BOT + 0.35, BOT + 0.3, BOT + 0.3, yaw)   # curb band
b.collider('obelisk_top', cx - TOP, cx + TOP, cy - TOP, cy + TOP, PH - 0.3, PH, rotz=yaw)
run = BOT - TOP
ang = math.atan2(PH, run)
slope_len = math.hypot(run, PH)
c, s = math.cos(yaw), math.sin(yaw)
for side in range(4):  # one tilted box per sloped side: the platform is a bank all round
    a = yaw + side * math.pi / 2
    d = (TOP + run / 2)
    nx, ny = math.cos(a), math.sin(a)
    tc = (cx + nx * d - 0.1 * nx * math.sin(ang), cy + ny * d - 0.1 * ny * math.sin(ang), PH / 2 - 0.1 * math.cos(ang))
    # local box: x across the slope (along the edge), y down the slope; tilt about the edge, then yaw
    b.col_center(f'obelisk_bank{side}', tc, (2 * BOT, slope_len, 0.2), (-ang, 0, a - math.pi / 2))
    b.rail(f'obelisk_edge{side}',
           (cx + nx * TOP - ny * TOP, cy + ny * TOP + nx * TOP, PH), (cx + nx * TOP + ny * TOP, cy + ny * TOP - nx * TOP, PH))
# steel: pyramid, then the inverted, snapped-off obelisk balanced point to point
PB, PY = 1.75, 2.7                 # pyramid half base, height
b.frustum('M_corten', cx, cy, PH, PH + PY, PB, PB, 0, 0, yaw)
SW = 0.5                           # shaft half width
tip = PH + PY
b.frustum('M_corten', cx, cy, tip, tip + 0.75, 0.0, 0.0, SW, SW, yaw)              # inverted pyramidion
b.frustum('M_corten', cx, cy, tip + 0.75, tip + 5.0, SW, SW, SW * 0.98, SW * 0.98, yaw)
# torn top: a few jagged steel teeth
for k, (ox, oy, hh) in enumerate(((-0.3, -0.3, 0.55), (0.25, -0.2, 0.3), (0.2, 0.3, 0.7), (-0.25, 0.25, 0.4))):
    px, py = cx + ox * c - oy * s, cy + ox * s + oy * c
    b.frustum('M_corten', px, py, tip + 5.0, tip + 5.0 + hh, 0.22, 0.22, 0.03, 0.05, yaw + k)
b.collider('pyramid', cx - 1.1, cx + 1.1, cy - 1.1, cy + 1.1, PH, PH + 1.6, rotz=yaw)
b.collider('shaft', cx - SW, cx + SW, cy - SW, cy + SW, tip, tip + 5.5, rotz=yaw)

# --- Planter slabs: exposed-aggregate rims round a brick top, set in a pinwheel round the radial drain
pc = P(*L['planters']['center'])
b.cyl('M_metal', pc[0], pc[1], -0.02, 0.012, 0.9, 0.9, 24)                      # drain cover
SH = L['planters']['height']
for i, (rot, length, width, gap) in enumerate(L['planters']['slabs']):
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    T = lambda u, v: (pc[0] + u * ca - v * sa, pc[1] + u * sa + v * ca)
    u0, u1 = gap, gap + length
    v0, v1 = 1.2, 1.2 + width
    outer = [T(u0, v0), T(u1, v0), T(u1 - 1.4, v1), T(u0 + 0.6, v1)]          # angled far end (photo 4713)
    inner = [T(u0 + 0.5, v0 + 0.5), T(u1 - 0.75, v0 + 0.5), T(u1 - 1.7, v1 - 0.45), T(u0 + 0.9, v1 - 0.45)]
    b.slab('M_aggregate', outer, 0.0, SH - 0.06)
    b.slab('M_aggregate', [T(u0, v0), T(u1, v0), T(u1 - 0.2, v0 + 0.5), T(u0 + 0.05, v0 + 0.5)], SH - 0.06, SH)  # raised rim
    b.slab('M_paverbrick', inner, SH - 0.06, SH - 0.04)
    cu, cv = (u0 + u1 - 0.4) / 2, (v0 + v1) / 2
    ccx, ccy = T(cu, cv)
    b.col_center(f'slab{i}', (ccx, ccy, SH / 2), (length - 0.7, width, SH), (0, 0, a))
    b.rail(f'slab{i}_edge', (*T(u0, v0), SH), (*T(u1, v0), SH))
    b.rail(f'slab{i}_back', (*T(u0 + 0.6, v1), SH), (*T(u1 - 1.4, v1), SH))

b.finish('landmarks')
export('landmarks')
mx, my = P(-22, -12)
preview('landmarks', [('monoliths', (mx + 18, my - 18, 6), (-25, 24, 8), 24),
                      ('obelisk', (cx - 12, cy - 9, 3), (cx, cy, 2.5), 30),
                      ('planters', (pc[0] + 14, pc[1] - 14, 7), (pc[0], pc[1], 0), 30)])
