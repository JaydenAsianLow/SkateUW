# Gerberding Hall: the Collegiate Gothic cast-stone front on the south side of Red Square
# (photos IMG_4715, 4716, 4717, 4719, 4733). Pointed-arch windows with quatrefoil panels on the ground floor,
# tall mullioned windows over two floors above, a central oriel over the arched entrance, a gable on the
# roofline, a slate roof, the corner tower at the east end, and the fanned entrance steps with two handrails.
# Run: blender.exe -b --python art/scripts/25_gerberding.py
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rs_lib import *

clear()
W = facade_size('gerberding')
b = Builder()
S = 'M_stone'
TW = 7.5                      # tower width (east end = -x)
xL, xR = -W / 2 + TW, W / 2   # main front between the tower and the west end
EAVE = 15.6
BAYS = 9
dx = (xR - xL - 1.6) / BAYS
bay = [xL + 0.8 + (i + 0.5) * dx for i in range(BAYS)]
MID = BAYS // 2

# --- Front wall with its windows (wall face at y = -0.45, footprint wall line at y = 0)
cols = []
for i, cx in enumerate(bay):
    if i == MID:
        cols.append((cx, 2.6, [(1.0, 5.0, 1.5)]))                     # entrance arch
    else:
        cols.append((cx, 2.4, [(1.5, 4.9, 1.45), (6.3, 14.0, 0)]))     # ground arch + tall upper window
b.wall_openings(S, xL, xR, 0.0, EAVE, -0.45, 0.0, cols, mullions=(S, 2, 1.6))
b.box('M_glass_warm', bay[MID] - 1.3, bay[MID] + 1.3, -0.2, -0.15, 1.0, 3.6)        # lit doors
b.box('M_tile', bay[MID] - 1.6, bay[MID] + 1.6, -1.8, -0.45, 0.66, 0.7)            # tiled landing (photo 4717)

# quatrefoil panels under the ground-floor windows, buttress strips between bays, base course
for i, cx in enumerate(bay):
    if i != MID:
        for s in (-0.55, 0.55):
            b.cyl(S, cx + s, -0.5, 0.75, 1.25, 0.24, 0.24, 8)
for x in [xL + 0.4] + [bay[i] + dx / 2 for i in range(BAYS - 1)] + [xR - 0.4]:
    b.box(S, x - 0.35, x + 0.35, -0.85, -0.4, 0.0, EAVE - 0.6)
    b.box(S, x - 0.3, x + 0.3, -0.75, -0.4, EAVE - 0.6, EAVE + 1.4)   # pinnacle stub through the parapet
b.box(S, xL, xR, -0.75, -0.4, 0.0, 0.55)                                 # base course
b.box(S, xL, xR, -0.7, -0.3, 5.5, 5.8)                                   # string course
b.box(S, xL, xR, -0.8, -0.3, EAVE - 0.3, EAVE + 0.4)                     # cornice
b.box(S, xL, xR, -0.5, -0.3, EAVE + 0.4, EAVE + 1.0)                     # parapet

# --- Oriel (bay window) over the entrance: three glazed faces on a carved corbel
cx = bay[MID]
for (a0, a1) in (((-1.3, -0.45), (-0.8, -1.5)), ((-0.8, -1.5), (0.8, -1.5)), ((0.8, -1.5), (1.3, -0.45))):
    (ax, ay), (bx_, by) = a0, a1
    b.quad('M_glass', (cx + ax, ay, 6.4), (cx + bx_, by, 6.4), (cx + bx_, by, 14.0), (cx + ax, ay, 14.0))
b.slab(S, [(cx - 1.4, -0.4), (cx - 0.9, -1.6), (cx + 0.9, -1.6), (cx + 1.4, -0.4)], 5.6, 6.4)
b.slab(S, [(cx - 1.4, -0.4), (cx - 0.9, -1.6), (cx + 0.9, -1.6), (cx + 1.4, -0.4)], 14.0, 14.6)
b.slab(S, [(cx - 0.7, -0.4), (cx - 0.4, -1.0), (cx + 0.4, -1.0), (cx + 0.7, -0.4)], 4.9, 5.6)   # corbel
for x, y in ((cx - 0.8, -1.5), (cx + 0.8, -1.5)):
    b.box(S, x - 0.09, x + 0.09, y - 0.09, y + 0.09, 6.4, 14.0)
