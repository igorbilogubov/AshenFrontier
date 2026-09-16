"""Original wasteland fauna; only writes wasteland-v1 and its four runtime GLBs."""
import bpy, math, json, sys, importlib.util
from pathlib import Path
from mathutils import Vector, Quaternion
ROOT=Path(__file__).resolve().parents[3];ASSET=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('snow_helpers',ROOT/'art/creatures/snow-v1/build.py');snow=importlib.util.module_from_spec(spec);spec.loader.exec_module(snow)
f=snow.f;S=f.Sculpt;V=f.V;smooth=f.smooth;CLIPS=snow.CLIPS
STRIDES={'ash-jackal':(.72,1.),'scorpion':(.52,.76),'monitor-lizard':(.58,.82),'scarab':(.54,.78)}
def rig(kind):
    if kind=='ash-jackal':return snow.bear.rig()
    data=bpy.data.armatures.new(kind+'_Skeleton');arm=bpy.data.objects.new(kind+'_Rig',data);bpy.context.scene.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    def b(n,a,z,p):
        q=data.edit_bones.new(n);q.head=V(*a);q.tail=V(*z)
        if p:q.parent=data.edit_bones[p]
    b('Root',(0,0,0),(0,.2,0),None)
    monitor=kind=='monitor-lizard';height=.43 if monitor else .49
    b('Hips',(0,height,-.53),(0,height,-.08),'Root');b('Chest',(0,height,-.08),(0,height,.42),'Hips');b('Head',(0,height,.42),(0,height*.9,.95 if monitor else .73),'Chest');b('Jaw',(0,height*.73,.55),(0,height*.65,.96 if monitor else .82),'Head')
    pairs=2 if monitor else 4 if kind=='scorpion' else 3
    for side,suffix in [(-1,'L'),(1,'R')]:
        for i in range(pairs):
            z=.36-i*(.72/(pairs-1));p=f'Leg_{i}_{suffix}';endz=z+(.5-i/(pairs-1))*.45
            knee=(side*(1.0 if monitor else .68),height*.68 if monitor else height+.20,endz);b(p+'_Upper',(side*.25,height,z),knee,'Chest' if i<pairs/2 else 'Hips');b(p+'_Lower',knee,(side*.89,.08,endz+.1),p+'_Upper');b(p+'_Paw',(side*.89,.08,endz+.1),(side*.97,.035,endz+.2),p+'_Lower')
        if kind=='scorpion':
            b('Claw_'+suffix,(side*.20,.49,.45),(side*.60,.38,.90),'Chest');b('Pincer_'+suffix,(side*.60,.38,.90),(side*.65,.30,1.35),'Claw_'+suffix)
    if monitor:
        b('Tail_1',(0,.43,-.65),(0,.31,-1.12),'Hips');b('Tail_2',(0,.31,-1.12),(0,.18,-1.65),'Tail_1');b('Tail_3',(0,.18,-1.65),(0,.10,-2.15),'Tail_2')
    elif kind=='scorpion':
        pts=[(0,.49,-.56),(0,.63,-.93),(0,1.00,-1.12),(0,1.38,-1.05),(0,1.59,-.75),(0,1.50,-.42)]
        for i in range(5):b('Tail_'+str(i+1),pts[i],pts[i+1],'Hips' if i==0 else 'Tail_'+str(i))
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in arm.pose.bones:p.rotation_mode='QUATERNION'
    return arm

