"""Original Ashen Frontier quadrupeds. Blender 5.2, no external model downloads.
Run: blender -b -t 4 --python scripts/blender/build_creatures.py [-- wolf boar alpha]
Coordinates in modelling helpers are (right, up, forward), converted to Blender.
"""
import bpy, bmesh, math, json, random, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler
from mathutils.noise import noise_vector

ROOT=Path(__file__).resolve().parents[2]
ASSET=ROOT/'art/creatures/ashen-fauna-v1'
OUT=ROOT/'public/game/creatures'
FPS=30
TAU=math.tau
V=lambda x,h,z:Vector((x,-z,h))
def clamp(x,a=0,b=1):return max(a,min(b,x))
def smooth(x):x=clamp(x);return x*x*(3-2*x)
def mix(a,b,t):return a*(1-t)+b*t

def material(name,color,rough=.85,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m

class Sculpt:
    def __init__(self):self.parts=[]
    def ellipsoid(self,center,radii,rot=0):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=V(*center))
        o=bpy.context.object;o.scale=(radii[0],radii[2],radii[1]);o.rotation_euler.x=rot
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        self.parts.append(o);return o
    def tube(self,points,radii,n=12):
        vs=[];fs=[]
        points=[V(*p) for p in points]
        for j,(p,r) in enumerate(zip(points,radii)):
            tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
            across=tangent.cross(Vector((1,0,0))).normalized()
            if across.length<.1:across=Vector((0,1,0))
            other=tangent.cross(across).normalized()
            for i in range(n):vs.append(p+r*(across*math.cos(i*TAU/n)+other*math.sin(i*TAU/n)))
        for j in range(len(points)-1):
            for i in range(n):a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
        fs.extend([tuple(reversed(range(n))),tuple(range((len(points)-1)*n,len(points)*n))])
        data=bpy.data.meshes.new('Sculpt_segment');data.from_pydata(vs,[],fs);data.update()
        obj=bpy.data.objects.new('Sculpt_segment',data);bpy.context.scene.collection.objects.link(obj);self.parts.append(obj)
        return obj
    def finish(self,name,remesh=False):
        bpy.ops.object.select_all(action='DESELECT')
        for o in self.parts:o.select_set(True)
        bpy.context.view_layer.objects.active=self.parts[0];bpy.ops.object.join()
        o=bpy.context.object;o.name=name
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        if remesh:
            mod=o.modifiers.new('Sculpt_union','REMESH');mod.mode='VOXEL';mod.voxel_size=.023;mod.use_smooth_shade=True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            mod=o.modifiers.new('Relax_surface','SMOOTH');mod.factor=.8;mod.iterations=4;bpy.ops.object.modifier_apply(modifier=mod.name)
            mod=o.modifiers.new('Game_topology','DECIMATE');mod.ratio=.60;bpy.ops.object.modifier_apply(modifier=mod.name)
        for f in o.data.polygons:f.use_smooth=True
        return o

def create_rig(kind):
    boar=kind=='boar';hip=.72 if boar else .85;front=.31;back=-.43;width=.25 if boar else .185
    data=bpy.data.armatures.new(kind+'_Skeleton');arm=bpy.data.objects.new(kind+'_Rig',data);bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,head,tail,parent=None):
        b=data.edit_bones.new(name);b.head=V(*head);b.tail=V(*tail)
        if parent:b.parent=data.edit_bones[parent]
        return b
    bone('Root',(0,0,0),(0,.2,0))
    bone('Hips',(0,hip,-.44),(0,hip+.05,-.06),'Root')
    bone('Chest',(0,hip+.05,-.06),(0,hip+.12,.31),'Hips')
    bone('Neck',(0,hip+.12,.31),(0,.80 if boar else 1.10,.54),'Chest')
    bone('Head',(0,.80 if boar else 1.10,.54),(0,.59 if boar else 1.12,.87),'Neck')
    bone('Jaw',(0,.54 if boar else 1.025,.65),(0,.47 if boar else 1.015,.96),'Head')
    bone('Tail_1',(0,hip+.03,-.62),(0,hip-.04,-.87),'Hips')
    bone('Tail_2',(0,hip-.04,-.87),(0,hip-.20,-1.20),'Tail_1')
    for side in [-1,1]:
        suffix='L' if side<0 else 'R';x=width*side
        for front_leg in [True,False]:
            p=('Front' if front_leg else 'Hind')+'_'+suffix
            z=front if front_leg else back
            h=hip if front_leg else hip-.015
            elbow=(x,.40 if boar else .46,z-.12) if front_leg else (x,.44 if boar else .53,z+.22)
            end=(x,.095,z+.035) if front_leg else (x,.215 if boar else .25,z-.16)
            bone(p+'_Upper',(x,h,z),elbow,'Chest' if front_leg else 'Hips')
            bone(p+'_Lower',elbow,end,p+'_Upper')
            foot=(x,.06,z+.15) if front_leg else (x,.08,z-.035)
            bone(p+'_Paw',end,foot,p+'_Lower')
            if not front_leg:bone(p+'_Toe',foot,(x,.04,z+.08),p+'_Paw')
        ex=side*(.19 if boar else .15)
        bone('Ear_'+suffix,(ex,.90 if boar else 1.24,.58),(ex*1.3,1.08 if boar else 1.48,.53),'Head')
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:pb.rotation_mode='QUATERNION'
    return arm

