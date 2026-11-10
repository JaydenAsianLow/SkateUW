# Take only the animation from a Mixamo FBX (drop its mesh) and export skeleton + clip as a GLB for the game.
# Run: blender -b --python art/scripts/14_skate_anim.py -- art/character/Skateboarding.fbx public/models/skater/anims/Skateboarding.glb skate
import bpy, sys, os

src, out, name = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.abspath(src))
for o in [o for o in bpy.context.scene.objects if o.type != 'ARMATURE']:
    bpy.data.objects.remove(o, do_unlink=True)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
act = arm.animation_data.action
act.name = name
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(out), export_format='GLB', use_selection=True,
                          export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_skins=True,
                          export_yup=True, export_force_sampling=True)
print('EXPORTED', out, act.name, act.frame_range[:])
