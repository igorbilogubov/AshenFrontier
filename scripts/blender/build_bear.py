"""Original forest bear: reproducible Blender source, skin, texture and eight clips.

Only writes ashen-bear-v1 and bear.glb. Coordinates are (right, up, forward).
Uses project sculpt/IK/export helpers; never regenerates the original fauna.
"""
import bpy, math, random, json, sys, importlib.util
from pathlib import Path
from mathutils import Vector, Quaternion
from mathutils.noise import noise_vector

ROOT=Path(__file__).resolve().parents[2]
ASSET=ROOT/'art/creatures/ashen-bear-v1'
OUT=ROOT/'public/game/creatures/bear.glb'
spec=importlib.util.spec_from_file_location('fauna_helpers',ROOT/'scripts/blender/build_creatures.py')
fauna=importlib.util.module_from_spec(spec)
old_argv=sys.argv;sys.argv=[str(spec.origin),'--']
try:spec.loader.exec_module(fauna)
finally:sys.argv=old_argv
V=fauna.V;Sculpt=fauna.Sculpt;smooth=fauna.smooth;mix=fauna.mix
rotate=fauna.rotate_world;solve=fauna.solve_leg
CLIPS=[('Idle',2.8),('Walk',1.6),('Run',.9),('Attack',1.2),('Hit',.5),('Death',1.6),('Turn_Left',1.6),('Turn_Right',1.6)]

def rig():
    data=bpy.data.armatures.new('Bear_Skeleton');arm=bpy.data.objects.new('Bear_Rig',data);bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,a,b,parent=None):
        p=data.edit_bones.new(name);p.head=V(*a);p.tail=V(*b)
        if parent:p.parent=data.edit_bones[parent]
    bone('Root',(0,0,0),(0,.2,0))
    bone('Hips',(0,.88,-.47),(0,.98,-.08),'Root')
    bone('Chest',(0,.98,-.08),(0,1.10,.36),'Hips')
    bone('Neck',(0,1.10,.36),(0,1.17,.62),'Chest')
    bone('Head',(0,1.17,.62),(0,1.12,1.03),'Neck')
    bone('Jaw',(0,1.04,.75),(0,.98,1.13),'Head')
    bone('Tail_1',(0,.93,-.79),(0,.91,-.93),'Hips')
    bone('Tail_2',(0,.91,-.93),(0,.87,-1.0),'Tail_1')
    for side,suffix in [(-1,'L'),(1,'R')]:
        x=.285*side
        for front in [True,False]:
            p=('Front' if front else 'Hind')+'_'+suffix
            z=.39 if front else -.46
            hip=(x,1.01 if front else .85,z)
            knee=(x,.50,z-.17) if front else (x,.46,z+.17)
            ankle=(x,.13,z+.015) if front else (x,.16,z-.10)
            toe=(x,.075,z+.19) if front else (x,.075,z+.04)
            bone(p+'_Upper',hip,knee,'Chest' if front else 'Hips')
            bone(p+'_Lower',knee,ankle,p+'_Upper')
            bone(p+'_Paw',ankle,toe,p+'_Lower')
            if not front:bone(p+'_Toe',toe,(x,.07,z+.14),p+'_Paw')
        bone('Ear_'+suffix,(side*.205,1.31,.64),(side*.25,1.48,.64),'Head')
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in arm.pose.bones:p.rotation_mode='QUATERNION'
    return arm

def coat(obj,detail=False):
    attr=obj.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
    dark=Vector((.045,.023,.014));brown=Vector((.19,.082,.032));gold=Vector((.34,.19,.081))
    for v in obj.data.vertices:
        x,y,h=v.co;z=-y
        mantle=smooth((h-.96)/.40)*(1-smooth((z-.49)/.30))
        snout=smooth((z-.76)/.36)*smooth((h-.87)/.12)
        legs=(1-smooth((h-.23)/.42))*.66
        noise=noise_vector(v.co*10)[0];grain=noise_vector(Vector((x*65,y*15,h*65)))[1]
        c=brown.lerp(gold,mantle*.40).lerp(dark,legs).lerp(gold,snout*.82)
        c*=1+noise*.20+grain*.10
        if detail:c*=.85
        attr.data[v.index].color=(*c,1)
    obj.data.color_attributes.active_color=attr
    uv=obj.data.uv_layers.new(name='FurUV')
    for p in obj.data.polygons:
        axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in p.loop_indices:
            co=obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv=(co[axes[0]]*2,co[axes[1]]*2)