def distance_to_segment(p,a,b):
    d=b-a;t=clamp((p-a).dot(d)/d.length_squared);return (p-(a+d*t)).length

def bind(obj,arm,bone=None,candidates=None):
    obj.parent=arm
    if bone:obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))),1,'REPLACE')
    else:
        names=candidates or [b.name for b in arm.data.bones if b.name not in ['Root','Jaw'] and not b.name.startswith('Ear')]
        groups={n:obj.vertex_groups.new(name=n) for n in names}
        for v in obj.data.vertices:
            nearest=sorted((distance_to_segment(v.co,arm.data.bones[n].head_local,arm.data.bones[n].tail_local),n) for n in names)[:3]
            vals=[1/(d+.045)**5 for d,n in nearest];total=sum(vals)
            for (_,n),value in zip(nearest,vals):groups[n].add([v.index],value/total,'REPLACE')
    mod=obj.modifiers.new('Skeleton','ARMATURE');mod.object=arm
    return obj

def fur_colors(obj,kind,detail=False):
    colors=obj.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
    wolf=kind!='boar';alpha=kind=='alpha'
    dark=Vector((.075,.088,.094) if wolf else (.085,.043,.021))
    mid=Vector((.24,.27,.265) if wolf else (.22,.115,.047))
    light=Vector((.49,.46,.37) if wolf else (.34,.22,.105))
    if alpha:dark=Vector((.16,.18,.18));mid=Vector((.42,.45,.43));light=Vector((.63,.62,.54))
    for v in obj.data.vertices:
        x,y,h=v.co;z=-y
        n=noise_vector(v.co*13)[0];fine=noise_vector(Vector((x*90,y*18,h*80)))[1]
        top=smooth((h-(.82 if wolf else .88))/.38)
        belly=smooth((.72-h)/.25)*(1-smooth((abs(x)-.20)/.13))
        muzzle=smooth((z-.64)/.20)*(1-smooth((h-1.12)/.1)) if wolf else smooth((z-.74)/.3)*.3
        c=mid.lerp(dark,top*.8).lerp(light,max(belly*.75,muzzle*.85))
        c*=1+n*.18+fine*.10
        if detail:c*=.92
        colors.data[v.index].color=(*c,1)
    obj.data.color_attributes.active_color=colors
    # Triplanar-style UVs keep a small tile's fine grain consistent across the mesh.
    uv=obj.data.uv_layers.new(name='FurUV')
    for face in obj.data.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]))
        axes=[i for i in range(3) if i!=axis]
        for li in face.loop_indices:
            p=obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv=(p[axes[0]]*3,p[axes[1]]*3)

def fur_material():
    m=material('Layered_Fur',(1,1,1),.96)
    nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF')
    color=nodes.new('ShaderNodeVertexColor');color.layer_name='Coat'
    im=bpy.data.images.new('Fur_grain',width=128,height=128)
    rng=random.Random(248);pixels=[]
    for y in range(128):
        for x in range(128):
            val=.93+.07*rng.random()
            pixels.extend((val,val,val,1))
    im.pixels=pixels;im.pack()
    tex=nodes.new('ShaderNodeTexImage');tex.image=im
    mul=nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1
    links.new(color.outputs['Color'],mul.inputs[1]);links.new(tex.outputs['Color'],mul.inputs[2]);links.new(mul.outputs['Color'],p.inputs['Base Color'])
    return m

