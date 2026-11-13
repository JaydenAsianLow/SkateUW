# Suzzallo Library, west front on Red Square, the hero building (photos IMG_4732, 4726, 4708).
# Collegiate Gothic: a ground-floor arcade of pointed arches on a balustraded terrace, three gabled entrance
# portals in the middle, eleven tall traceried reading-room windows set in buff brick between stone buttresses
# that rise into pinnacles, an openwork parapet, a steep slate roof with copper cresting, and turreted end pavilions.
# Run: blender.exe -b --python art/scripts/24_suzzallo.py
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rs_lib import *

clear()
W = facade_size('suzzallo')
b = Builder()
S = 'M_stone'
PW = 5.6                       # end pavilion width
xL, xR = -W / 2 + PW, W / 2 - PW
BAYS = 11
dx = (xR - xL) / BAYS
bay = [xL + (i + 0.5) * dx for i in range(BAYS)]
PORTALS = (4, 5, 6)
T = 1.2                        # terrace / ground-floor level above the plaza
G = 9.6                        # top of the ground storey (string course)
E = 21.8                       # eave / parapet base
WW = 3.3                       # window width

# --- Ground storey: stone wall with the arcade of pointed arches
cols = [(cx, WW, [(T + 0.5, G - 1.3, 2.3)]) for i, cx in enumerate(bay)]
b.wall_openings(S, xL, xR, 0.0, G, -0.7, 0.0, cols, mullions=(S, 1, 2.0))
for i in PORTALS:  # lit doors inside the three entrance arches
    b.box('M_glass_warm', bay[i] - 1.2, bay[i] + 1.2, -0.35, -0.3, T, T + 3.2)
b.box(S, xL, xR, -1.0, -0.6, G - 0.4, G + 0.3)                       # string course
for i, cx in enumerate(bay):                                          # carved panel band under the windows
    b.box(S, cx - WW / 2, cx + WW / 2, -0.85, -0.6, G + 0.3, G + 1.0)

# --- Upper storey: buff brick between the tall traceried windows
cols = [(cx, WW, [(G + 1.2, E - 0.6, 2.6)]) for cx in bay]
b.wall_openings('M_brick_tan', xL, xR, G, E, -0.55, 0.0, cols, mullions=(S, 2, 2.3))
for cx in bay:  # stone jambs and a tracery rose in each window head
    for s in (-1, 1):
        b.box(S, cx + s * (WW / 2 + 0.12) - 0.14, cx + s * (WW / 2 + 0.12) + 0.14, -0.75, -0.5, G + 1.0, E - 2.6)
    b.prism(S, [(cx + 0.6 * math.cos(a * math.pi / 6), E - 2.0 + 0.6 * math.sin(a * math.pi / 6)) for a in range(12)], -0.42, -0.36)

# --- Buttresses between the bays, rising into pinnacles above the parapet, each with a figure niche
for k in range(BAYS + 1):
    x = xL + k * dx
    b.box(S, x - 0.55, x + 0.55, -1.5, -0.5, 0.0, G + 1.0)
    b.box(S, x - 0.45, x + 0.45, -1.25, -0.5, G + 1.0, E + 1.0)
    b.box(S, x - 0.35, x + 0.35, -1.05, -0.5, E + 1.0, E + 2.6)
    b.cyl(S, x, -0.8, E + 2.6, E + 5.2, 0.3, 0.02, 4)
    for s in (-0.42, 0.42):
        b.cyl(S, x + s, -0.8, E + 1.0, E + 2.4, 0.12, 0.01, 4)
    b.cyl(S, x, -1.32, G + 3.0, G + 4.6, 0.2, 0.17, 8)                # carved figure
    b.box(S, x - 0.3, x + 0.3, -1.45, -1.2, G + 4.6, G + 4.9)          # canopy over it
    b.collider(f'buttress{k}', x - 0.55, x + 0.55, -1.5, -0.5, 0.0, G)

