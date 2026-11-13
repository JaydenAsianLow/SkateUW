# Meany Hall, west side of Red Square (photos IMG_4711, 4721, 4719, 4735, 4736).
# Orange-brown brick walls banded with rows of dark header bricks, a standing-seam metal roof sloping back with a
# row of triangular glass skylights, the tall stage house at the south end, the deep concrete portal with fins,
# and the low brick plinth along the front (a long ledge).
# Run: blender.exe -b --python art/scripts/22_meany.py
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rs_lib import *

clear()
W = facade_size('meany')
b = Builder()
EAVE = 10.5
FLY = 15.0                                   # stage house width at the south end (-x)
x0, x1 = -W / 2 + FLY, W / 2
pc, pw = W / 2 - 9.5, 11.0                   # concrete portal centre / width
pl, pr = pc - pw / 2, pc + pw / 2

# --- Brick wall either side of the portal, banded with dark headers
for (l, r) in ((-W / 2, pl), (pr, x1)):
    b.box('M_brick', l, r, -0.3, 0.0, 0.0, EAVE)
b.box('M_brick', pl, pr, -0.3, 0.0, 9.6, EAVE)
for z in (1.7, 3.3, 4.9, 6.5, 8.1, 9.7):
    for (l, r) in ((-W / 2, pl), (pr, x1)):
        n = int((r - l) / 0.42)
        for k in range(n):
            x = l + 0.1 + k * 0.42
            b.box('M_brick_dark', x, x + 0.21, -0.33, -0.29, z, z + 0.075)
for x in [(-W / 2) + k * 3.3 for k in range(1, int(W / 3.3))]:   # control joints between the wall panels
    if not (pl - 0.3 < x < pr + 0.3):
        b.box('M_brick_dark', x - 0.02, x + 0.02, -0.32, -0.29, 0.6, EAVE - 0.1)
b.box('M_concrete', -W / 2, x1, -0.42, 0.05, EAVE - 0.05, EAVE + 0.25)            # coping

# --- Concrete portal: deep frame, slim fins in front of the glazing (photo 4721)
b.box('M_concrete', pl - 0.5, pl, -1.4, 0.0, 0.0, 9.6)
b.box('M_concrete', pr, pr + 0.5, -1.4, 0.0, 0.0, 9.6)
b.box('M_concrete', pl - 0.5, pr + 0.5, -1.6, 0.0, 9.0, 9.9)
b.box('M_concrete', pl, pr, -1.4, 0.0, 8.6, 9.0)  # soffit
b.box('M_glass', pl, pr, -0.12, -0.08, 0.0, 8.6)
for k in range(7):
    x = pl + 0.9 + k * (pw - 1.8) / 6
    b.box('M_concrete', x - 0.17, x + 0.17, -1.2, -0.1, 0.0, 8.6 if k % 3 else 9.0)
    b.collider(f'fin{k}', x - 0.17, x + 0.17, -1.2, -0.1, 0.0, 8.6)
b.box('M_glass_warm', pc - 2.0, pc + 2.0, -0.16, -0.12, 0.0, 2.6)
b.collider('portal_l', pl - 0.5, pl, -1.4, 0.0, 0.0, 9.6)
b.collider('portal_r', pr, pr + 0.5, -1.4, 0.0, 0.0, 9.6)

# --- Metal roof sloping back from the eave with the row of triangular skylights
b.prism_x('M_roofmetal', [(-0.25, EAVE + 0.25), (8.0, EAVE + 3.6), (20.0, EAVE + 3.6), (20.0, EAVE + 0.25)], x0, x1)
for k in range(int((x1 - x0) / 0.6)):   # standing seams
    x = x0 + 0.3 + k * 0.6
    b.prism_x('M_roofmetal', [(-0.2, EAVE + 0.3), (8.0, EAVE + 3.65), (8.0, EAVE + 3.72), (-0.2, EAVE + 0.37)], x - 0.02, x + 0.02)
NSK = 9
for k in range(NSK):
    cx = x0 + 3.0 + k * (x1 - x0 - 6.0) / (NSK - 1)
    y0s, y1s = 1.2, 4.4
    z0 = EAVE + 0.25 + (y0s + 0.25) * 3.35 / 8.25
    b.prism('M_skylight', [(cx - 0.75, z0), (cx + 0.75, z0), (cx, z0 + 2.1)], y0s, y1s)
    b.prism('M_concrete', [(cx - 0.85, z0 - 0.05), (cx + 0.85, z0 - 0.05), (cx, z0 + 2.25)], y0s - 0.1, y0s)

# --- Stage house (south end): a tall plain brick box set back from the front
b.box('M_brick', -W / 2, x0, 2.0, 20.0, 0.0, 19.5)
b.box('M_concrete', -W / 2 - 0.1, x0 + 0.1, 1.9, 20.1, 19.5, 19.8)
for z in (3.0, 6.0, 9.0, 12.0, 15.0, 18.0):   # dotted header courses on the stage house too
    for k in range(int(FLY / 0.42)):
        x = -W / 2 + 0.1 + k * 0.42
        b.box('M_brick_dark', x, x + 0.21, 1.97, 2.0, z, z + 0.075)
b.collider('stage', -W / 2, x0, 2.0, 20.0, 0.0, 19.5)

# --- Low brick plinth along the front with a concrete cap: a long ledge, broken at the portal
for (l, r) in ((-W / 2 + 0.5, pl - 1.0), (pr + 1.0, x1 - 0.5)):
    b.box('M_brick', l, r, -1.25, -0.3, 0.0, 0.62)
    b.box('M_concrete', l - 0.03, r + 0.03, -1.3, -0.28, 0.62, 0.7)
    b.collider(f'plinth{int(l)}', l, r, -1.3, -0.28, 0.0, 0.7)
    b.rail(f'plinth{int(l)}', (l, -1.3, 0.7), (r, -1.3, 0.7))

b.finish('meany')
export('meany')
preview('meany', [('front', (0, -50, 7), (0, 0, 7), 30), ('oblique', (W / 2 + 14, -22, 4), (0, 2, 7), 28)])
