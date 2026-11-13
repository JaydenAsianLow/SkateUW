# Step 19: cut the two monolith banners out of the reference photo IMG_4722 and flatten their perspective.
# Out: art/textures/banner_huskies.jpg, art/textures/banner_uw.jpg (used by 26_landmarks.py).
# Run with normal Python (Pillow): python art/scripts/19_banners.py
import os

from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(ROOT), 'Red Square', 'IMG_4722.jpg')
OUT = os.path.join(ROOT, 'textures')
os.makedirs(OUT, exist_ok=True)

img = Image.open(SRC).convert('RGB')
k = img.width / 1659  # corners below were picked on a 1659-px-wide view of the photo
# corners: upper-left, lower-left, lower-right, upper-right
BANNERS = {
    'banner_huskies': [(724, 447), (708, 1403), (852, 1401), (836, 445)],
    'banner_uw': [(981, 575), (1030, 1450), (1246, 1446), (1146, 573)],
}
for name, quad in BANNERS.items():
    data = [c * k for p in quad for c in p]
    out = img.transform((192, 1536), Image.Transform.QUAD, data, Image.Resampling.BICUBIC)
    out = ImageEnhance.Contrast(out).enhance(1.12)  # overcast photo -> a little more punch in the game's sun
    out.save(os.path.join(OUT, name + '.jpg'), quality=90)
    print('wrote', name)
