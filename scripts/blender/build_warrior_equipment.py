"""Generate modular equipment without overwriting the archived Mixamo warrior."""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
ASSET=ROOT/'art/characters/ashen-warrior-equipment-v1'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/characters/ashen-warrior-v1/ashen-warrior-v1.blend'))
scene=bpy.context.scene
arm=next(o for o in scene.objects if o.type=='ARMATURE')
action=arm.animation_data.action
slot=arm.animation_data.action_slot
arm.animation_data.action=None
arm.data.pose_position='REST'
for obj in scene.objects:
    obj.hide_set(False);obj.hide_render=False
bpy.context.view_layer.update()
to_arm=arm.matrix_world.inverted()

def mat(name,color,metal=0,rough=.8):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
cloth=mat('Traveller_Linen',(.13,.17,.15));pants=mat('Traveller_Trousers',(.075,.065,.05));skin=mat('Traveller_Skin',(.43,.26,.17));hair=mat('Traveller_Hair',(.06,.031,.016));dark=mat('Traveller_Eyes',(.015,.019,.018));leather=mat('Traveller_Leather',(.23,.11,.048));edge=mat('Leather_Seams',(.38,.24,.10));brass=mat('Traveller_Brass',(.48,.31,.105),.7,.4);olive=mat('Traveller_Hood',(.18,.24,.13));iron=mat('Watch_Iron',(.18,.26,.29),.75,.36);silver=mat('Watch_Blade_Edge',(.66,.72,.73),.75,.28);gem=mat('Ember_Stone',(.38,.063,.02),.25,.35)
MATS=[cloth,pants,skin,hair,dark,leather,edge,brass,olive,iron,silver,gem]

class Shape:
    def __init__(self,name):self.name=name;self.v=[];self.f=[];self.mi=[];self.w=[]
    def add(self,verts,faces,material,bone):
        offset=len(self.v);self.v += [to_arm@Vector(v) for v in verts];self.f += [tuple(offset+i for i in f) for f in faces];self.mi += [material]*len(faces)
        self.w += [bone(v) if callable(bone) else {bone:1} for v in verts]
    def sphere(self,center,radii,material,bone,segments=16,rings=10):
        c=Vector(center);verts=[]
        for r in range(rings+1):
            phi=math.pi*r/rings
            for i in range(segments):
                theta=math.tau*i/segments;verts.append(c+Vector((math.sin(phi)*math.cos(theta)*radii[0],math.sin(phi)*math.sin(theta)*radii[1],math.cos(phi)*radii[2])))
        faces=[]
        for r in range(rings):
            for i in range(segments):j=(i+1)%segments;faces.append((r*segments+i,r*segments+j,(r+1)*segments+j,(r+1)*segments+i))
        self.add(verts,faces,material,bone)
    def limb(self,bone,radius,material,stretch=1.15):
        b=arm.data.bones['mixamorig:'+bone];start=arm.matrix_world@b.head_local;end=arm.matrix_world@b.tail_local;c=(start+end)/2;direction=end-start
        rot=Vector((0,0,1)).rotation_difference(direction.normalized()).to_matrix();verts=[];n=12;rings=8
        for r in range(rings+1):
            phi=math.pi*r/rings
            for i in range(n):
                theta=math.tau*i/n;v=Vector((math.sin(phi)*math.cos(theta)*radius,math.sin(phi)*math.sin(theta)*radius,math.cos(phi)*direction.length*.5*stretch));verts.append(c+rot@v)
        faces=[(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i) for r in range(rings) for i in range(n)]
        self.add(verts,faces,material,bone)
    def torso(self,rows,material,weight):
        n=20;verts=[(math.cos(i*math.tau/n)*x,.015+math.sin(i*math.tau/n)*y,z) for z,x,y in rows for i in range(n)]
        faces=[tuple(reversed(range(n))),tuple(range((len(rows)-1)*n,len(rows)*n))]
        faces += [(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i) for r in range(len(rows)-1) for i in range(n)]
        self.add(verts,faces,material,weight)
    def finish(self):
        mesh=bpy.data.meshes.new(self.name);mesh.from_pydata(self.v,[],self.f);mesh.update();obj=bpy.data.objects.new(self.name,mesh);scene.collection.objects.link(obj);obj.parent=arm
        for m in MATS:mesh.materials.append(m)
        for p,mi in zip(mesh.polygons,self.mi):p.material_index=mi;p.use_smooth=True
        names=set(k for weights in self.w for k in weights)
        for name in names:
            group=obj.vertex_groups.new(name='mixamorig:'+name)
            for i,weights in enumerate(self.w):
                if weights.get(name,0)>0:group.add([i],weights[name],'REPLACE')
        mod=obj.modifiers.new('Shared_Rig','ARMATURE');mod.object=arm
        return obj

