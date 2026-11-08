# Step 2: cut art/reference/turnaround.png (front | right side | back) into one image per view.
# Writes view_front/right/back.png (CHARACTER.md names) and front/right/back.png (Kaggle notebook names),
# all the same square size and scale, centred, feet at the same height, grey background kept.
# Run: blender.exe -b --python art/scripts/02_split_views.py
import os
import bpy
import numpy as np

REF = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'reference')
SRC = os.path.join(REF, 'turnaround.png')
NAMES = ['front', 'right', 'back']  # left to right on the sheet
THRESH = 0.09  # colour distance from the background that counts as character
MIN_GAP = 40  # px of empty columns that separate two views
MARGIN = 0.06  # empty border around the character, as a fraction of the canvas

img = bpy.data.images.load(SRC)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, img.channels)[::-1, :, :3]  # top row first

# Background colour from the sheet's border, then a mask of everything that differs from it.
border = np.concatenate([px[:20].reshape(-1, 3), px[-20:].reshape(-1, 3), px[:, :20].reshape(-1, 3), px[:, -20:].reshape(-1, 3)])
bg = np.median(border, axis=0)
mask = np.abs(px - bg).max(axis=2) > THRESH
cols = mask.sum(axis=0) > 3
rows_any = mask.sum(axis=1) > 3

# Runs of occupied columns, merging runs closer than MIN_GAP (fingers, hair tips).
runs, start, last = [], None, None
for x in range(w):
    if cols[x]:
        if start is None:
            start = x
        elif x - last > MIN_GAP:
            runs.append((start, last))
            start = x
        last = x
if start is not None:
    runs.append((start, last))
runs = [r for r in runs if r[1] - r[0] > 50]  # drop specks
print('views found (x ranges):', runs)
assert len(runs) == 3, f'expected 3 views, found {len(runs)}: {runs}'

# One shared vertical range so all views keep the same scale and floor line.
ys = [np.where(mask[:, a:b + 1].any(axis=1))[0] for a, b in runs]
top, bottom = min(y.min() for y in ys), max(y.max() for y in ys)
span_h = bottom - top + 1
span_w = max(b - a + 1 for a, b in runs)
side = int(max(span_h, span_w) / (1 - 2 * MARGIN))

for name, (a, b) in zip(NAMES, runs):
    canvas = np.empty((side, side, 3), dtype=np.float32)
    canvas[:] = bg
    crop = px[top:bottom + 1, a:b + 1]
    oy = (side - span_h) // 2
    ox = (side - crop.shape[1]) // 2
    canvas[oy:oy + span_h, ox:ox + crop.shape[1]] = crop
    rgba = np.concatenate([canvas, np.ones((side, side, 1), np.float32)], axis=2)[::-1]  # back to bottom-up
    out = bpy.data.images.new(name, side, side)
    out.pixels[:] = rgba.ravel()
    for fname in (f'view_{name}.png', f'{name}.png'):
        out.filepath_raw = os.path.join(REF, fname)
        out.file_format = 'PNG'
        out.save()
    print(f'{name}: x {a}-{b}, saved {side}x{side}')
