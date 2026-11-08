# Smoke test: can Blender build and render a scene with no window? Writes art/renders/00_smoke.png.
import bpy, os
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'renders', '00_smoke.png')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_monkey_add(location=(0, 0, 0))
bpy.ops.object.shade_smooth()
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
bpy.context.scene.collection.objects.link(cam)
cam.location = (0, -4, 0.5); cam.rotation_euler = (1.45, 0, 0)
bpy.context.scene.camera = cam
light = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
bpy.context.scene.collection.objects.link(light); light.rotation_euler = (0.8, 0.2, 0.5)
for engine in ('BLENDER_WORKBENCH', 'CYCLES'):
    s = bpy.context.scene
    s.render.engine = engine
    s.render.resolution_x = s.render.resolution_y = 256
    if engine == 'CYCLES':
        s.cycles.device = 'CPU'; s.cycles.samples = 8
    s.render.filepath = out.replace('.png', f'_{engine.lower()}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDER OK', engine, s.render.filepath)