def model(kind,arm):
    coat=f.material('Earth_Coat',(.43,.31,.16),.9);n=coat.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Coat';coat.node_tree.links.new(n.outputs['Color'],coat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    shell=f.material('Weathered_Chitin',(.16,.21,.18) if kind=='scarab' else (.11,.095,.078),.52,.12);ivory=f.material('Worn_Horn',(.51,.39,.22),.8);dark=f.material('Dark_Claws',(.023,.028,.025),.65);eye=f.material('Amber_Eyes',(.8,.35,.06),.45)
    objects=[]
    def part(name,s,mat,bone=None,union=False):
        o=s.finish(name)
        if union:
            mod=o.modifiers.new('Continuous_anatomy','REMESH');mod.mode='VOXEL';mod.voxel_size=.029;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
            mod=o.modifiers.new('Relax','SMOOTH');mod.factor=.7;mod.iterations=3;bpy.ops.object.modifier_apply(modifier=mod.name)
            mod=o.modifiers.new('Budget','DECIMATE');mod.ratio=.55;bpy.ops.object.modifier_apply(modifier=mod.name)
        o.data.materials.append(mat);f.bind(o,arm,bone);objects.append(o);a=o.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT');o.data.color_attributes.active_color=a
        for v in o.data.vertices:
            x,y,h=v.co;z=-y;c=Vector((.43,.31,.18) if kind=='ash-jackal' else (.25,.30,.17))
            if kind=='ash-jackal':c=c.lerp(Vector((.065,.079,.076)),smooth((h-.91)/.3)*.8).lerp(Vector((.64,.53,.33)),smooth((.75-h)/.35)*.55)
            else:c=c.lerp(Vector((.58,.47,.25)),smooth(math.sin(z*14+x*18)-.1)*.4)
            c*=.93+.07*math.sin(x*47+z*29+h*53);a.data[v.index].color=(*c,1) if mat==coat else (1,1,1,1)
        return o
    def ell(n,c,r,m,b):s=S();s.ellipsoid(c,r);return part(n,s,m,b)
    def tube(n,pts,rs,m,b,nside=8):s=S();s.tube(pts,rs,nside);return part(n,s,m,b)
    conv=lambda p:(p.x,p.z,-p.y)
    if kind=='ash-jackal':
        s=S()
        for c,r in [((0,.94,-.34),(.22,.27,.47)),((0,1.05,.17),(.255,.34,.37)),((0,1.19,.58),(.17,.22,.28)),((0,1.25,.78),(.18,.18,.24)),((0,1.13,1.05),(.105,.095,.25))]:s.ellipsoid(c,r)
        for side in ['L','R']:
            for front in ['Front','Hind']:
                p=front+'_'+side;up=arm.data.bones[p+'_Upper'];low=arm.data.bones[p+'_Lower'];foot=arm.data.bones[p+'_Paw'].tail_local;s.tube([conv(up.head_local),conv(up.tail_local),conv(low.tail_local),conv(foot)],[.085,.066,.039,.049],10);s.ellipsoid((foot.x,.070,-foot.y),(.08,.065,.115))
        part('Lean_jackal_body',s,coat,union=True)
        for side,suffix in [(-1,'L'),(1,'R')]:
            tube('Tall_ear',[(side*.14,1.34,.73),(side*.21,1.59,.71),(side*.22,1.72,.74)],[.078,.043,.001],coat,'Ear_'+suffix)
            tube('Ear_interior',[(side*.15,1.39,.779),(side*.20,1.58,.756),(side*.21,1.66,.762)],[.038,.026,.001],dark,'Ear_'+suffix,6)
            ell('Eye_socket',(side*.147,1.28,.91),(.030,.022,.022),dark,'Head');ell('Eye',(side*.16,1.283,.923),(.012,.012,.009),eye,'Head')
        ell('Black_muzzle',(0,1.12,1.22),(.081,.063,.073),dark,'Head');ell('Lower_jaw',(0,1.023,1.035),(.089,.037,.205),coat,'Jaw')
        tube('Bushy_tail',[(0,.93,-.77),(0,.80,-1.10),(0,.66,-1.37)],[.105,.13,.045],coat,'Tail_1');tube('Tail_tip',[(0,.70,-1.28),(0,.57,-1.51)],[.084,.001],dark,'Tail_2')
    elif kind=='monitor-lizard':
        s=S()
        for c,r in [((0,.43,-.37),(.36,.23,.57)),((0,.43,.20),(.37,.23,.48)),((0,.44,.68),(.25,.145,.36)),((0,.40,.91),(.21,.105,.25))]:s.ellipsoid(c,r)
        for b in arm.data.bones:
            if b.name.startswith('Leg_'):
                s.tube([conv(b.head_local),conv(b.tail_local)],[.105 if 'Upper' in b.name else .07,.075 if 'Upper' in b.name else .05],10)
        part('Low_monitor_body',s,coat,union=True)
        for b in arm.data.bones:
            if b.name.startswith('Tail_'):
                i=int(b.name[-1]);tube(b.name,[conv(b.head_local),conv(b.tail_local)],[.21/i,.21/(i+1) if i<3 else .008],coat,b.name,12)
            if b.name.endswith('_Paw'):
                p=conv(b.tail_local)
                for dx in [-.055,0,.055]:tube('Splayed_claw',[(p[0]+dx,.05,p[2]-.03),(p[0]+dx,.035,p[2]+.12)],[.022,.001],dark,b.name,5)
        for side in [-1,1]:ell('Eye_socket',(side*.216,.51,.84),(.037,.024,.03),dark,'Head');ell('Eye',(side*.239,.515,.85),(.012,.016,.015),eye,'Head')
        ell('Lower_jaw',(0,.305,.79),(.20,.04,.32),ivory,'Jaw')
        for i in range(10):tube('Dorsal_scale',[(0,.58,-.68+i*.15),(0,.75,-.7+i*.15)],[.075,.001],shell,'Hips' if i<5 else 'Chest',5)
    else:
        scarab=kind=='scarab'
        if scarab:
            ell('Abdomen',(0,.53,-.30),(.56,.44,.67),dark,'Hips')
            for side in [-1,1]:ell('Split_wing_shell',(side*.225,.63,-.30),(.34,.36,.65),shell,'Hips')
            ell('Neck_shield',(0,.55,.34),(.49,.28,.30),ivory,'Chest');ell('Head',(0,.43,.62),(.31,.22,.24),shell,'Head')
            tube('Swept_horn',[(0,.55,.66),(0,.84,.88),(0,1.05,1.01),(0,1.16,1.26)],[.16,.13,.07,.001],ivory,'Head',10)
            for side in [-1,1]:tube('Mandible',[(side*.20,.32,.73),(side*.27,.28,.98),(side*.13,.26,1.10)],[.07,.043,.001],dark,'Jaw')
        else:
            ell('Armored_abdomen',(0,.5,-.36),(.35,.21,.46),shell,'Hips');ell('Thorax',(0,.49,.13),(.33,.21,.34),shell,'Chest');ell('Head',(0,.45,.47),(.21,.15,.23),ivory,'Head')
            for i in range(5):
                b=arm.data.bones['Tail_'+str(i+1)];tube('Stinger_segment_'+str(i),[conv(b.head_local),conv(b.tail_local)],[.145-i*.018,.13-i*.018],shell,b.name,10);ell('Tail_joint',conv(b.tail_local),(.11-i*.012,)*3,ivory,b.name)
            tube('Venom_sting',[(0,1.5,-.42),(0,1.32,-.24),(0,1.13,-.22)],[.082,.045,.001],dark,'Tail_5',7)
            for side,suffix in [(-1,'L'),(1,'R')]:
                a=arm.data.bones['Claw_'+suffix];tube('Pincer_arm',[conv(a.head_local),conv(a.tail_local)],[.11,.10],shell,a.name)
                ell('Pincer_palm',(side*.63,.34,1.12),(.17,.12,.24),shell,'Pincer_'+suffix)
                for branch in [-1,1]:tube('Pincer_finger',[(side*.63+branch*.09,.34,1.22),(side*.63+branch*.14,.31,1.41),(side*.63+branch*.045,.30,1.56)],[.073,.047,.002],ivory,'Pincer_'+suffix)
        for side in [-1,1]:ell('Eye',(side*.11,.56,.69 if scarab else .58),(.029,.025,.022),eye,'Head')
        for b in arm.data.bones:
            if b.name.startswith('Leg_'):tube(b.name,[conv(b.head_local),conv(b.tail_local)],[.068 if 'Upper' in b.name else .045,.045 if 'Upper' in b.name else .012],shell,b.name,8)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();body=bpy.context.object;body.name=kind+'_SkinnedMesh';return body

