# Step 18: tileable surface textures cut from the Red Square photos (plain Python + Pillow).
# Each crop is made seamless by blending it with a half-offset copy of itself, then saved for the game, which maps
# it in world space (look.js photoMaterial), so the Blender models need no UVs.
# Out: public/textures/redsquare/aggregate.jpg
# (Brick and cast stone stay procedural in look.js: the photos are shot at an angle, so their courses and joints
# would not line up when tiled; their colours are taken from IMG_4726 and IMG_4717.)
# Run: python art/scripts/18_textures.py
import os

from PIL import Image, ImageChops, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.path.dirname(ROOT)
SRC = os.path.join(PROJECT, 'Red Square')
OUT = os.path.join(PROJECT, 'public', 'textures', 'redsquare')
os.makedirs(OUT, exist_ok=True)

# name: (photo, crop box on a view `view_w` pixels wide, view_w, output size)
CROPS = {
    'aggregate': ('IMG_4713.jpg', (1100, 620, 1265, 785), 1659, 512),  # planter-slab rim, exposed aggregate
}


def seamless(im):
    """Blend with a copy shifted by half a tile, weighted toward the original in the middle (no seams on wrap)."""
    w, h = im.size
    shifted = ImageChops.offset(im, w // 2, h // 2)
    mask = Image.new('L', (w, h))
    px = mask.load()
    for y in range(h):
        for x in range(w):
            d = max(abs(x - w / 2) / (w / 2), abs(y - h / 2) / (h / 2))
            px[x, y] = int(255 * max(0.0, min(1.0, (1 - d) * 2.2)))
    mask = mask.filter(ImageFilter.GaussianBlur(w / 40))
    return Image.composite(im, shifted, mask)


for name, (photo, box, view_w, size) in CROPS.items():
    im = Image.open(os.path.join(SRC, photo)).convert('RGB')
    s = im.width / view_w
    crop = im.crop(tuple(int(v * s) for v in box)).resize((size, size), Image.Resampling.LANCZOS)
    crop = ImageEnhance.Color(crop).enhance(0.9)
    out = seamless(crop)
    out.save(os.path.join(OUT, name + '.jpg'), quality=88)
    print('wrote', name)
