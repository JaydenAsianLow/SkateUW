# Makes the whole Red Square campus bigger (or smaller) around the origin, keeping life-size things life-size.
#
#   python scripts/scale-map.py 1.1      # 10% bigger than it is now (the factor multiplies the current scale)
#
# Then rebuild the Blender pieces (MAP.md 13): every art/scripts/2x_*.py, since facade widths follow the map.
#
# What moves: OSM footprints and the plaza (scripts/osm-to-level.mjs MAP_SCALE), the modelled facade walls
# (rs-facades.json), raised levels, hill, obelisk, planters, the Odegaard flights (rs-landmarks.json), Kane's open strip,
# and every hand-placed point in src/display/redSquare/layout.js (spawn, stairs, lamps, benches, trees, bounds, paving)
# plus the paving band spacing in look.js.
# What keeps its size: building heights, steps, the pillars (they only move), the obelisk, the planter slabs, props.
import json
import math
import os
import re
import subprocess
import sys

f = float(sys.argv[1])
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.chdir(ROOT)
NUM = r'-?\d+(?:\.\d+)?'


def r2(v):
    return round(v * 100) / 100


def fmt(v):
    v = r2(v)
    return str(int(v)) if v == int(v) else str(v)


def edit(path, fn):
    s = open(path, encoding='utf8').read()
    t = fn(s)
    assert t != s, path
    open(path, 'w', encoding='utf8', newline='').write(t)


# --- OSM layer
def osm(s):
    m = re.search(r'const MAP_SCALE = (' + NUM + ');', s)
    return s.replace(m.group(0), f'const MAP_SCALE = {fmt(float(m.group(1)) * f)};')


edit('scripts/osm-to-level.mjs', osm)
subprocess.run(['node', 'scripts/osm-to-level.mjs'], check=True, stdout=subprocess.DEVNULL)

# --- Facade walls
F = json.load(open('public/map/rs-facades.json'))
for v in F.values():
    v['a'] = [r2(c * f) for c in v['a']]
    v['b'] = [r2(c * f) for c in v['b']]
json.dump(F, open('public/map/rs-facades.json', 'w'), indent=1)

# --- Landmarks
L = json.load(open('public/map/rs-landmarks.json'))
cent = [(sum(p[0] for p in m) / len(m), sum(p[1] for p in m) / len(m)) for m in L['monoliths']]
shift = [(c[0] * (f - 1), c[1] * (f - 1)) for c in cent]
L['monoliths'] = [[[r2(p[0] + d[0]), r2(p[1] + d[1])] for p in m] for m, d in zip(L['monoliths'], shift)]
for bn in L['banners'].values():  # banners hang on a pillar: move with it
    zc = sum(bn['z']) / 2
    i = min(range(len(cent)), key=lambda k: math.hypot(cent[k][0] - bn['x'], cent[k][1] - zc))
    bn['x'] = r2(bn['x'] + shift[i][0])
    bn['z'] = [r2(z + shift[i][1]) for z in bn['z']]
L['obelisk']['center'] = [r2(c * f) for c in L['obelisk']['center']]
L['planters']['center'] = [r2(c * f) for c in L['planters']['center']]
lv = L['levels']
for lvl in lv['list']:
    lvl['polygon'] = [[r2(c * f) for c in p] for p in lvl['polygon']]
lv['hill']['top'] = [[r2(c * f) for c in p] for p in lv['hill']['top']]
# The foot of Kane's stairs (kane_east point 0) sits the open strip plus the stair run out from the facade: only the
# strip grows, the steps keep their size.
run = lv['stairRisers'] * lv['stairTread']
ka, kb = F['kane']['a'], F['kane']['b']
ln = math.hypot(kb[0] - ka[0], kb[1] - ka[1])
n = (-(kb[1] - ka[1]) / ln, (kb[0] - ka[0]) / ln)
if n[1] < 0:
    n = (-n[0], -n[1])
for lvl in lv['list']:
    if lvl['name'] == 'kane_east':
        p = lvl['polygon'][0]
        lvl['polygon'][0] = [r2(p[0] - n[0] * run * (f - 1)), r2(p[1] - n[1] * run * (f - 1))]
# Odegaard flights: the steps keep their size, the landing between them takes up the extra length.
od = L['odegaardStairs']
steps = (od['lower'] + od['upper']) * od['tread']
od['x'] = [r2(c * f) for c in od['x']]
od['footZ'] = r2(od['footZ'] * f)
od['landing'] = r2((od['landing'] + steps) * f - steps)
json.dump(L, open('public/map/rs-landmarks.json', 'w'), indent=1)

# --- Kane's open strip
edit('art/scripts/21_kane.py', lambda s: re.sub(r'^WALK = (' + NUM + ')', lambda m: f'WALK = {fmt(float(m.group(1)) * f)}', s, flags=re.M))


# --- Hand-placed points in layout.js
def layout(s):
    out, in_benches = [], False
    for line in s.split('\n'):
        if line.startswith('export const BENCHES'):
            in_benches = True
        if 'dir:' in line or 'norm(' in line:  # directions stay unit vectors
            out.append(line)
            continue
        if in_benches:  # [x, z, rotY]
            line = re.sub(r'\[(' + NUM + r'), (' + NUM + r'), ', lambda m: f'[{fmt(float(m.group(1)) * f)}, {fmt(float(m.group(2)) * f)}, ', line)
            if line.startswith('];'):
                in_benches = False
        else:
            line = re.sub(r'\[(' + NUM + r'), (' + NUM + r')\]', lambda m: f'[{fmt(float(m.group(1)) * f)}, {fmt(float(m.group(2)) * f)}]', line)
        line = re.sub(r'width: (' + NUM + ')', lambda m: f'width: {fmt(float(m.group(1)) * f)}', line)
        line = re.sub(r'vistaTree\(s, (' + NUM + r')\)', lambda m: f'vistaTree(s, {fmt(float(m.group(1)) * f)})', line)
        if '].flatMap((s, i)' in line:  # distances of the Rainier Vista trees down the path
            line = re.sub(r'\[([^\]]*)\]', lambda m: '[' + ', '.join(fmt(float(v) * f) for v in m.group(1).split(',')) + ']', line, count=1)
        out.append(line)
    return '\n'.join(out)


edit('src/display/redSquare/layout.js', layout)

# --- Paving bands (look.js): the concrete strips are part of the plaza, so their spacing grows with it
def bands(s):
    lines = s.split('\n')
    for i, line in enumerate(lines):
        if 'fract(q / vec2(' in line:
            lines[i] = re.sub(r'vec2\((' + NUM + r'), (' + NUM + r')\)', lambda m: f'vec2({float(m.group(1)) * f:.1f}, {float(m.group(2)) * f:.1f})', line)
    return '\n'.join(lines)


edit('src/display/look.js', bands)
print('scaled by', f)