def pose(arm,kind,clip,t):
    if kind=='ash-jackal':
        snow.bear.pose(arm,clip,t)
        # Distinct bite instead of the bear's high paw swipe.
        if clip=='Attack':
            hit=smooth((t-.36)/.32)*(1-smooth((t-.68)/.32));f.rotate_world(arm,'Head',(.15*hit,0,0));f.solve_leg(arm,'Front_R',.12*hit,.05*hit,True,True)
        return
    for p in arm.pose.bones:p.location=(0,0,0);p.rotation_quaternion=(1,0,0,0);p.scale=(1,1,1)
    phase=t*math.tau;root=arm.pose.bones['Root'];moving=clip in ['Walk','Run','Turn_Left','Turn_Right'];run=clip=='Run';turn=clip.startswith('Turn_')
    def move(x,h,z):root.location=root.bone.matrix_local.to_3x3().inverted()@V(x,h,z)
    hit=smooth((t-.36)/.32)*(1-smooth((t-.68)/.32));anticipation=smooth(t/.36)*(1-smooth((t-.38)/.30))
    if clip=='Death':
        a=smooth((t-.06)/.78);move(0,-.055*a,0);f.rotate_world(arm,'Head',(-.10*a,0,0));head=arm.pose.bones['Head'];head.location=head.bone.matrix_local.to_3x3().inverted()@V(0,-.10*a,0)
    if moving:move(.01*math.sin(phase),.006*math.cos(phase*2),0)
    if clip=='Idle':f.rotate_world(arm,'Chest',(.009*math.sin(phase),0,0));f.rotate_world(arm,'Head',(.012*math.sin(phase),0,.015*math.sin(phase)))
    if clip=='Attack':move(0,.03*anticipation,.18*hit);f.rotate_world(arm,'Chest',(-.10*anticipation+.13*hit,0,0));f.rotate_world(arm,'Head',(.17*hit,0,0));f.rotate_world(arm,'Jaw',(.30*anticipation,0,0))
    if clip=='Hit':f.rotate_world(arm,'Chest',(-.07*math.sin(math.pi*t)**2,0,0));f.rotate_world(arm,'Head',(.15*math.sin(math.pi*t)**2,0,0))
    if kind=='monitor-lizard':
        for i in range(1,4):f.rotate_world(arm,'Tail_'+str(i),(0,0,.045*math.sin(phase-i*.6) if moving or clip=='Idle' else .14*hit))
    if kind=='scorpion':
        for i in range(1,6):f.rotate_world(arm,'Tail_'+str(i),((-.10*anticipation+.23*hit) if clip=='Attack' else .012*math.sin(phase+i*.3),0,0))
        for side,suffix in [(-1,'L'),(1,'R')]:f.rotate_world(arm,'Claw_'+suffix,(0,0,side*(.14*anticipation-.14*hit)));f.rotate_world(arm,'Pincer_'+suffix,(.10*hit,0,side*.04*math.sin(phase)))
    bpy.context.view_layer.update()
    prefixes=[b.name[:-6] for b in arm.data.bones if b.name.endswith('_Upper')]
    for p in prefixes:
        side=-1 if p.endswith('L') else 1;i=int(p.split('_')[1]);offset=(i%2)*.5+(0 if side<0 else .5);q=(t+offset)%1;forward=lift=lateral=0
        if moving:
            stance=.60 if run else .68;stride=STRIDES[kind][int(run)];span=stride*stance
            if q<stance:forward=span/2-stride*q
            else:u=(q-stance)/(1-stance);forward=f.mix(-span/2,span/2,smooth(u))-stride*(1-stance)*u*(1-u)*(1-2*u);lift=math.sin(u*math.pi)**2*.11
            if turn:
                ankle=arm.data.bones[p+'_Lower'].tail_local;rotated=Quaternion((0,0,1),forward/stride*(1 if clip=='Turn_Left' else -1))@ankle;lateral=rotated.x-ankle.x;forward=ankle.y-rotated.y
        upper=arm.pose.bones[p+'_Upper'];lower=arm.pose.bones[p+'_Lower'];paw=arm.pose.bones[p+'_Paw'];hip=upper.head.copy();target=lower.bone.tail_local+V(lateral,lift,forward);axis=(target-hip).normalized();length=f.clamp((target-hip).length,abs(upper.bone.length-lower.bone.length)+.001,upper.bone.length+lower.bone.length-.002);target=hip+axis*length;a=upper.bone.length;b=lower.bone.length;along=(a*a-b*b+length*length)/(2*length);rest=upper.bone.tail_local-upper.bone.head_local;perp=(rest-axis*rest.dot(axis)).normalized();knee=hip+axis*along+perp*math.sqrt(max(0,a*a-along*along));f.aim_bone(arm,p+'_Upper',hip,knee);f.aim_bone(arm,p+'_Lower',knee,target);f.aim_bone(arm,p+'_Paw',target,target+paw.bone.tail_local-paw.bone.head_local)

