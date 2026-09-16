"""Original snow fauna. Only writes snow-v1 and four named runtime GLBs."""
import bpy, math, json, sys, importlib.util, random
from pathlib import Path
from mathutils import Vector, Quaternion
ROOT=Path(__file__).resolve().parents[3];ASSET=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('bear_helpers',ROOT/'scripts/blender/build_bear.py');bear=importlib.util.module_from_spec(spec);spec.loader.exec_module(bear)
f=bear.fauna;V=f.V;S=f.Sculpt;smooth=f.smooth
CLIPS=bear.CLIPS
STRIDES={'lynx':(.72,1.),'yak':(.72,1.),'frost-spider':(.62,.9),'ice-golem':(.64,.92)}
def rig(kind):
    if kind in ['lynx','yak']:return bear.rig()
    data=bpy.data.armatures.new(kind+'_Skeleton');arm=bpy.data.objects.new(kind+'_Rig',data);bpy.context.scene.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    def bone(n,a,b,p):
        o=data.edit_bones.new(n);o.head=V(*a);o.tail=V(*b)
        if p:o.parent=data.edit_bones[p]
    bone('Root',(0,0,0),(0,.2,0),None)
    if kind=='frost-spider':
        bone('Hips',(0,.54,-.45),(0,.54,-.1),'Root');bone('Chest',(0,.54,-.1),(0,.54,.3),'Hips');bone('Head',(0,.54,.3),(0,.50,.60),'Chest')
        for side in [-1,1]:
            for i,z in enumerate([.40,.12,-.17,-.45]):
                p=f'Leg_{i}_{"L" if side<0 else "R"}';endz=z+(.5-i/3)*.75
                bone(p+'_Upper',(side*.20,.54,z),(side*(.77+.05*math.sin(i)),.75,endz),'Chest' if i<2 else 'Hips');bone(p+'_Lower',(side*(.77+.05*math.sin(i)),.75,endz),(side*1.05,.06,endz+.10),p+'_Upper');bone(p+'_Paw',(side*1.05,.06,endz+.10),(side*1.10,.02,endz+.14),p+'_Lower')
    else:
        bone('Hips',(0,.95,0),(0,1.22,0),'Root');bone('Chest',(0,1.22,0),(0,1.75,0),'Hips');bone('Head',(0,1.75,0),(0,2.02,.03),'Chest')
        for side,suffix in [(-1,'L'),(1,'R')]:
            p='Leg_'+suffix;bone(p+'_Upper',(side*.26,.98,0),(side*.29,.55,.10),'Hips');bone(p+'_Lower',(side*.29,.55,.10),(side*.29,.14,0),p+'_Upper');bone(p+'_Paw',(side*.29,.14,0),(side*.29,.09,.27),p+'_Lower')
            bone('Arm_'+suffix,(side*.49,1.65,0),(side*.78,1.12,.05),'Chest');bone('Fist_'+suffix,(side*.78,1.12,.05),(side*.85,.70,.14),'Arm_'+suffix)
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in arm.pose.bones:p.rotation_mode='QUATERNION'
    return arm

