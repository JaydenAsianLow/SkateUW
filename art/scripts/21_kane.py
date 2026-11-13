# Kane Hall: the concrete-colonnade front that faces Red Square (photos IMG_4708, 4714, 4730, 4735).
# Tapered concrete fins, deep balcony slabs, tall dark glazing between slim fins, the Kane steps along the front,
# a brick tower with the carillon frame at one end and a low brick wing at the other.
# Run: blender.exe -b --python art/scripts/21_kane.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rs_lib import *

clear()
W = facade_size('kane')
H = 13.4  # top of the roof slab
b = Builder()
FLOOR = 1.0       # portico floor, above the plaza
N = 11            # fins across the front
x0 = -W / 2 + 6.0  # the end tower and the wing take the last few metres each side
x1 = W / 2 - 4.5
dx = (x1 - x0) / (N - 1)

# --- Kane steps: 6 low concrete risers rising to the portico floor, full width (photo 4735)
RISERS, TREAD = 6, 0.42
for k in range(RISERS):
    top = FLOOR - (RISERS - 1 - k) * (FLOOR / RISERS) if False else (k + 1) * FLOOR / RISERS
    y_front = -4.2 - (RISERS - k) * TREAD
    b.box('M_concrete', -W / 2 + 0.2, W / 2 - 0.2, y_front, -4.2, 0.0, top)
    b.collider(f'step{k}', -W / 2 + 0.2, W / 2 - 0.2, y_front, -4.2, 0.0, top)
b.box('M_concrete', -W / 2 + 0.2, W / 2 - 0.2, -4.2, 0.0, 0.0, FLOOR)           # portico floor
b.collider('terrace', -W / 2 + 0.2, W / 2 - 0.2, -4.2, 0.0, 0.0, FLOOR)

# --- Fins: each is a tapered wedge, deep at the base, slimmer near the roof (photo 4730)
for i in range(N):
    cx = x0 + i * dx
    prof = [(0.0, FLOOR - 0.2), (-3.2, FLOOR - 0.2), (-3.2, 6.2), (-2.5, 8.0), (-1.9, H - 0.7), (0.0, H - 0.7)]
    b.prism_x('M_concrete', prof, cx - 0.55, cx + 0.55)
    b.collider(f'fin{i}', cx - 0.55, cx + 0.55, -3.2, 0.0, FLOOR, 6.2)

# --- Floor slabs / balcony beams that run between the fins
for (z0, z1, d) in ((6.2, 7.5, 3.2), (H - 1.4, H, 3.4)):
    b.box('M_concrete', x0 - 1.4, x1 + 1.4, -d, 0.0, z0, z1)
b.box('M_concrete', x0 - 1.4, x1 + 1.4, -3.4, -3.0, H, H + 0.25)                 # roof lip
b.box('M_concrete', x0 - 1.4, x1 + 1.4, -3.0, 0.0, H - 1.4, H + 0.12)

# --- Glazing between the fins: tall dark panes with slim vertical mullion fins (photo 4708)
for i in range(N - 1):
    cx = x0 + (i + 0.5) * dx
    gw = dx - 1.5
    b.box('M_glass', cx - gw / 2, cx + gw / 2, -0.35, -0.25, 7.5, H - 1.4)
    b.box('M_concrete', cx - 0.12, cx + 0.12, -1.2, -0.3, 7.5, H - 1.4)           # mullion fin
    b.box('M_metal', cx - gw / 2, cx + gw / 2, -0.4, -0.3, 10.0, 10.1)
    # ground floor: dark entrance recess with wooden doors
    b.box('M_glass', cx - dx / 2 + 0.7, cx + dx / 2 - 0.7, -0.2, -0.1, FLOOR, 5.0)
    b.box('M_wood', cx - 1.0, cx + 1.0, -0.3, -0.2, FLOOR, 2.6)

# --- Balcony at the left end with a balustrade (photo 4708: small balustraded balcony beside the end fin)
bx0 = x0 - 5.6
b.box('M_concrete', bx0, x0 - 0.4, -3.0, 0.0, 6.2, 7.0)
for k in range(11):
    b.box('M_concrete', bx0 + 0.3 + k * 0.45, bx0 + 0.45 + k * 0.45, -2.9, -2.75, 7.0, 7.9)
b.box('M_concrete', bx0, x0 - 0.4, -3.0, -2.7, 7.9, 8.1)

# --- Brick tower with the carillon (right end in the photo) and a low brick wing
tx0, tx1 = x1 + 1.5, W / 2
b.box('M_brick', tx0, tx1, -3.4, 0.0, 0.0, H + 2.2)
b.box('M_concrete', tx0 - 0.1, tx1 + 0.1, -3.5, 0.05, H + 2.2, H + 2.6)
b.collider('tower', tx0, tx1, -3.4, 0.0, 0.0, H + 2.2)
cz = H + 2.6
for ix, iy in ((0.2, -3.0), (0.2, -0.4), (tx1 - tx0 - 0.4, -3.0), (tx1 - tx0 - 0.4, -0.4)):   # carillon frame: 4 posts, 3 bands
    b.box('M_metal', tx0 + ix, tx0 + ix + 0.2, iy, iy + 0.2, cz, cz + 4.6)
for z in (cz + 0.6, cz + 2.2, cz + 4.4):
    b.box('M_metal', tx0 + 0.2, tx1 - 0.2, -3.0, -2.8, z, z + 0.15)
    b.box('M_metal', tx0 + 0.2, tx1 - 0.2, -0.4, -0.2, z, z + 0.15)
for k in range(6):  # bells
    bxk = tx0 + 0.7 + (k % 3) * 0.9
    b.cyl('M_bronze', bxk, -1.7 + (k // 3) * 0.7, cz + 1.0 + (k // 3) * 1.8, cz + 2.0 + (k // 3) * 1.8, 0.35, 0.18, 10)
wx1 = -W / 2 + 0.6
b.box('M_brick', -W / 2, x0 - 5.8, -2.4, 0.0, 0.0, 8.6)
b.box('M_concrete', -W / 2 - 0.1, x0 - 5.7, -2.5, 0.05, 8.6, 8.9)
b.collider('wing', -W / 2, x0 - 5.8, -2.4, 0.0, 0.0, 8.6)

b.finish('kane')
if '--noexport' not in args():
    export('kane')
preview('kane', [('front', (0, -42, 6), (0, 0, 6.5), 28), ('right34', (W / 2 + 22, -26, 8), (W / 2 - 8, -2, 7), 30),
                 ('left34', (-W / 2 - 18, -24, 4), (-W / 2 + 6, -2, 5), 30)])