def build(kind):
    bpy.ops.wm.read_factory_settings(use_empty=True);arm=rig(kind);body=model(kind,arm);scene=bpy.context.scene;scene.render.fps=30;actions={}
    for name,seconds in CLIPS:
        a=bpy.data.actions.new(name);a.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=a;frames=round(seconds*30)
        for frame in range(frames+1):
            scene.frame_set(frame);pose(arm,kind,name,frame/frames)
            for p in arm.pose.bones:p.keyframe_insert('location',frame=frame,group=p.name);p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
        actions[name]=a;print('ANIMATED',kind,name,flush=True)
    arm.animation_data.action=None
    for name,a in actions.items():tr=arm.animation_data.nla_tracks.new();tr.name=name;st=tr.strips.new(name,0,a);st.action_slot=a.slots[0];tr.mute=True
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=arm;scene.frame_start=0;scene.frame_end=84;out=ROOT/f'public/game/creatures/{kind}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_vertex_color='NAME',export_vertex_color_name='Coat',export_all_vertex_colors=False)
    arm.animation_data.action=actions['Idle'];arm.animation_data.action_slot=actions['Idle'].slots[0];scene.frame_set(0);f.ASSET=ASSET;f.studio(kind);scene.camera.data.ortho_scale=4.1;scene.cycles.samples=12;bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/f'{kind}.blend'));body.data.calc_loop_triangles();report={'type':kind,'bones':len(arm.data.bones),'vertices':len(body.data.vertices),'triangles':len(body.data.loop_triangles),'materials':len(body.data.materials),'unweighted':sum(not v.groups for v in body.data.vertices),'clips':dict(CLIPS),'strides':dict(zip(['walk','run'],STRIDES[kind])),'bytes':out.stat().st_size};(ASSET/f'{kind}-report.json').write_text(json.dumps(report,indent=2)+'\n');print('REPORT',report,flush=True);bpy.ops.render.render(write_still=True)
if __name__=='__main__':
    for kind in (sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(STRIDES)):build(kind)
