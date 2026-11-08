# Step 3 (free): send the views to Tencent's Hunyuan3D-2mv Hugging Face Space and get the 3D SHAPE.
# Saves art/character/model_shape.glb (untextured). Colour comes next from 03c_project_texture.py,
# which projects the views onto it in Blender (the Space's own texture step fails: PyMeshLabException,
# and the single-image Space fails with NameError, as of 2026-11).
# Needs `pip install gradio_client` (not Blender). Run: python art/scripts/03_generate_hf.py [--swap]
# --swap puts the right view in the left slot, if the model comes out mirrored / with a face on the back.
import os
import shutil
import sys
from gradio_client import Client, handle_file

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference')
OUT = os.path.join(ROOT, 'character')
side = 'left' if '--swap' in sys.argv else 'right'
OCTREE = 380  # mesh detail (256 = standard, 512 = max)

client = Client('tencent/Hunyuan3D-2mv', token=os.environ.get('HF_TOKEN'))  # a token gives more free GPU time
print('sending front, back and right views (right view in the', side, 'slot)')
res = client.predict(
    caption=None,
    image=None,
    mv_image_front=handle_file(os.path.join(REF, 'front.png')),
    mv_image_back=handle_file(os.path.join(REF, 'back.png')),
    mv_image_left=handle_file(os.path.join(REF, 'right.png')) if side == 'left' else None,
    mv_image_right=handle_file(os.path.join(REF, 'right.png')) if side == 'right' else None,
    steps=50,
    guidance_scale=5.0,
    seed=1234,
    octree_resolution=OCTREE,
    check_box_rembg=True,
    num_chunks=8000,
    randomize_seed=False,
    api_name='/shape_generation',
)
shape, _html, stats, _seed = res
print('stats:', {k: stats.get(k) for k in ('number_of_faces', 'number_of_vertices', 'model')})
path = shape if isinstance(shape, str) else (shape.get('path') or shape.get('value'))
os.makedirs(OUT, exist_ok=True)
shutil.copy(path, os.path.join(OUT, 'model_shape.glb'))
print('saved', os.path.join(OUT, 'model_shape.glb'))