def build_model(kind,arm):
    boar=kind=='boar';alpha=kind=='alpha';s=Sculpt()
    if boar:
        for c,r in [((0,.73,-.35),(.32,.31,.35)),((0,.77,.05),(.36,.37,.42)),((0,.80,.34),(.32,.40,.32)),((0,.68,.58),(.275,.30,.31)),((0,.50,.86),(.16,.145,.25))]:s.ellipsoid(c,r)
    else:
        for c,r in [((0,.83,-.45),(.19,.21,.27)),((0,.85,-.18),(.205,.19,.34)),((0,.91,.15),(.275 if alpha else .25,.31,.36)),((0,1.01,.36),(.255 if alpha else .205,.32,.245)),((0,1.10,.51),(.185,.26,.205)),((0,1.165,.66),(.19,.15,.20)),((0,1.11,.87),(.105,.088,.25)),((0,1.10,1.052),(.069,.058,.08))]:s.ellipsoid(c,r)
    for suffix in ['L','R']:
        for front in [True,False]:
            name=('Front' if front else 'Hind')+'_'+suffix
            upper=arm.data.bones[name+'_Upper'];lower=arm.data.bones[name+'_Lower'];paw=arm.data.bones[name+'_Paw']
            conv=lambda p:(p.x,p.z,-p.y)
            h,k,a=map(conv,[upper.head_local,upper.tail_local,lower.tail_local])
            middle=tuple(mix(h[i],k[i],.45) for i in range(3))
            s.tube([h,middle,k,a],[.13 if boar else (.10 if front else .13),.105 if boar else (.085 if front else .115),.057 if boar else .054,.038 if not boar else .053])
            if not front:s.tube([a,conv(paw.tail_local)],[.043,.036 if not boar else .05])
            foot=conv(paw.tail_local)
            s.ellipsoid((foot[0],.072,foot[2]+.035),(.073 if boar else .064,.062,.115 if front else .10))
    if not boar:
        s.tube([(0,.88,-.61),(0,.81,-.83),(0,.66,-1.08),(0,.60,-1.25)],[.08,.115,.085,.018])
    body=s.finish(kind+'_Coat',remesh=True)
    fur=fur_material();body.data.materials.append(fur);fur_colors(body,kind);bind(body,arm)
    objects=[body]
    dark=material('Nose_Hooves',(.025,.029,.030),.48)
    inner=material('Mouth_Inner',(.075,.035,.031),.8)
    ivory=material('Ivory',(.70,.63,.44),.62)
    eyes=material('Amber_Eyes',(.52,.245,.045),.27)
    p=eyes.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(.38,.12,.012,1);p.inputs['Emission Strength'].default_value=.15
    def detail(name,sculpt,mat,bone):
        o=sculpt.finish(name);o.data.materials.append(mat);bind(o,arm,bone);objects.append(o);return o
    jaw=Sculpt();jaw.ellipsoid((0,.43 if boar else 1.005,.81),(.15 if boar else .105,.075 if boar else .043,.245 if boar else .18))
    o=detail('Lower_Jaw',jaw,fur,'Jaw');fur_colors(o,kind)
    mouth=Sculpt();mouth.ellipsoid((0,.485 if boar else 1.039,.85),(.135 if boar else .093,.018,.18 if boar else .15));detail('Mouth',mouth,inner,'Jaw')
    nose=Sculpt();nose.ellipsoid((0,.48 if boar else 1.107,1.085 if boar else 1.11),(.147 if boar else .072,.093 if boar else .048,.026 if boar else .027));detail('Nose',nose,dark,'Head')
    if boar:
        nostrils=Sculpt()
        for side in [-1,1]:nostrils.ellipsoid((side*.065,.493,1.112),(.026,.021,.008))
        detail('Nostrils',nostrils,inner,'Head')
        tail=Sculpt();tail.tube([(0,.80,-.65),(0,.77,-.86),(.05,.82,-.89),(.07,.86,-.84),(.04,.86,-.81)],[.025,.022,.020,.018,.008],8);detail('Curled_Tail',tail,dark,'Tail_1')
    for side,suffix in [(-1,'L'),(1,'R')]:
        ear=Sculpt()
        if boar:ear.tube([(side*.18,.88,.56),(side*.27,.99,.58),(side*.32,1.04,.48)],[.10,.095,.007],8)
        else:
            verts=[V(side*.09,1.24,.65),V(side*.225,1.23,.62),V(side*.21,1.49,.57),V(side*.09,1.24,.59),V(side*.225,1.23,.56),V(side*.21,1.49,.545)]
            data=bpy.data.meshes.new('Ear_shape');data.from_pydata(verts,[],[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)]);data.update()
            obj=bpy.data.objects.new('Ear_shape',data);bpy.context.scene.collection.objects.link(obj);ear.parts.append(obj)
        o=detail('Ear_'+suffix,ear,fur,'Ear_'+suffix);fur_colors(o,kind)
        e=Sculpt();e.ellipsoid((side*(.245 if boar else .147),.79 if boar else 1.197,.69 if boar else .76),(.024,.018,.038));detail('Eye_Socket_'+suffix,e,dark,'Head')
        e=Sculpt();e.ellipsoid((side*(.264 if boar else .167),.794 if boar else 1.198,.707 if boar else .776),(.008,.009,.013));detail('Eye_'+suffix,e,eyes,'Head')
        pupil=Sculpt();pupil.ellipsoid((side*(.270 if boar else .173),.796 if boar else 1.199,.713 if boar else .780),(.004,.007,.006));detail('Pupil_'+suffix,pupil,dark,'Head')
        teeth=Sculpt()
        if boar:
            teeth.tube([(side*.15,.43,.91),(side*.23,.44,.99),(side*.265,.53,1.02),(side*.25,.65,1.005)],[.038,.032,.022,.0015],10)
            teeth.tube([(side*.14,.62,.88),(side*.205,.57,.95),(side*.21,.53,.99)],[.027,.019,.001],9)
        else:
            for z in [.81,.94]:teeth.tube([(side*.068,1.052,z),(side*.068,1.002,z+.006)],[.015,.001],8)
        detail('Fangs_'+suffix,teeth,ivory,'Head')
        for front in [True,False]:
            name=('Front' if front else 'Hind')+'_'+suffix
            paw=arm.data.bones[name+'_Paw'].tail_local
            nails=Sculpt()
            for offset in ([-.036,.036] if boar else [-.035,0,.035]):
                if boar:nails.ellipsoid((paw.x+offset,.045,-paw.y+.065),(.032,.040,.073))
                else:nails.tube([(paw.x+offset,.047,-paw.y+.100),(paw.x+offset,.025,-paw.y+.142)],[.012,.0015],6)
            detail('Claws_'+name,nails,dark if boar else ivory,name+'_Paw' if front else name+'_Toe')
    # Fur clumps follow the coat and rake backward, breaking only the silhouette.
    ruff=Sculpt();rng=random.Random(44)
    if boar:
        for i in range(38):
            z=.43-i/37*1.0;x=rng.uniform(-.06,.06);h=1.18-.17*((z-.22)/.9)**2
            ruff.tube([(x,h-.055,z),(x,h+.035,z-.025),(x,h+.11,z-.065)],[.022,.012,.001],5)
    else:
        for i in range(42 if alpha else 28):
            a=rng.uniform(-math.pi,math.pi);z=rng.uniform(.10,.47)
            x=math.sin(a)*(.235 if alpha else .205);h=.98+math.cos(a)*.265
            length=rng.uniform(.075,.13)*(1.3 if alpha else 1)
            ruff.tube([(x*.95,h,z),(x*1.06,h-.025,z-.045),(x*1.14,h-.055,z-length)],[.028,.017,.0015],6)
    o=ruff.finish('Bristles' if boar else 'Neck_Ruff');o.data.materials.append(fur);fur_colors(o,kind,True);bind(o,arm,candidates=['Hips','Chest','Neck','Head']);objects.append(o)
    if alpha:
        scar=Sculpt();scar.tube([(-.175,1.26,.72),(-.193,1.21,.754),(-.183,1.165,.779)],[.008,.012,.006],6)
        detail('Old_Scar',scar,material('Scar_Skin',(.23,.105,.078),.91),'Head')
    # Merge draw calls while retaining every part's weights and UV/color data.
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
    body.name=kind+'_SkinnedMesh'
    for attr in list(body.data.color_attributes):
        if attr.name!='Coat':body.data.color_attributes.remove(attr)
    coat=body.data.color_attributes['Coat'];body.data.color_attributes.active_color=coat
    for poly in body.data.polygons:
        if body.data.materials[poly.material_index].name!='Layered_Fur':
            for vi in poly.vertices:coat.data[vi].color=(1,1,1,1)
    return body

