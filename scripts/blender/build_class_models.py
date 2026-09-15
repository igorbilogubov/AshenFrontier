"""Export separate archer/mage assets; the warrior keeps modular equipment."""
import bpy,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from mixamo_common import import_on_rig,joined
ROOT=Path(__file__).resolve().parents[2];ASSET=ROOT/'art/characters/mixamo-classes-v1'
reports={}
for class_id,filename,prefix in [('archer','erika-archer-tpose.fbx','ErikaArcher'),('mage','dreyar-tpose.fbx','Dreyar')]:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/characters/ashen-warrior-v1/ashen-warrior-v1.blend'))
    scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE')
    action=arm.animation_data.action;slot=arm.animation_data.action_slot;arm.animation_data.action=None;arm.data.pose_position='REST'
    for obj in list(scene.objects):
        if obj.type=='MESH' and not obj.name.startswith('Weapon_'):bpy.data.objects.remove(obj,do_unlink=True)
        else:obj.hide_set(False);obj.hide_render=False
    model=joined(import_on_rig(ASSET/'source'/filename,arm,prefix),'Class_Body');model['classId']=class_id
    arm.data.pose_position='POSE'
    objects=[o for o in scene.objects if o.type in ['MESH','ARMATURE']]
    for o in scene.objects:o.select_set(False)
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=arm
    out=ROOT/f'public/game/characters/ashen-{class_id}-v1.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_optimize_animation_size=True,export_materials='EXPORT',export_image_format='JPEG',export_jpeg_quality=88,export_extras=True,export_cameras=False,export_lights=False)
    model.data.calc_loop_triangles()
    reports[class_id]={'source':filename,'bones':len(arm.data.bones),'triangles':len(model.data.loop_triangles),'glbBytes':out.stat().st_size,'unweighted':sum(not v.groups for v in model.data.vertices)}
    arm.animation_data.action=action;arm.animation_data.action_slot=slot;scene.frame_set(1)
    for o in objects:
        if o.name.startswith('Weapon_'):o.hide_render=True;o.hide_set(True)
    scene.render.resolution_x=700;scene.render.resolution_y=850;scene.cycles.samples=12
    (ASSET/'renders').mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/f'ashen-{class_id}-v1.blend'))
    scene.render.filepath=str(ASSET/f'renders/{class_id}.png');bpy.ops.render.render(write_still=True)
(ASSET/'build-report.json').write_text(json.dumps(reports,indent=2)+'\n')
print('CLASS_MODELS',json.dumps(reports))