# --- Gabled entrance portals (middle three bays)
for i in PORTALS:
    cx = bay[i]
    for s in (-1, 1):
        b.box(S, cx + s * (dx / 2 - 0.35) - 0.4, cx + s * (dx / 2 - 0.35) + 0.4, -2.2, -0.6, 0.0, G + 2.6)
        b.cyl(S, cx + s * (dx / 2 - 0.35), -1.4, G + 2.6, G + 4.6, 0.32, 0.02, 4)
    b.prism(S, [(cx - dx / 2 + 0.2, G - 0.2), (cx + dx / 2 - 0.2, G - 0.2), (cx, G + 3.4)], -2.1, -0.6)
    b.prism(S, [(cx - 1.6, G - 1.0), (cx + 1.6, G - 1.0), (cx, G + 1.8)], -2.2, -2.1)  # inner gable moulding
    b.cyl(S, cx, -1.0, T + 3.6, T + 5.4, 0.22, 0.2, 8)                 # statue over the door
    b.collider(f'portal{i}', cx - dx / 2, cx + dx / 2, -2.2, -0.6, T, G)

# --- Parapet: openwork band with small blind arches, slate roof, copper ridge cresting
b.box(S, xL, xR, -0.8, -0.3, E - 0.2, E + 0.25)
for k in range(int((xR - xL) / 0.9)):
    x = xL + 0.2 + k * 0.9
    b.box(S, x, x + 0.18, -0.7, -0.4, E + 0.25, E + 1.05)
b.box(S, xL, xR, -0.75, -0.35, E + 1.05, E + 1.3)
b.prism_x('M_slate', [(-0.3, E + 0.5), (26.0, E + 0.5), (12.9, E + 11.5)], xL - 0.2, xR + 0.2)
b.box('M_roofmetal', xL, xR, 12.7, 13.1, E + 11.3, E + 11.9)
for k in range(int((xR - xL) / 1.2)):
    x = xL + 0.3 + k * 1.2
    b.box('M_roofmetal', x, x + 0.08, 12.85, 12.95, E + 11.9, E + 12.4)

# --- End pavilions with corner turrets
for sgn in (-1, 1):
    p0, p1 = (W / 2 - PW, W / 2) if sgn > 0 else (-W / 2, -W / 2 + PW)
    pc = (p0 + p1) / 2
    b.wall_openings(S, p0, p1, 0.0, E + 2.0, -1.4, 0.0,
                    [(pc, 1.4, [(T + 1.0, G - 1.6, 1.0), (G + 1.6, E - 1.0, 1.0)])], glass_y=-0.8, mullions=(S, 1, 2.0))
    b.box(S, p0 + 0.2, p1 - 0.2, -0.5, 26.0, 0.0, E + 2.0)
    for x in (p0 + 0.6, p1 - 0.6):
        b.cyl(S, x, -1.0, 0.0, E + 4.0, 0.75, 0.7, 8)
        b.cyl(S, x, -1.0, E + 4.0, E + 9.0, 0.7, 0.03, 8)
    b.prism_x('M_slate', [(-1.2, E + 2.0), (26.0, E + 2.0), (12.4, E + 12.5)], p0, p1)
    b.collider(f'pavilion{sgn}', p0, p1, -1.75, 0.0, 0.0, E)

# --- Terrace across the front with a stone balustrade, and the central steps up to it
TD = 5.2  # terrace depth
st_w = 3 * dx
b.box(S, -W / 2, W / 2, -TD, -0.5, 0.0, T)
b.collider('terrace', -W / 2, W / 2, -TD, -0.5, 0.0, T)
for (l, r) in ((-W / 2, -st_w / 2), (st_w / 2, W / 2)):
    b.box(S, l, r, -TD, -TD + 0.35, T, T + 0.15)
    n = int((r - l) / 0.32)
    for k in range(n):
        x = l + 0.12 + k * (r - l - 0.24) / max(1, n - 1)
        b.cyl(S, x, -TD + 0.17, T + 0.15, T + 0.75, 0.09, 0.07, 6)
    b.box(S, l, r, -TD - 0.02, -TD + 0.37, T + 0.75, T + 0.9)
    b.collider(f'balustrade{int(l)}', l, r, -TD, -TD + 0.35, T, T + 0.9)
    b.rail(f'balustrade{int(l)}', (l, -TD + 0.17, T + 0.9), (r, -TD + 0.17, T + 0.9))
    b.rail(f'terrace_edge{int(l)}', (l, -TD, T), (r, -TD, T))
b.stairs(S, 'steps', 0.0, st_w, -TD, T, 7, 0.4, rails=(-st_w / 2 + 1.0, st_w / 2 - 1.0))

b.finish('suzzallo')
export('suzzallo')
preview('suzzallo', [('front', (0, -75, 12), (0, 0, 14), 28), ('oblique', (W / 2 + 10, -26, 5), (6, 0, 10), 26)])