def model(kind,arm):
    fur=f.material('Snow_Coat',(.63,.70,.72),.9);node=fur.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='Coat';fur.node_tree.links.new(node.outputs['Color'],fur.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    dark=f.material('Obsidian',(.027,.049,.067),.67);ivory=f.material('Horn_Ivory',(.55,.62,.65),.72);ice=f.material('Glacier_Ice',(.12,.39,.52),.3,.15);glow=f.material('Frozen_Core',(.26,.85,.94),.3)
    bs=glow.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(.08,.55,.8,1);bs.inputs['Emission Strength'].default_value=.65
    objects=[]
    def part(name,sh,mat,bone=None,union=False,flat=False):
        o=sh.finish(name)
        if union:
            mod=o.modifiers.new('Continuous_anatomy','REMESH');mod.mode='VOXEL';mod.voxel_size=.034;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
            mod=o.modifiers.new('Relax','SMOOTH');mod.factor=.72;mod.iterations=3;bpy.ops.object.modifier_apply(modifier=mod.name)
            mod=o.modifiers.new('Budget','DECIMATE');mod.ratio=.55;bpy.ops.object.modifier_apply(modifier=mod.name)
        if flat:
            for p in o.data.polygons:p.use_smooth=False
        o.data.materials.append(mat);f.bind(o,arm,bone);objects.append(o)
        a=o.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT');o.data.color_attributes.active_color=a
        for v in o.data.vertices:
            x,y,h=v.co;z=-y
            if mat==fur:
                n=math.sin(x*17+math.sin(z*13)*2)*math.sin(z*18+h*14);spot=max(0,n-.10)*.85 if kind=='lynx' else 0
                base=Vector((.57,.64,.65) if kind=='lynx' else (.20,.27,.30));base*=1-spot
                if kind=='lynx':base=base.lerp(Vector((.82,.86,.84)),max(0,min(1,(.94-h)*2))*.50)
                else:base=base.lerp(Vector((.70,.75,.72)),max(0,min(1,(h-1.05)*3)))
                a.data[v.index].color=(*base,1)
            else:a.data[v.index].color=(1,1,1,1)
        return o
    def ell(name,c,r,mat,bone):
        s=S();s.ellipsoid(c,r);return part(name,s,mat,bone)
    def tube(name,pts,rs,mat,bone,n=8):
        s=S();s.tube(pts,rs,n);return part(name,s,mat,bone)
    conv=lambda p:(p.x,p.z,-p.y)
    if kind in ['lynx','yak']:
        s=S()
        shapes=[((0,.91,-.36),(.28,.26,.45)),((0,1.00,.18),(.30,.32,.42)),((0,1.15,.57),(.23,.24,.26)),((0,1.22,.78),(.23,.22,.21)),((0,1.10,.95),(.14,.10,.16))] if kind=='lynx' else [((0,.91,-.33),(.43,.43,.58)),((0,1.03,.12),(.46,.48,.53)),((0,1.23,.31),(.38,.43,.35)),((0,1.13,.58),(.31,.35,.32)),((0,1.12,.89),(.25,.26,.31)),((0,.99,1.10),(.20,.15,.19))]
        for c,r in shapes:s.ellipsoid(c,r)
        for side in ['L','R']:
            for which in ['Front','Hind']:
                p=which+'_'+side;b=arm.data.bones[p+'_Upper'];l=arm.data.bones[p+'_Lower'];foot=arm.data.bones[p+'_Paw'].tail_local
                s.tube([conv(b.head_local),conv(b.tail_local),conv(l.tail_local),conv(foot)],[.135 if kind=='lynx' else .17,.09,.067,.09]);s.ellipsoid((foot.x,.075,-foot.y+.015),(.125,.07,.15))
        part('Continuous_'+kind,s,fur,union=True)
        for side,suffix in [(-1,'L'),(1,'R')]:
            ell('Eye_socket',(side*.195,1.28,.905),(.030,.025,.028),dark,'Head');ell('Eye',(side*.202,1.285,.927),(.012,.013,.012),glow,'Head')
            if kind=='lynx':
                tube('Pointed_ear',[(side*.18,1.34,.73),(side*.22,1.51,.72),(side*.23,1.60,.71)],[.092,.05,.002],fur,'Ear_'+suffix)
                tube('Black_ear_tuft',[(side*.23,1.56,.71),(side*.25,1.73,.70)],[.026,.001],dark,'Ear_'+suffix,6)
                tube('Cheek_ruff',[(side*.17,1.15,.81),(side*.32,1.08,.77),(side*.35,1.01,.70)],[.11,.072,.001],fur,'Head')
            else:
                tube('Swept_horn',[(side*.21,1.30,.75),(side*.48,1.37,.75),(side*.65,1.57,.78),(side*.59,1.77,.87)],[.095,.081,.046,.002],ivory,'Head',10)
                ell('Low_ear',(side*.30,1.25,.65),(.16,.058,.10),fur,'Ear_'+suffix)
        ell('Nose',(0,1.095 if kind=='lynx' else 1.00,1.08 if kind=='lynx' else 1.255),(.073 if kind=='lynx' else .14,.048,.038),dark,'Head')
        ell('Jaw',(0,1.013,.98),(.14,.05,.17),fur,'Jaw')
        tube('Bobtail' if kind=='lynx' else 'Tail',[(0,.94,-.70),(0,.91,-.90),(0,.84,-1.03)],[.09,.07,.04],fur,'Tail_1')
        if kind=='yak':
            locks=S();rng=random.Random(17)
            for side in [-1,1]:
                for i in range(20):
                    z=-.67+i*.06;x=side*(.36+.035*rng.random());h=.82+.10*rng.random();locks.tube([(x*.92,h,z),(x,h-.23,z-.02),(x*.92,.31+.12*rng.random(),z-.035)],[.10,.075,.003],7)
            part('Shaggy_skirt',locks,fur)
            tube('Beard',[(0,.97,.92),(0,.70,.99),(0,.49,.95)],[.16,.11,.003],fur,'Head')
    elif kind=='frost-spider':
        ell('Crystal_abdomen',(0,.57,-.39),(.39,.30,.47),ice,'Hips');ell('Thorax',(0,.53,.15),(.30,.22,.30),dark,'Chest');ell('Head',(0,.47,.49),(.22,.16,.18),ice,'Head')
        for side in [-1,1]:
            for z in [.51,.61]:ell('Cold_eye',(side*.09,.57,z),(.035,.035,.035),glow,'Head')
            tube('Fang',[(side*.13,.43,.57),(side*.18,.27,.70),(side*.11,.19,.75)],[.06,.045,.002],ivory,'Head')
        for b in arm.data.bones:
            if b.name.startswith('Leg_'):
                tube(b.name,[conv(b.head_local),conv(b.tail_local)],[.062 if 'Upper' in b.name else .038,.038 if 'Upper' in b.name else .012],ice,b.name,7)
        for side in [-1,1]:
            for z in [-.65,-.40,-.17]:tube('Ice_spire',[(side*.17,.76,z),(side*.25,.98,z-.08)],[.11,.001],ivory,'Hips',5)
    else:
        def rock(name,c,r,bone,mat=ice):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=V(*c));o=bpy.context.object;o.scale=(r[0],r[2],r[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);s=S();s.parts=[o];return part(name,s,mat,bone,flat=True)
        rock('Pelvis',(0,1.02,0),(.37,.24,.25),'Hips');rock('Thorax',(0,1.48,0),(.61,.43,.32),'Chest');rock('Head',(0,1.95,.035),(.27,.29,.23),'Head');rock('Heart',(0,1.45,.29),(.14,.19,.07),'Chest',glow)
        for side,suffix in [(-1,'L'),(1,'R')]:
            rock('Shoulder',(side*.54,1.66,0),(.31,.28,.28),'Arm_'+suffix);rock('Forearm',(side*.79,1.12,.05),(.24,.31,.25),'Fist_'+suffix);rock('Fist',(side*.85,.79,.14),(.29,.29,.30),'Fist_'+suffix)
            rock('Thigh',(side*.27,.79,.04),(.24,.29,.23),'Leg_'+suffix+'_Upper');rock('Shin',(side*.29,.40,.035),(.18,.27,.19),'Leg_'+suffix+'_Lower');rock('Foot',(side*.29,.12,.14),(.22,.12,.34),'Leg_'+suffix+'_Paw')
            ell('Eye',(side*.095,1.99,.22),(.045,.027,.025),glow,'Head');tube('Shoulder_shard',[(side*.49,1.82,0),(side*.76,2.08,-.04)],[.16,.001],ivory,'Arm_'+suffix,5)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();body=bpy.context.object;body.name=kind+'_SkinnedMesh';return body

def pose(arm,kind,clip,t):
    if kind in ['lynx','yak']:
        bear.pose(arm,clip,t)
        if kind=='yak' and clip=='Death':
            root=arm.pose.bones['Root'];a=smooth((t-.08)/.70);m=Quaternion((0,1,0),-math.pi/2*a).to_matrix().to_4x4()@root.bone.matrix_local;m.translation=V(0,.75*a,0);root.matrix=m
        return
    for p in arm.pose.bones:p.location=(0,0,0);p.rotation_quaternion=(1,0,0,0);p.scale=(1,1,1)
    phase=t*math.tau;root=arm.pose.bones['Root'];spider=kind=='frost-spider';moving=clip in ['Walk','Run','Turn_Left','Turn_Right'];run=clip=='Run';turn=clip.startswith('Turn_')
    def move(x,h,z):root.location=root.bone.matrix_local.to_3x3().inverted()@V(x,h,z)
    hit=smooth((t-.36)/.32)*(1-smooth((t-.68)/.32));anticipation=smooth(t/.36)*(1-smooth((t-.38)/.30))
    if clip=='Death':
        a=smooth((t-.06)/.78)
        if spider:
            root.scale=(1,1,1)
            # Crouch thorax and abdomen; solve legs below so eight feet remain grounded.
            move(0,-.17*a,0)
            for name in ['Hips','Chest']:f.rotate_world(arm,name,(.08*a,0,0))
        else:
            q=Quaternion((1,0,0),math.pi/2*a);m=q.to_matrix().to_4x4()@root.bone.matrix_local;m.translation=V(0,.48*a,0);root.matrix=m
        f.rotate_world(arm,'Head',((-.35 if spider else .24)*a,0,.1*a))
        if not spider:
            for side in ['L','R']:f.rotate_world(arm,'Arm_'+side,(.25*a,0,.25*a));f.rotate_world(arm,'Fist_'+side,(-.3*a,0,0))
        if not spider:return
    if moving:move((.012 if spider else .035)*math.sin(phase),.008*math.cos(phase*2),0)
    if clip=='Idle':f.rotate_world(arm,'Chest',(.008*math.sin(phase),0,0));f.rotate_world(arm,'Head',(.009*math.sin(phase),0,.012*math.sin(phase)))
    if clip=='Attack':move(0,.035*anticipation,.16*hit);f.rotate_world(arm,'Chest',(-.12*anticipation+.13*hit,0,0));f.rotate_world(arm,'Head',(.15*hit,0,0))
    if clip=='Hit':f.rotate_world(arm,'Chest',(-.08*math.sin(math.pi*t)**2,0,0));f.rotate_world(arm,'Head',(.13*math.sin(math.pi*t)**2,0,0))
    if not spider:
        for side,suffix in [(-1,'L'),(1,'R')]:
            f.rotate_world(arm,'Arm_'+suffix,((.15*side*math.sin(phase) if moving else 0)-1.55*anticipation+.7*hit if clip=='Attack' and side==1 else (.15*side*math.sin(phase) if moving else 0),0,0))
            f.rotate_world(arm,'Fist_'+suffix,(-.5*anticipation if clip=='Attack' and side==1 else 0,0,0))
    bpy.context.view_layer.update()
    prefixes=[b.name[:-6] for b in arm.data.bones if b.name.endswith('_Upper')]
    for p in prefixes:
        side=-1 if p.endswith('L') else 1;i=int(p.split('_')[1]) if spider else 0;offset=(i%2)*.5+(0 if side<0 else .5);phaseleg=(t+offset)%1;forward=lift=lateral=0
        if moving:
            stance=.60 if run else .68;stride=STRIDES[kind][int(run)];span=stride*stance
            if phaseleg<stance:forward=span/2-stride*phaseleg
            else:
                u=(phaseleg-stance)/(1-stance);forward=f.mix(-span/2,span/2,smooth(u))-stride*(1-stance)*u*(1-u)*(1-2*u);lift=math.sin(u*math.pi)**2*(.13 if spider else .15)
            if turn:
                ankle=arm.data.bones[p+'_Lower'].tail_local;rotated=Quaternion((0,0,1),forward/stride*(1 if clip=='Turn_Left' else -1))@ankle;lateral=rotated.x-ankle.x;forward=ankle.y-rotated.y
        upper=arm.pose.bones[p+'_Upper'];lower=arm.pose.bones[p+'_Lower'];paw=arm.pose.bones[p+'_Paw'];hip=upper.head.copy();target=lower.bone.tail_local+V(lateral,lift,forward);axis=(target-hip).normalized();length=f.clamp((target-hip).length,abs(upper.bone.length-lower.bone.length)+.001,upper.bone.length+lower.bone.length-.002);target=hip+axis*length;a=upper.bone.length;b=lower.bone.length;along=(a*a-b*b+length*length)/(2*length)
        restKnee=upper.bone.tail_local-upper.bone.head_local;perp=(restKnee-axis*restKnee.dot(axis)).normalized();knee=hip+axis*along+perp*math.sqrt(max(0,a*a-along*along));f.aim_bone(arm,p+'_Upper',hip,knee);f.aim_bone(arm,p+'_Lower',knee,target);f.aim_bone(arm,p+'_Paw',target,target+paw.bone.tail_local-paw.bone.head_local)

def build(kind):
    bpy.ops.wm.read_factory_settings(use_empty=True);arm=rig(kind);body=model(kind,arm);scene=bpy.context.scene;scene.render.fps=30;actions={}
    for name,seconds in CLIPS:
        a=bpy.data.actions.new(name);a.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=a;frames=round(seconds*30)
        for frame in range(frames+1):
            scene.frame_set(frame);pose(arm,kind,name,frame/frames)
            for p in arm.pose.bones:p.keyframe_insert('location',frame=frame,group=p.name);p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
        actions[name]=a;print('ANIMATED',kind,name,flush=True)
    arm.animation_data.action=None
    for name,a in actions.items():
        tr=arm.animation_data.nla_tracks.new();tr.name=name;st=tr.strips.new(name,0,a);st.action_slot=a.slots[0];tr.mute=True
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=arm;scene.frame_start=0;scene.frame_end=84;out=ROOT/f'public/game/creatures/{kind}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_vertex_color='NAME',export_vertex_color_name='Coat',export_all_vertex_colors=False)
    arm.animation_data.action=actions['Idle'];arm.animation_data.action_slot=actions['Idle'].slots[0];scene.frame_set(0);f.ASSET=ASSET;f.studio(kind);scene.camera.data.ortho_scale=3.5 if kind!='ice-golem' else 3.9;scene.cycles.samples=12
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/f'{kind}.blend'));body.data.calc_loop_triangles();report={'type':kind,'bones':len(arm.data.bones),'vertices':len(body.data.vertices),'triangles':len(body.data.loop_triangles),'materials':len(body.data.materials),'unweighted':sum(not v.groups for v in body.data.vertices),'clips':dict(CLIPS),'strides':dict(zip(['walk','run'],STRIDES[kind])),'bytes':out.stat().st_size};(ASSET/f'{kind}-report.json').write_text(json.dumps(report,indent=2)+'\n');print('REPORT',report,flush=True);bpy.ops.render.render(write_still=True)
if __name__=='__main__':
    for kind in (sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(STRIDES)):build(kind)
