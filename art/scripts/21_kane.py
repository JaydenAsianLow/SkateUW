# Kane Hall: the concrete-colonnade front that faces Red Square (photos IMG_4708, 4714, 4730, 4735).
# Tapered concrete fins, deep balcony slabs, tall dark glazing between slim fins, the Kane steps along the front,
# a brick tower with the carillon frame at one end and a low brick wing at the other.
# Run: blender.exe -b --python art/scripts/21_kane.py
import json, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rs_lib import *

clear()
W = facade_size('kane')
H = 13.4  # top of the roof slab
b = Builder()
FLOOR = 1.05      # upper level: Kane's portico and the open strip in front, six 17.5 cm risers above the plaza
                  # (rs-landmarks.json levels.height)
N = 11            # fins across the front
x0 = -W / 2 + 6.0  # the end tower and the wing take the last few metres each side
x1 = W / 2 - 4.5
dx = (x1 - x0) / (N - 1)

# --- Walking space in front of the colonnade, then the big Kane staircase down to the plaza (photos 4727, 4735,
# and the videos): the obelisk sits up on this same level to the east (26_landmarks.py, rs-landmarks.json).
WALK = 27.5      # wide open strip between the front wall and the top of the stairs (scales with the map: scripts/scale-map.py)
SX1 = W / 2       # the stair run starts at Kane's east corner (+x) and runs west until it meets the pillar
RISERS, TREAD = 6, 0.42  # 17.5 cm risers, 42 cm treads
b.box('M_paverbrick', -W / 2, W / 2, -WALK, 0.0, 0.0, FLOOR)
b.collider('walk', -W / 2, W / 2, -WALK, 0.0, 0.0, FLOOR)
# The pillar (east face of the easternmost monolith, rs-landmarks.json) is not square to Kane's front, so every step
# is cut to its own length to end flush against the pillar's face, like the real stairs.
LM = json.load(open(os.path.join(PROJECT, 'public', 'map', 'rs-landmarks.json')))
F = LAYOUT['kane']
ka, kb = F['a'], F['b']
kl = math.hypot(kb[0] - ka[0], kb[1] - ka[1])
ke = ((kb[0] - ka[0]) / kl, (kb[1] - ka[1]) / kl)
kn = (-ke[1], ke[0]) if ke[0] < 0 else (ke[1], -ke[0])
if kn[1] < 0:
    kn = (-kn[0], -kn[1])
mono = LM['monoliths'][2]
face = sorted(mono, key=lambda q: -q[0])[:2]          # its two most easterly corners = the face toward the stairs


def to_local(q):  # world (x, z) -> this facade's (x along, y out): +x is Kane's east end
    d = (q[0] - ka[0], q[1] - ka[1])
    t = d[0] * ke[0] + d[1] * ke[1]
    o = d[0] * kn[0] + d[1] * kn[1]
    return (W / 2 - t, -o)


(fx0, fy0), (fx1, fy1) = to_local(face[0]), to_local(face[1])
SX0 = fx0 + (fx1 - fx0) * (-WALK - fy0) / (fy1 - fy0)  # the pillar face at the top of the stairs
b.box('M_concrete', SX0, SX1, -WALK - 0.02, -WALK + 0.35, FLOOR - 0.05, FLOOR + 0.005)   # top nosing
rise = FLOOR / RISERS
for k in range(RISERS):
    y_front = -WALK - (RISERS - k) * TREAD
    y_back = y_front + TREAD
    ym = (y_front + y_back) / 2
    x_end = fx0 + (fx1 - fx0) * (ym - fy0) / (fy1 - fy0)  # where this step's middle meets the pillar face
    b.box('M_concrete', x_end, SX1, y_front, y_back if k < RISERS - 1 else -WALK, 0, (k + 1) * rise)
    b.collider(f'step{k}', x_end, SX1, y_front, -WALK, 0, (k + 1) * rise)
b.rail('top_edge', (SX0, -WALK, FLOOR), (SX1, -WALK, FLOOR))
# Handrail down the east side (the pillar side has its own wall rail, 26_landmarks.py)
b.handrail('stairs_east_rail', SX1 - 0.3, -WALK - RISERS * TREAD, 0.0, -WALK, FLOOR)
# (the west side joins the raised north level in front of Odegaard, 26_landmarks.py)

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