def torso_weights(v):
    z=v[2];joints=[('Hips',.95),('Spine',1.10),('Spine1',1.24),('Spine2',1.39)]
    if z<=joints[0][1]:return {'Hips':1}
    for (a,lo),(b,hi) in zip(joints,joints[1:]):
        if z<hi:t=(z-lo)/(hi-lo);return {a:1-t,b:t}
    return {'Spine2':1}

base=Shape('Base_Body');base.torso([(.83,.125,.09),(.97,.135,.10),(1.10,.12,.092),(1.28,.17,.10),(1.42,.19,.085),(1.47,.075,.065)],0,torso_weights)
for side in ['Left','Right']:
    for tail,r,mi in [('Arm',.071,0),('ForeArm',.055,0),('Hand',.046,2),('UpLeg',.082,1),('Leg',.060,1)]:base.limb(side+tail,r,mi)
    shoulder=arm.matrix_world@arm.data.bones['mixamorig:'+side+'Arm'].head_local;base.sphere(shoulder,(.079,.08,.085),0,side+'Arm')
base.finish()
head=Shape('Base_Head');head.sphere((0,.04,1.49),(.053,.052,.09),2,'Neck');head.sphere((0,.04,1.642),(.091,.082,.122),2,'Head');head.sphere((0,.048,1.719),(.093,.082,.055),3,'Head')
head.sphere((0,-.036,1.62),(.02,.027,.028),2,'Head',12,8)
for x in [-.033,.033]:head.sphere((x,-.033,1.67),(.014,.010,.008),4,'Head',10,6)
head.sphere((0,-.02,1.57),(.060,.050,.045),3,'Head');head.finish()
feet=Shape('Base_Feet')
for x,side in [(-.098,'Right'),(.098,'Left')]:feet.sphere((x,-.025,.083),(.059,.13,.081),1,side+'Foot')
feet.finish()
armor=Shape('Traveller_Armor');armor.torso([(.81,.17,.12),(.98,.148,.116),(1.13,.134,.111),(1.31,.188,.121),(1.435,.19,.115),(1.47,.082,.071)],5,torso_weights)
armor.torso([(1.0,.151,.12),(1.045,.148,.12)],6,torso_weights)
for side in ['Left','Right']:
    pos=arm.matrix_world@arm.data.bones['mixamorig:'+side+'Arm'].head_local;armor.sphere(pos+Vector((0,0,.035)),(.082,.099,.040),5,side+'Arm')
armor.sphere((0,-.107,1.027),(.027,.014,.024),7,'Hips',12,8);armor.finish()
hood=Shape('Traveller_Hood');verts=[];n=20;rings=12
# Front opening faces -Y; both sides remain thick and readable at game distance.
for r in range(rings+1):
    phi=.04+(math.pi-.08)*r/rings
    for i in range(n+1):
        theta=-.42+(math.pi+.84)*i/n;verts.append((math.sin(phi)*math.cos(theta)*.115,.048+math.sin(phi)*math.sin(theta)*.115,1.646+math.cos(phi)*.154))
faces=[(r*(n+1)+i,r*(n+1)+i+1,(r+1)*(n+1)+i+1,(r+1)*(n+1)+i) for r in range(rings) for i in range(n)]
hood.add(verts,faces,8,'Head');hood.finish()
boots=Shape('Traveller_Boots')
for x,side in [(-.098,'Right'),(.098,'Left')]:
    boots.sphere((x,-.025,.083),(.065,.145,.088),5,side+'Foot');boots.sphere((x,.012,.225),(.067,.07,.16),5,side+'Leg');boots.sphere((x,.012,.345),(.071,.074,.037),6,side+'Leg')
boots.finish()
# The second blade shares the hand weights but has a distinct broad silhouette.
watch=bpy.data.objects['Weapon_Sword'].copy();watch.data=watch.data.copy();watch.name='Weapon_WatchSword';scene.collection.objects.link(watch)
bone=arm.data.bones['mixamorig:RightHand'];inv=bone.matrix_local.inverted()
for v in watch.data.vertices:
    p=inv@v.co
    if p.x>15:p.z=2+(p.z-2)*1.40;p.x=15+(p.x-15)*1.12
    elif 4<p.x<12:p.z=2+(p.z-2)*1.18
    v.co=bone.matrix_local@p
watch.data.materials.clear()
for m in [iron,silver,brass,leather,cloth]:watch.data.materials.append(m)
ring=Shape('Copper_Ring');right=arm.data.bones['mixamorig:RightHand'].matrix_local
# Coordinates in armature space are converted back to world for the shared builder.
verts=[];n=16;m=6
for i in range(n):
    a=i*math.tau/n
    for j in range(m):
        b=j*math.tau/m;local=Vector((4+(.95+.25*math.cos(b))*math.cos(a),6+.25*math.sin(b),2.0+(.95+.25*math.cos(b))*math.sin(a)));verts.append(arm.matrix_world@right@local)