def rotate_world(arm,name,xyz):
    rest=arm.data.bones[name].matrix_local.to_quaternion()
    arm.pose.bones[name].rotation_quaternion=rest.inverted()@Euler(xyz).to_quaternion()@rest

def aim_bone(arm,name,head,tail):
    b=arm.data.bones[name];p=arm.pose.bones[name]
    q=(b.tail_local-b.head_local).rotation_difference(tail-head)
    m=(q@b.matrix_local.to_quaternion()).to_matrix().to_4x4();m.translation=head
    p.matrix=m
    bpy.context.view_layer.update()

def solve_leg(arm,prefix,forward,lift,front):
    upper=arm.pose.bones[prefix+'_Upper'];lower=arm.pose.bones[prefix+'_Lower'];paw=arm.pose.bones[prefix+'_Paw']
    hip=upper.head.copy();a=upper.bone.length;b=lower.bone.length
    target=lower.bone.tail_local.copy();target.y-=forward;target.z+=lift
    # Two-bone sagittal IK, with the anatomical elbow/stifle bending direction.
    target.x=hip.x
    vec=target-hip;length=clamp(vec.length,abs(a-b)+.001,a+b-.002);axis=vec.normalized()
    target=hip+axis*length
    along=(a*a-b*b+length*length)/(2*length)
    perpendicular=Vector((0,-axis.z,axis.y))
    bend=1 if front else -1
    knee=hip+axis*along+perpendicular*math.sqrt(max(0,a*a-along*along))*bend
    aim_bone(arm,prefix+'_Upper',hip,knee);aim_bone(arm,prefix+'_Lower',knee,target)
    tail=target+(paw.bone.tail_local-paw.bone.head_local)
    aim_bone(arm,prefix+'_Paw',target,tail)
    if not front:
        toe=arm.pose.bones[prefix+'_Toe'];aim_bone(arm,prefix+'_Toe',tail,tail+(toe.bone.tail_local-toe.bone.head_local))