def fur_material():
    m=fauna.fur_material();im=bpy.data.images.get('Fur_grain');im.scale(256,256)
    rng=random.Random(917);pixels=[]
    # Short layered fur strokes, finer than coat colour; fully embedded texture.
    columns=[rng.uniform(0,math.tau) for _ in range(256)]
    for y in range(256):
        for x in range(256):
            stroke=math.sin(y*.24+columns[x]+math.sin(y*.04)*1.5)
            val=.80+.12*stroke+.08*rng.random();pixels.extend((val,val,val,1))
    im.pixels=pixels;im.pack();return m

def model(arm):
    s=Sculpt()
    # Continuous sloping back, shoulder hump, deep belly and short broad muzzle.
    for c,r in [((0,.88,-.48),(.36,.36,.43)),((0,.91,-.12),(.365,.36,.55)),((0,1.00,.24),(.41,.44,.42)),((0,1.16,.35),(.32,.34,.29)),((0,1.16,.57),(.29,.30,.28)),((0,1.20,.77),(.245,.225,.265)),((0,1.085,.99),(.17,.12,.255)),((0,1.065,1.145),(.13,.085,.10))]:s.ellipsoid(c,r)
    for side in [-1,1]:
        s.ellipsoid((side*.28,.80,.29),(.20,.29,.23))
        s.ellipsoid((side*.27,.66,-.43),(.19,.29,.23))
        s.ellipsoid((side*.176,1.289,.889),(.071,.035,.081))
    conv=lambda p:(p.x,p.z,-p.y)
    for suffix in ['L','R']:
        for front in [True,False]:
            p=('Front' if front else 'Hind')+'_'+suffix
            upper=arm.data.bones[p+'_Upper'];lower=arm.data.bones[p+'_Lower'];paw=arm.data.bones[p+'_Paw']
            a,b,c=map(conv,[upper.head_local,upper.tail_local,lower.tail_local]);foot=conv(paw.tail_local)
            s.tube([a,b,c,(foot[0],.075,foot[2])],[.17 if front else .19,.115,.085,.092])
            s.ellipsoid((foot[0],.071,foot[2]+.015),(.115,.066,.17 if front else .16))
    # Broader voxel union than canine helpers; keeps geometry bounded.
    body=s.finish('Bear_Coat')
    mod=body.modifiers.new('Continuous_anatomy','REMESH');mod.mode='VOXEL';mod.voxel_size=.027;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=body.modifiers.new('Relax_surface','SMOOTH');mod.factor=.75;mod.iterations=4;bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=body.modifiers.new('Game_topology','DECIMATE');mod.ratio=.47;bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in body.data.polygons:p.use_smooth=True
    fur=fur_material();body.data.materials.append(fur);coat(body);fauna.bind(body,arm);objects=[body]
    dark=fauna.material('Nose_Claws',(.020,.013,.010),.63)
    mouth=fauna.material('Mouth_Inner',(.075,.027,.018),.94)
    ivory=fauna.material('Worn_Ivory',(.49,.36,.20),.82)
    eye=fauna.material('Dark_Amber_Eyes',(.19,.069,.010),.25)
    def detail(name,s,mat,bone):
        o=s.finish(name);o.data.materials.append(mat);fauna.bind(o,arm,bone);objects.append(o)
        if mat==fur:coat(o)
        return o
    jaw=Sculpt();jaw.ellipsoid((0,.977,.99),(.15,.059,.20));detail('Lower_Jaw',jaw,fur,'Jaw')
    lip=Sculpt();lip.ellipsoid((0,1.019,1.035),(.151,.016,.185));detail('Mouth',lip,mouth,'Jaw')
    nose=Sculpt();nose.ellipsoid((0,1.093,1.239),(.108,.066,.04));detail('Broad_Nose',nose,dark,'Head')
    for side,suffix in [(-1,'L'),(1,'R')]:
        ears=Sculpt();ears.ellipsoid((side*.228,1.414,.645),(.095,.107,.055));detail('Round_Ear_'+suffix,ears,fur,'Ear_'+suffix)
        ears=Sculpt();ears.ellipsoid((side*.230,1.416,.694),(.058,.072,.012));detail('Ear_Inner_'+suffix,ears,mouth,'Ear_'+suffix)
        socket=Sculpt();socket.ellipsoid((side*.195,1.245,.925),(.043,.029,.047));detail('Deep_Eye_Socket_'+suffix,socket,dark,'Head')
        eyeball=Sculpt();eyeball.ellipsoid((side*.214,1.249,.950),(.018,.014,.016));detail('Eye_'+suffix,eyeball,eye,'Head')
        pupil=Sculpt();pupil.ellipsoid((side*.223,1.249,.960),(.006,.010,.006));detail('Pupil_'+suffix,pupil,dark,'Head')
        teeth=Sculpt()
        for z in [.96,1.12]:teeth.tube([(side*.108,1.027,z),(side*.105,.965,z+.012)],[.020,.002],8)
        detail('Teeth_'+suffix,teeth,ivory,'Head')
        for front in [True,False]:
            p=('Front' if front else 'Hind')+'_'+suffix;foot=arm.data.bones[p+'_Paw'].tail_local
            claws=Sculpt()
            for offset in [-.075,-.038,0,.038,.075]:
                z=-foot.y+.151-(abs(offset)*.20)
                claws.tube([(foot.x+offset,.055,z),(foot.x+offset,.043,z+.045),(foot.x+offset,.025,z+.066)],[.016,.011,.002],6)
            detail('Five_Claws_'+p,claws,ivory,p+'_Paw' if front else p+'_Toe')
    tail=Sculpt();tail.ellipsoid((0,.90,-.92),(.102,.095,.13));detail('Short_Tail',tail,fur,'Tail_1')
    # Layered locks break shoulder, flank and cheek silhouette without hair cards.
    locks=Sculpt();rng=random.Random(815)
    for i in range(42):
        side=-1 if i%2 else 1
        if i<26:
            # Side shoulder fringe: broad embedded root, short flat tapered end.
            z=rng.uniform(.10,.44);x=side*rng.uniform(.32,.37);h=rng.uniform(.88,1.21)
        else:
            z=rng.uniform(.52,.75);x=side*rng.uniform(.21,.245);h=rng.uniform(1.07,1.24)
        locks.tube([(x*.87,h,z),(x*.99,h-.022,z-.028),(x*1.06,h-.053,z-.070)],[.036,.024,.001],6)
    o=locks.finish('Layered_Coat_Locks');o.data.materials.append(fur);coat(o,True);fauna.bind(o,arm,candidates=['Hips','Chest','Neck','Head']);objects.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=body;bpy.ops.object.join();body.name='bear_SkinnedMesh'
    for attr in list(body.data.color_attributes):
        if attr.name!='Coat':body.data.color_attributes.remove(attr)
    colors=body.data.color_attributes['Coat'];body.data.color_attributes.active_color=colors
    for p in body.data.polygons:
        if body.data.materials[p.material_index]!=fur:
            for vi in p.vertices:colors.data[vi].color=(1,1,1,1)
    return body

