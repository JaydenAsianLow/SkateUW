# Odegaard Undergraduate Library, north-west side of Red Square (photos IMG_4731, 4723, 4724, 4725).
# Brown brick towers and piers, a grid of deep concrete balcony bands with recessed windows, a colonnade of brick
# piers at the entrance, the low terrace in front reached by three-riser steps, and the brick wing wall with
# its wall-mounted handrail at the south end.
# Run: blender.exe -b --python art/scripts/23_odegaard.py
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rs_lib import *

clear()
W = facade_size('odegaard')
b = Builder()
H = 14.2
g0, g1 = -W / 2 + 6.0, W / 2 - 5.0          # the balcony grid between the two brick masses
BAYS = 4
dx = (g1 - g0) / BAYS
T = 1.0                                      # entrance terrace height (two flights up from the plaza)

# brick masses either side (photo 4731: tall plain brick towers with a fine vertical joint)
b.box('M_brick', -W / 2, g0, -1.6, 0.0, 0.0, H + 0.6)
b.box('M_brick', g1, W / 2, -1.0, 0.0, 0.0, H)
b.box('M_brick_dark', g0 - 3.0, g0 - 2.97, -1.63, -1.6, 0.5, H + 0.5)
b.collider('mass_s', -W / 2, g0, -1.6, 0.0, 0.0, H + 0.6)
b.collider('mass_n', g1, W / 2, -1.0, 0.0, 0.0, H)

# brick piers of the grid, running the full height
for k in range(BAYS + 1):
    x = g0 + k * dx
    b.box('M_brick', x - 0.32, x + 0.32, -1.5, 0.0, 0.0, H)
    b.collider(f'pier{k}', x - 0.32, x + 0.32, -1.5, 0.0, T, 4.4)
# concrete balcony bands, soffits and recessed windows on the two upper floors, glazed entrance below
for (zb, zt) in ((4.4, 5.5), (8.8, 9.9)):
    b.box('M_concrete', g0, g1, -1.45, -0.2, zb, zt)
    b.box('M_concrete', g0, g1, -1.5, -0.2, zb - 0.25, zb)
for i in range(BAYS):
    cx = g0 + (i + 0.5) * dx
    for (zb, zt) in ((5.5, 8.6), (9.9, 13.0)):
        b.box('M_glass', cx - dx / 2 + 0.35, cx + dx / 2 - 0.35, -0.25, -0.2, zb, zt)
        b.box('M_concrete', cx - 0.06, cx + 0.06, -0.35, -0.2, zb, zt)
        b.box('M_concrete', cx - dx / 2 + 0.35, cx + dx / 2 - 0.35, -0.6, -0.2, zt, zt + 0.25)
    b.box('M_glass' if i % 2 else 'M_glass_warm', cx - dx / 2 + 0.35, cx + dx / 2 - 0.35, -0.2, -0.15, T, 4.15)
b.box('M_concrete', -W / 2 - 0.1, W / 2 + 0.1, -1.7, 0.05, H, H + 0.6)             # roof fascia

# Two flights of three aggregate steps from the plaza (photos 4723, 4724): plaza -> brick landing -> entrance terrace,
# with the brick wing wall and its wall-mounted handrail along the south side (photo 4725).
T1, T2 = 0.5, 1.0            # landing / terrace heights
D2 = 5.5                     # terrace depth in front of the building
D1 = 6.0                     # landing depth
R = 3 * 0.42                 # run of one flight
y_t = -D2                    # front edge of the terrace
y_l = y_t - R - D1           # front edge of the landing
b.box('M_paverbrick', -W / 2, W / 2, y_t, 0.0, 0.0, T2)
b.collider('terrace', -W / 2, W / 2, y_t, 0.0, 0.0, T2)
b.stairs('M_aggregate', 'upper', 0.0, W, y_t, T2, 3, 0.42)
b.box('M_paverbrick', -W / 2, W / 2, y_l, y_t - R, 0.0, T1)
b.collider('landing', -W / 2, W / 2, y_l, y_t - R, 0.0, T1)
b.stairs('M_aggregate', 'lower', 0.0, W, y_l, T1, 3, 0.42)
for nm, y, z in (('terrace_edge', y_t, T2), ('landing_edge', y_l, T1)):
    b.box('M_aggregate', -W / 2, W / 2, y - 0.02, y + 0.3, z - 0.04, z + 0.005)
    b.rail(nm, (-W / 2, y, z), (W / 2, y, z))
y_bot = y_l - R
wx = -W / 2 - 0.45
b.box('M_brick', wx - 0.2, wx + 0.2, y_bot, -1.6, 0.0, T2 + 0.9)
b.box('M_brick', wx - 0.24, wx + 0.24, y_bot, -1.6, T2 + 0.9, T2 + 1.0)
b.collider('wingwall', wx - 0.24, wx + 0.24, y_bot, -1.6, 0.0, T2 + 1.0)
b.rail('wingwall_top', (wx, y_bot, T2 + 1.0), (wx, -1.6, T2 + 1.0))
for nm, (ya, za), (yb, zb) in (('handrail_lower', (y_bot, 0.0), (y_l, T1)), ('handrail_upper', (y_t - R, T1), (y_t, T2))):
    ra, rb = (wx + 0.3, ya - 0.3, za + 0.85), (wx + 0.3, yb + 0.3, zb + 0.85)
    b.tube('M_metal', ra, rb, 0.022)
    b.rail(nm, ra, rb)

b.finish('odegaard')
export('odegaard')
preview('odegaard', [('front', (0, -36, 7), (0, 0, 7), 30), ('oblique', (-W / 2 - 10, -18, 3), (0, -2, 5), 28)])