def pose(arm,kind,clip,t):
    boar=kind=='boar';alpha=kind=='alpha'
    for p in arm.pose.bones:p.location=(0,0,0);p.rotation_quaternion=(1,0,0,0);p.scale=(1,1,1)
    phase=t*TAU;root=arm.pose.bones['Root'];bounce=0
    if clip=='Idle':
        rotate_world(arm,'Chest',(.009*math.sin(phase),0,0));rotate_world(arm,'Head',(.012*math.sin(phase),0,.022*math.sin(phase)))
    elif clip in ['Walk','Run']:
        run=clip=='Run';bounce=(.018 if not run else .040)*math.sin(phase*2)
        rotate_world(arm,'Chest',((.018 if not run else .035)*math.cos(phase),0,0))
        rotate_world(arm,'Neck',(.02*math.sin(phase),0,0))
        rotate_world(arm,'Head',(-.02 if boar else -.025,0,.018*math.sin(phase)))
    elif clip=='Attack':
        if t<=.68:
            f=smooth(t/.68);bounce=-.08*math.sin(f*math.pi)
            rotate_world(arm,'Neck',((.20 if boar else -.18)*math.sin(f*math.pi),0,0))
            rotate_world(arm,'Head',(.12*f-.18*math.sin(f*math.pi) if not boar else .15*f,0,0))
            rotate_world(arm,'Jaw',((.50*math.sin(f*math.pi)+.08*f) if not boar else .10*f,0,0))
        else:
            f=smooth((t-.68)/.32);rotate_world(arm,'Head',((.15 if boar else .12)*(1-f),0,0));rotate_world(arm,'Jaw',(.08*(1-f),0,0))
        # The bite/tusk thrust reaches forward exactly at phase .68.
        root.location=root.bone.matrix_local.to_3x3().inverted()@V(0,bounce,.18*math.sin(math.pi*clamp((t-.40)/.56)))
        rotate_world(arm,'Chest',(.06*math.sin(t*math.pi),0,0))
    elif clip=='Hit':
        f=math.sin(t*math.pi)**2;rotate_world(arm,'Chest',(.05*f,.045*f,0));rotate_world(arm,'Head',(-.14*f,0,.14*f));rotate_world(arm,'Jaw',(.12*f,0,0))
    elif clip=='Death':
        f=smooth((t-.08)/.67);q=Quaternion((0,1,0),-math.pi/2*f)
        m=q.to_matrix().to_4x4()@root.bone.matrix_local;m.translation=V(0,(.34 if boar else .27)*f,0)
        root.matrix=m
        rotate_world(arm,'Neck',(.25*f,0,0));rotate_world(arm,'Head',(.15*f,0,-.08*f));rotate_world(arm,'Jaw',(.19*f,0,0))
        for side in ['L','R']:
            for front in [True,False]:
                p=('Front' if front else 'Hind')+'_'+side
                rotate_world(arm,p+'_Upper',((.30 if front else -.4)*f,0,0));rotate_world(arm,p+'_Lower',((-.6 if front else .5)*f,0,0))
    if clip not in ['Attack','Death']:root.location=root.bone.matrix_local.to_3x3().inverted()@V(0,bounce,0)
    rotate_world(arm,'Tail_1',(0,.035*math.sin(phase),.06*math.sin(phase)))
    rotate_world(arm,'Tail_2',(.045*math.sin(phase+.5),0,.07*math.sin(phase-.4)))
    for side in ['L','R']:rotate_world(arm,'Ear_'+side,(.035*math.sin(phase),0,0))
    bpy.context.view_layer.update()
    if clip!='Death':
        for side in ['L','R']:
            for front in [True,False]:
                forward=lift=0
                if clip in ['Walk','Run']:
                    run=clip=='Run';stride=(.82 if boar else 1.12) if run else (.52 if boar else .70);stance=.56 if run else .70
                    offset=({'Front_L':0,'Front_R':.5,'Hind_L':.5,'Hind_R':0} if run else {'Front_L':0,'Front_R':.5,'Hind_L':.75,'Hind_R':.25})[('Front' if front else 'Hind')+'_'+side]
                    p=(t+offset)%1;span=stride*stance
                    if p<stance:forward=span/2-span*p/stance
                    else:
                        f=(p-stance)/(1-stance);forward=-span/2+span*smooth(f);lift=math.sin(f*math.pi)*(.16 if run else .09)*(0.75 if boar else 1)
                solve_leg(arm,('Front' if front else 'Hind')+'_'+side,forward,lift,front)