for z in (8.9, 11.4):
    b.slab(S, [(cx - 1.3, -0.45), (cx - 0.8, -1.55), (cx + 0.8, -1.55), (cx + 1.3, -0.45)], z, z + 0.12)
b.slab('M_roofmetal', [(cx - 1.4, -0.4), (cx - 0.9, -1.6), (cx + 0.9, -1.6), (cx + 1.4, -0.4)], 14.6, 14.75)
# gable rising above the eave with two small lit windows
b.prism(S, [(cx - 2.3, EAVE), (cx + 2.3, EAVE), (cx, EAVE + 4.6)], -0.55, -0.1)
b.box('M_glass_warm', cx - 0.65, cx - 0.15, -0.6, -0.55, EAVE + 1.0, EAVE + 2.4)
b.box('M_glass_warm', cx + 0.15, cx + 0.65, -0.6, -0.55, EAVE + 1.0, EAVE + 2.4)
b.cyl(S, cx, -0.4, EAVE + 4.4, EAVE + 5.6, 0.25, 0.05, 6)

# --- Slate roof (ridge parallel to the front) with small dormers
b.prism_x('M_slate', [(-0.35, EAVE + 0.4), (13.0, EAVE + 0.4), (6.3, EAVE + 5.4)], xL, xR)
for i in range(BAYS):
    if i != MID:
        x = bay[i]
        b.box('M_slate', x - 0.5, x + 0.5, 0.6, 1.6, EAVE + 0.6, EAVE + 1.6)
        b.box('M_glass', x - 0.35, x + 0.35, 0.55, 0.6, EAVE + 0.7, EAVE + 1.4)

# --- Corner tower (east end): buttressed, tall belfry openings, crenellated top with pinnacles
tx0, tx1 = -W / 2, -W / 2 + TW
TH = 29.0
b.wall_openings(S, tx0, tx1, 0.0, TH, -1.6, 0.0,
                [((tx0 + tx1) / 2, 1.6, [(1.6, 5.0, 1.0), (7.0, 13.5, 0), (20.0, 26.0, 1.2)])], glass_y=-0.9, mullions=(S, 1, 0))
b.box(S, tx0 + 0.3, tx1 - 0.3, -0.6, 6.0, 0.0, TH)                        # tower body behind
for x in (tx0, tx1 - 0.9):
    b.box(S, x, x + 0.9, -2.2, -1.3, 0.0, TH - 1.0)                       # corner buttresses
    b.cyl(S, x + 0.45, -1.75, TH - 1.0, TH + 3.2, 0.42, 0.04, 4)           # pinnacles
for x in (tx0, tx1 - 0.9):
    b.cyl(S, x + 0.45, 5.5, TH - 1.0, TH + 3.2, 0.42, 0.04, 4)
for k in range(8):                                                          # crenellations
    x = tx0 + 0.3 + k * (TW - 0.6) / 8
    b.box(S, x, x + 0.45, -1.75, -1.35, TH, TH + 0.8)
b.box(S, tx0 - 0.1, tx1 + 0.1, -1.8, 6.2, TH - 0.3, TH)
b.collider('tower', tx0, tx1, -2.2, 0.0, 0.0, TH)

# --- Entrance steps: four fanned stone risers up to the landing, a handrail each side (photos 4716, 4719, 4733)
b.stairs(S, 'entry', cx, 3.6, -1.8, 0.68, 4, 0.38, taper=0.45, rails=(-2.2, 2.2))
b.box(S, cx - 1.8, cx + 1.8, -1.8, -0.45, 0.0, 0.68)
b.collider('landing', cx - 1.8, cx + 1.8, -1.8, -0.45, 0.0, 0.68)

# --- Low stone wall along the front with a flat coping (benches sit against it): a long skateable ledge
for (l, r) in ((xL + 0.2, cx - 3.2), (cx + 3.2, xR - 0.2)):
    b.box(S, l, r, -1.35, -0.85, 0.0, 0.55)
    b.box(S, l - 0.05, r + 0.05, -1.42, -0.8, 0.55, 0.62)
    b.collider(f'ledge{int(l)}', l, r, -1.42, -0.8, 0.0, 0.62)
    b.rail(f'ledge{int(l)}', (l, -1.42, 0.62), (r, -1.42, 0.62))

b.finish('gerberding')
export('gerberding')
preview('gerberding', [('front', (0, -48, 8), (0, 0, 9), 30), ('steps', (bay[MID] + 8, -12, 2.5), (bay[MID], -1, 1.5), 28)])
