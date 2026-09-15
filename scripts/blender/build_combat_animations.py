"""Build a skeleton-only motion library; never overwrites character/equipment assets."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
ASSET=ROOT/'art/animations/class-combat-v1'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/characters/ashen-warrior-v1/ashen-warrior-v1.blend'))
scene=bpy.context.scene
arm=next(o for o in scene.objects if o.type=='ARMATURE')
for obj in list(scene.objects):
    if obj!=arm:bpy.data.objects.remove(obj,do_unlink=True)
arm.animation_data_clear()
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
actions={};report={}
for name,filename in [('Bow_Recoil','bow-recoil'),('Bow_Draw','bow-draw'),('Mage_Cast','mage-cast'),('Mage_Pulse','mage-pulse')]:
    before=set(scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(ASSET/f'source/{filename}.fbx'))
    imported=set(scene.objects)-before
    source=next(o for o in imported if o.type=='ARMATURE')
    assert set(source.data.bones.keys())==set(arm.data.bones.keys()), 'Incompatible motion skeleton'
    action=source.animation_data.action;action.name=name;action.use_fake_user=True
    bag=action.layers[0].strips[0].channelbag(source.animation_data.action_slot)
    for curve in bag.fcurves:
        if curve.data_path=='pose.bones["mixamorig:Hips"].location' and curve.array_index in [0,2]:
            for key in curve.keyframe_points:key.co.y=key.handle_left.y=key.handle_right.y=0
    actions[name]=action
    report[name]={'source':filename+'.fbx','frames':list(action.frame_range),'seconds':(action.frame_range.y-action.frame_range.x)/30}
    for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
arm.animation_data_create()
for name,action in actions.items():
    track=arm.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,1,action);strip.action_slot=action.slots[0];track.mute=True
scene.render.fps=30;scene.frame_start=1;scene.frame_end=120
bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'class-combat-v1.blend'))
out=ROOT/'public/game/characters/class-combat-v1.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_optimize_animation_size=True,export_cameras=False,export_lights=False)
report['glbBytes']=out.stat().st_size;report['bones']=len(arm.data.bones)
(ASSET/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