def animate(arm,kind):
    actions={};scene=bpy.context.scene;scene.render.fps=FPS
    for name,seconds in [('Idle',2.4),('Walk',1.2),('Run',.8),('Attack',1.0),('Hit',.5),('Death',1.4)]:
        action=bpy.data.actions.new(name);action.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=action
        frames=round(seconds*FPS)
        for frame in range(frames+1):
            scene.frame_set(frame);pose(arm,kind,name,frame/frames)
            for p in arm.pose.bones:
                p.keyframe_insert('location',frame=frame,group=p.name);p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
        actions[name]=action
        print('ANIMATED',kind,name,flush=True)
    arm.animation_data.action=None
    for name,action in actions.items():
        track=arm.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,action);strip.action_slot=action.slots[0];track.mute=True
    return actions

def studio(kind):
    s=bpy.context.scene;s.world=bpy.data.worlds.new('Studio');s.world.color=(.10,.13,.15)
    target=V(0,.7,0)
    for name,pos,power,color,size in [('Key',(3,-4,5),650,(1,.88,.72),4),('Fill',(-3,-1,3),450,(.72,.85,1),3),('Rim',(1,3,4),800,(.9,.95,1),3)]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=pos;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(3,-4,2.2));camera=bpy.context.object;camera.name='Creature_Portrait';camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=3.1;s.camera=camera
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.02));floor=bpy.context.object;floor.name='Studio_Floor';floor.data.materials.append(material('Studio_Slate',(.045,.065,.07),1))
    s.render.engine='CYCLES';s.cycles.samples=20;s.render.resolution_x=1000;s.render.resolution_y=760;s.render.resolution_percentage=100;s.render.filepath=str(ASSET/f'renders/{kind}.png')

def build(kind):
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;arm=create_rig(kind);body=build_model(kind,arm);actions=animate(arm,kind)
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=arm
    scene.frame_start=0;scene.frame_end=72
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{kind}.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_image_format='AUTO',export_vertex_color='NAME',export_vertex_color_name='Coat',export_all_vertex_colors=False)
    arm.animation_data.action=actions['Idle'];arm.animation_data.action_slot=actions['Idle'].slots[0];scene.frame_set(0)
    studio(kind);bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/f'{kind}.blend'))
    body.data.calc_loop_triangles()
    report={'type':kind,'bones':len(arm.data.bones),'vertices':len(body.data.vertices),'triangles':len(body.data.loop_triangles),'unweighted':sum(not v.groups for v in body.data.vertices),'clips':list(actions),'bytes':(OUT/f'{kind}.glb').stat().st_size}
    (ASSET/f'{kind}-report.json').write_text(json.dumps(report,indent=2)+'\n');print('REPORT',json.dumps(report),flush=True)
    bpy.ops.render.render(write_still=True)

ASSET.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
kinds=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['wolf','boar','alpha']
for kind in kinds:
    assert kind in ['wolf','boar','alpha'];build(kind)