ring.add(verts,[(i*m+j,((i+1)%n)*m+j,((i+1)%n)*m+(j+1)%m,i*m+(j+1)%m) for i in range(n) for j in range(m)],7,'RightHand');ring.finish()
amulet=Shape('Ember_Amulet')
for i in range(23):
    t=i/22;x=-.065+.13*t;z=1.44-.13*math.sin(t*math.pi);amulet.sphere((x,-.125,z),(.005,.006,.006),7,'Spine2',6,4)
amulet.sphere((0,-.134,1.304),(.026,.014,.035),7,'Spine2',10,6);amulet.sphere((0,-.148,1.304),(.017,.009,.024),11,'Spine2',10,6);amulet.finish()


# Keep the established character's detailed limbs and textured proportions under
# the new leather torso. The simple full body remains only the unequipped fallback.
leather_source=bpy.data.materials['Weathered_Paladin_Steel'].copy()
leather_source.name='Traveller_Textured_Leather'
shader=next(n for n in leather_source.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
shader.inputs['Metallic'].default_value=0
shader.inputs['Roughness'].default_value=.91
if shader.inputs['Base Color'].links:
    original=shader.inputs['Base Color'].links[0].from_socket
    tint=leather_source.node_tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(.82,.64,.40,1)
    leather_source.node_tree.links.new(original,tint.inputs[1]);leather_source.node_tree.links.new(tint.outputs[0],shader.inputs['Base Color'])
def textured_copy(source,name):
    obj=bpy.data.objects[source].copy();obj.data=obj.data.copy();obj.name=name;scene.collection.objects.link(obj)
    obj.data.materials.clear();obj.data.materials.append(leather_source)
    for face in obj.data.polygons:face.material_index=0
    return obj
limbs=textured_copy('Armor_Body','Traveller_Limbs')
keep=set()
for face in limbs.data.polygons:
    bones=[]
    for vi in face.vertices:
        v=limbs.data.vertices[vi];group=max(v.groups,key=lambda g:g.weight);bones.append(limbs.vertex_groups[group.group].name)
    if any(any(part in name for part in ['Arm','Hand','Leg','Finger']) for name in bones):keep.add(face.index)
bm=bmesh.new();bm.from_mesh(limbs.data);bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[face for face in bm.faces if face.index not in keep],context='FACES')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bm.to_mesh(limbs.data);bm.free()
# Leather coif within the hood, retaining the familiar face guard.
coif=textured_copy('Helmet','Traveller_Coif')
to_world=coif.matrix_world
inverse=to_world.inverted()
for v in coif.data.vertices:
    point=to_world@v.co;point.x*=.88;point.y=.04+(point.y-.04)*.90;point.z=1.65+(point.z-1.65)*.80;v.co=inverse@point
# Real boot topology fits the existing knees/ankles better than primitive ovals.
old_boots=bpy.data.objects['Traveller_Boots'];bpy.data.objects.remove(old_boots,do_unlink=True)
textured_copy('Boots','Traveller_Boots')
# Short earth-coloured cape belongs to the leather armor.
traveller_cape=bpy.data.objects['Cape'].copy();traveller_cape.data=traveller_cape.data.copy();traveller_cape.name='Traveller_Cape';scene.collection.objects.link(traveller_cape)
traveller_cape.data.materials.clear()
for m in [olive,edge]:traveller_cape.data.materials.append(m)

arm.data.pose_position='POSE'
objects=[o for o in scene.objects if o.type in ['MESH','ARMATURE']]
for o in scene.objects:o.select_set(False)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=arm
out=ROOT/'public/game/characters/ashen-warrior-equipment-v1.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_optimize_animation_size=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False)
arm.animation_data.action=action;arm.animation_data.action_slot=slot;scene.frame_set(1)
report={'generator':'Blender '+bpy.app.version_string,'bones':len(arm.data.bones),'glbBytes':out.stat().st_size,'meshes':[]}
for o in objects:
    if o.type=='MESH':
        o.data.calc_loop_triangles();report['meshes'].append({'name':o.name,'triangles':len(o.data.loop_triangles),'unweighted':sum(not v.groups for v in o.data.vertices)})
(ASSET/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
visible={'Traveller_Limbs','Traveller_Armor','Traveller_Hood','Traveller_Coif','Traveller_Boots','Traveller_Cape','Weapon_Sword','Copper_Ring','Ember_Amulet'}
for o in objects:
    if o.type=='MESH':o.hide_render=o.name not in visible;o.hide_set(o.name not in visible)
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'ashen-warrior-equipment-v1.blend'))
scene.render.resolution_x=700;scene.render.resolution_y=850;scene.cycles.samples=12
scene.render.filepath=str(ASSET/'renders/traveller.png');bpy.ops.render.render(write_still=True)
print('EQUIPMENT_BUILD',json.dumps({'meshes':len(report['meshes']),'triangles':sum(m['triangles'] for m in report['meshes']),'glbBytes':report['glbBytes']}))
