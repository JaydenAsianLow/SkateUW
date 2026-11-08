# Step 5b: clean the skin on the arms and hands. The view projection (03c) smeared shirt orange onto the arms
# (where the side view's hanging arm didn't line up with the A-pose model) and dark edges onto the fingertips.
# Using the part tags from step 5: on each hand, and on each arm past the end of the short sleeve, every texel
# that isn't already skin-coloured is repainted with the median skin tone of the clean forearm texels.
# In/out: art/character/parts.blend + art/character/tex/skater_basecolor.png (overwritten; rerun 04 to restore)
# Then rerun 07_rig.py and 10_export.py.
# Run: blender.exe -b --python art/scripts/05b_skin.py
import os

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLEND = os.path.join(ROOT, 'character', 'parts.blend')
PARTS = ['head', 'hair', 'cap', 'torso', 'hips', 'arm_L', 'arm_R', 'hand_L', 'hand_R', 'leg_L', 'leg_R', 'shoe_L', 'shoe_R']
FALLBACK_SKIN = np.array([0.87, 0.70, 0.58], np.float32)  # sRGB, if no clean skin texels are found

bpy.ops.wm.open_mainfile(filepath=BLEND)
obj = bpy.data.objects['skater_low']
mesh = obj.data
img = bpy.data.images['skater_basecolor']
# Work from an untouched copy of step 4's bake, so this step can be rerun on its own.
TEX = os.path.join(ROOT, 'character', 'tex', 'skater_basecolor.png')
RAW = os.path.join(ROOT, 'character', 'tex', 'skater_basecolor_raw.png')
if not os.path.exists(RAW) or os.path.getmtime(RAW) < os.path.getmtime(os.path.join(ROOT, 'character', 'clean.blend')):
    import shutil
    shutil.copy(TEX, RAW)  # fresh bake from 04: keep it as the raw copy
img.filepath = RAW
img.reload()
W, H = img.size
tex = np.array(img.pixels[:], np.float32).reshape(H, W, 4)

nf = len(mesh.polygons)
part = np.empty(nf, np.int32)
mesh.attributes['part'].data.foreach_get('value', part)
cen = np.empty(nf * 3, np.float32)
mesh.polygons.foreach_get('center', cen)
cen = cen.reshape(-1, 3)
uv = np.empty(len(mesh.loops) * 2, np.float32)
mesh.uv_layers.active.data.foreach_get('uv', uv)
uv = uv.reshape(-1, 2)


def skin_like(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return (r > g) & (g > b) & (g / np.maximum(r, 1e-3) > 0.62) & (g / np.maximum(r, 1e-3) < 0.92) \
        & (b / np.maximum(r, 1e-3) > 0.42) & (lum > 0.3) & (lum < 0.95)


def face_pixels(fi):
    """Texel coordinates covered by a face's UV polygon (fan-triangulated), with a 1.5 px rim."""
    p = mesh.polygons[fi]
    pts = uv[p.loop_start:p.loop_start + p.loop_total] * [W, H]
    out = []
    for k in range(1, len(pts) - 1):
        a, b, c = pts[0], pts[k], pts[k + 1]
        x0, y0 = np.floor(np.minimum(np.minimum(a, b), c) - 2).astype(int)
        x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c) + 2).astype(int)
        xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, W - 1) + 1), np.arange(max(y0, 0), min(y1, H - 1) + 1))
        q = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], axis=1)
        v0, v1, v2 = b - a, c - a, q - a
        den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-9:
            continue
        u = (v2[:, 0] * v1[1] - v1[0] * v2[:, 1]) / den
        v = (v0[0] * v2[:, 1] - v2[:, 0] * v0[1]) / den
        # Inside, or within ~1.5 px of an edge (covers the bake margin seams).
        tol = 1.5 / max(np.linalg.norm(v0), np.linalg.norm(v1), 1.0)
        m = (u >= -tol) & (v >= -tol) & (u + v <= 1 + tol)
        out.append(np.stack([ys.ravel()[m], xs.ravel()[m]], axis=1))
    return np.concatenate(out) if out else np.zeros((0, 2), int)