def pose(arm,clip,t):
    for p in arm.pose.bones:p.location=(0,0,0);p.rotation_quaternion=(1,0,0,0);p.scale=(1,1,1)
    root=arm.pose.bones['Root'];phase=t*math.tau
    locomotion=clip in ['Walk','Run','Turn_Left','Turn_Right'];run=clip=='Run';turn=clip.startswith('Turn_')
    def root_move(x,h,z):root.location=root.bone.matrix_local.to_3x3().inverted()@V(x,h,z)
    if locomotion:
        root_move((.016 if run else .025)*math.sin(phase),(.021 if run else .009)*math.cos(phase*2),0)
        rotate(arm,'Hips',(.018*math.sin(phase),0,.021*math.sin(phase)))
        rotate(arm,'Chest',(-.018*math.sin(phase),0,-.018*math.sin(phase)))
        rotate(arm,'Neck',(.024*math.sin(phase+.4),0,0));rotate(arm,'Head',(-.024*math.sin(phase+.4),0,.008*math.sin(phase)))
    elif clip=='Idle':
        rotate(arm,'Chest',(.007*math.sin(phase),0,0));rotate(arm,'Neck',(.009*math.sin(phase+.2),0,0));rotate(arm,'Head',(-.01*math.sin(phase+.2),0,.012*math.sin(phase)))
    elif clip=='Attack':
        # Draw the near paw back, shift onto three supports, then swipe forward.
        anticipation=smooth(t/.36)*(1-smooth((t-.38)/.30))
        impact=smooth((t-.36)/.32)*(1-smooth((t-.68)/.32))
        root_move(-.05*anticipation,.035*anticipation,.12*impact)
        rotate(arm,'Chest',(-.07*anticipation+.035*impact,0,-.08*anticipation+.055*impact))
        rotate(arm,'Neck',(.10*anticipation-.07*impact,0,0));rotate(arm,'Head',(-.06*impact,0,-.06*impact))
        rotate(arm,'Jaw',(.28*(anticipation+impact),0,0))
    elif clip=='Hit':
        f=math.sin(t*math.pi)**2;rotate(arm,'Chest',(.045*f,.025*f,0));rotate(arm,'Head',(-.10*f,0,.09*f));rotate(arm,'Jaw',(.08*f,0,0))
    elif clip=='Death':
        f=smooth((t-.08)/.70);q=Quaternion((0,1,0),-math.pi/2*f)
        m=q.to_matrix().to_4x4()@root.bone.matrix_local;m.translation=V(0,.48*f,0);root.matrix=m
        rotate(arm,'Neck',(.14*f,0,0));rotate(arm,'Head',(.16*f,0,-.08*f));rotate(arm,'Jaw',(.16*f,0,0))
        for side in ['L','R']:
            for front in [True,False]:
                p=('Front' if front else 'Hind')+'_'+side
                rotate(arm,p+'_Upper',((.23 if front else -.27)*f,0,0));rotate(arm,p+'_Lower',((-.35 if front else .36)*f,0,0))
        return
    for side in ['L','R']:rotate(arm,'Ear_'+side,(.018*math.sin(phase+.4),0,0))
    bpy.context.view_layer.update()
    # Bears use a lumbering four-beat walk and compact diagonal running steps.
    offsets={'Front_L':0,'Front_R':.5,'Hind_L':.5 if run else .25,'Hind_R':0 if run else .75}
    for p,offset in offsets.items():
        front=p.startswith('Front');forward=lift=lateral=pitch=yaw=0
        if locomotion:
            f=(t+offset)%1;stance=.58 if run else .70;stride=1.00 if run else .72;span=stride*stance;swing=0
            if f<stance:forward=span/2-stride*f
            else:
                swing=(f-stance)/(1-stance)
                forward=mix(-span/2,span/2,smooth(swing))-stride*(1-stance)*swing*(1-swing)*(1-2*swing)
                lift=math.sin(swing*math.pi)**2*(.105 if run else .085)
            pitch=.10*math.sin(math.pi*swing)**2
            if turn:
                yaw=forward/stride*(1 if clip=='Turn_Left' else -1)
                ankle=arm.data.bones[p+'_Lower'].tail_local;rotated=Quaternion((0,0,1),yaw)@ankle
                lateral=rotated.x-ankle.x;forward=ankle.y-rotated.y;lift*=.8
        elif clip=='Attack' and p=='Front_R':
            a=smooth(t/.36)*(1-smooth((t-.38)/.30));hit=smooth((t-.36)/.32)*(1-smooth((t-.68)/.32))
            forward=-.22*a+.43*hit;lift=.36*a+.16*hit;lateral=.13*a-.11*hit;pitch=-.30*a+.12*hit
        solve(arm,p,forward,lift,front,True,lateral,pitch,yaw)

