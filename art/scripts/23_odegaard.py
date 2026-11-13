# Odegaard Undergraduate Library, north-west side of Red Square (photos IMG_4731, 4723, 4724, 4725).
# Brown brick towers and piers, a grid of deep concrete balcony bands with recessed windows, a colonnade of brick
# piers at the entrance. The entrance opens onto the raised north level (built in 26_landmarks.py).
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
T = 1.2                                      # floor of the north level in front (rs-landmarks.json levels.height)

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

# The big open space in front (the north level) and the stairs down to the plaza next to the monolith are in
# 26_landmarks.py (photos 4723, 4724 and the aerial photo).

b.finish('odegaard')
export('odegaard')
preview('odegaard', [('front', (0, -36, 7), (0, 0, 7), 30), ('oblique', (-W / 2 - 10, -18, 3), (0, -2, 5), 28)])