def face_colour(fi):
    px = face_pixels(fi)
    return tex[px[:, 0], px[:, 1], :3].mean(axis=0) if len(px) else np.zeros(3)


# Arm axis per side from the arm + hand faces: shoulder end = highest, fingertip = lowest.
targets, skin_samples = [], []
for s in ('L', 'R'):
    arm = np.where(part == PARTS.index('arm_' + s))[0]
    hand = np.where(part == PARTS.index('hand_' + s))[0]
    sign = 1 if s == 'L' else -1
    S = np.array([sign * 0.165, 0.0, 1.285], np.float32)  # shoulder ball (joints.json)
    tip = cen[hand[np.argmin(cen[hand, 2])]]
    axis = (tip - S) / np.linalg.norm(tip - S)
    t = (cen[arm] - S) @ axis
    # Sleeve end: walking out from the shoulder, the last 1 cm band where most faces are still shirt-coloured.
    cols = np.array([face_colour(f) for f in arm])
    shirt = ~skin_like(cols)
    sleeve_t = 0.0
    for tb in np.arange(0.0, t.max(), 0.01):
        band = (t >= tb) & (t < tb + 0.01)
        if band.sum() >= 4 and shirt[band].mean() > 0.5:
            sleeve_t = tb + 0.01
        elif band.sum() >= 4 and tb > sleeve_t + 0.04:
            break
    sleeve_t = min(sleeve_t, 0.2)  # short sleeve: never past mid upper arm
    bare = arm[t > sleeve_t + 0.005]
    print(f'arm {s}: sleeve ends {sleeve_t:.2f} m along the arm; {len(bare)} bare-arm faces + {len(hand)} hand faces')
    skin_samples.append(cols[(t > sleeve_t + 0.04) & skin_like(cols)])
    targets += list(bare) + list(hand)

# Skin tone from the turnaround sheet: the bare forearms in the front view are evenly lit.
ref = bpy.data.images.load(os.path.join(ROOT, 'reference', 'front.png'))
rw, rh = ref.size
rpx = np.array(ref.pixels[:], np.float32).reshape(rh, rw, 4)[::-1, :, :3]  # top row first
bg = np.median(rpx[:10].reshape(-1, 3), axis=0)
ys, xs = np.where(np.abs(rpx - bg).max(axis=2) > 0.05)
cx = (xs.min() + xs.max()) / 2
top, bot = ys.min(), ys.max()
# Forearm band: 35-48 % down the figure, well outside the torso (> 26 % of the figure height from centre).
band = rpx[int(top + 0.35 * (bot - top)):int(top + 0.48 * (bot - top))]
cols_x = np.abs(np.arange(rw) - cx) > 0.26 * (bot - top)
cand = band[:, cols_x].reshape(-1, 3)
samples = cand[skin_like(cand)]
skin = np.median(samples, axis=0) if len(samples) > 200 else FALLBACK_SKIN
skin_lum = skin @ np.array([0.299, 0.587, 0.114], np.float32)
print(f'skin tone (sRGB) from {len(samples)} forearm pixels in reference/front.png: {skin.round(3)}')

changed = 0
for f in targets:
    px = face_pixels(f)
    if not len(px):
        continue
    c = tex[px[:, 0], px[:, 1], :3]
    # One even tone: skin-coloured texels keep a little of their light/dark variation, everything else
    # (shirt orange, dark fingertip edges) becomes the plain skin tone.
    lum = c @ np.array([0.299, 0.587, 0.114], np.float32)
    var = np.clip(lum / max(np.median(lum), 1e-3), 0.92, 1.06)
    new = np.where(skin_like(c)[:, None], skin * var[:, None], skin)
    tex[px[:, 0], px[:, 1], :3] = new
    changed += len(px)
print(f'repainted {changed} texels')

img.pixels[:] = tex.ravel()
img.filepath_raw = TEX
img.file_format = 'PNG'
img.save()
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print('SAVED', img.filepath_raw)