def animate(arm):
    actions={};scene=bpy.context.scene;scene.render.fps=30
    for name,seconds in CLIPS:
        a=bpy.data.actions.new(name);a.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=a
        frames=round(seconds*30)
        for frame in range(frames+1):
            scene.frame_set(frame);pose(arm,name,frame/frames)
            for p in arm.pose.bones:
                p.keyframe_insert('location',frame=frame,group=p.name);p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
        actions[name]=a;print('ANIMATED bear',name,flush=True)
    arm.animation_data.action=None
    for name,a in actions.items():
        track=arm.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,a);strip.action_slot=a.slots[0];track.mute=True
    return actions

def build():
    ASSET.mkdir(parents=True,exist_ok=True);(ASSET/'renders').mkdir(exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;arm=rig();body=model(arm);actions=animate(arm)
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=arm
    scene.frame_start=0;scene.frame_end=84
    bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_image_format='AUTO',export_vertex_color='NAME',export_vertex_color_name='Coat',export_all_vertex_colors=False)
    arm.animation_data.action=actions['Idle'];arm.animation_data.action_slot=actions['Idle'].slots[0];scene.frame_set(0)
    fauna.ASSET=ASSET;fauna.studio('bear');scene.camera.data.ortho_scale=3.6
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'bear.blend'))
    body.data.calc_loop_triangles()
    report={'type':'bear','bones':len(arm.data.bones),'vertices':len(body.data.vertices),'triangles':len(body.data.loop_triangles),'materials':len(body.data.materials),'unweighted':sum(not v.groups for v in body.data.vertices),'clips':dict(CLIPS),'attackContact':.68,'strides':{'walk':.72,'run':1.0},'bytes':OUT.stat().st_size}
    (ASSET/'bear-report.json').write_text(json.dumps(report,indent=2)+'\n');print('REPORT',json.dumps(report),flush=True)
    bpy.ops.render.render(write_still=True)

if __name__=='__main__':build()
