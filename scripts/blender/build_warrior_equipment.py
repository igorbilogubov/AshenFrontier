"""Generate modular equipment without overwriting the archived Mixamo warrior."""
import bpy, bmesh, json, math, sys
sys.path.insert(0,str(__import__("pathlib").Path(__file__).resolve().parent))
from mixamo_common import import_on_rig,copy_faces,joined,split_body,components
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


# The real Exo Gray face/body replaces the primitive mannequin.
source=ROOT/'art/characters/mixamo-classes-v1/source'
exo=import_on_rig(source/'exo-gray-tpose.fbx',arm,'ExoGray')
# Retain the thin underlying suit for the gaps between the leather sleeves/boots.
suit=next(o for o in exo if 'Exo_Suit' in o.name)
keep=set()
for face in suit.data.polygons:
    if any(any(part in suit.vertex_groups[g.group].name for part in ['Arm','Hand','Leg']) for i in face.vertices for g in suit.data.vertices[i].groups if g.weight>.25):keep.add(face.index)
limbs=copy_faces(suit,'Traveller_Limbs',keep)
base=split_body(exo)
# The fitted hood, tunic, belt, bracers and boots use textured garment topology.
erika=import_on_rig(source/'erika-archer-tpose.fbx',arm,'LeatherSource')
clothes=next(o for o in erika if 'Erika_Archer_Body_Mesh' in o.name)
selections={'Traveller_Hood':set(),'Traveller_Armor':set(),'Traveller_Boots':set()}
for component in components(clothes):
    points=[arm.matrix_world@clothes.data.vertices[i].co for f in component for i in clothes.data.polygons[f].vertices]
    low=[min(v[k] for v in points) for k in range(3)];high=[max(v[k] for v in points) for k in range(3)]
    if low[1]>.10 and low[2]>1.0:continue # arrow/quiver islands
    if high[2]>1.66:key='Traveller_Hood'
    elif high[2]<.50:key='Traveller_Boots'
    elif low[1]>.14:continue # quiver belongs to the archer, not the warrior
    else:key='Traveller_Armor'
    selections[key].update(component)
for name,faces in selections.items():
    obj=copy_faces(clothes,name,faces)
    for index,material in enumerate(list(obj.data.materials)):
        copied=material.copy();copied.name='Traveller_Leather_'+name;obj.data.materials[index]=copied
    if name=='Traveller_Hood':
        # Give the male head room inside the cloth, preserving the draped collar.
        inverse=arm.matrix_world.inverted()
        for vertex in obj.data.vertices:
            point=arm.matrix_world@vertex.co
            if point.z>1.49:point.x*=1.15;point.y=.03+(point.y-.03)*1.12;point.z=1.49+(point.z-1.49)*1.18
            vertex.co=inverse@point
for obj in erika:bpy.data.objects.remove(obj,do_unlink=True)
# Neutral dark undercloth remains visible at wrists and knees, with native fingers.
for index,material in enumerate(list(limbs.data.materials)):
    copied=material.copy();copied.name='Traveller_Undercloth';limbs.data.materials[index]=copied

arm.data.pose_position='POSE'
objects=[o for o in scene.objects if o.type in ['MESH','ARMATURE']]
for o in scene.objects:o.select_set(False)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=arm
out=ROOT/'public/game/characters/ashen-warrior-equipment-v1.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_optimize_animation_size=True,export_materials='EXPORT',export_image_format='JPEG',export_jpeg_quality=88,export_extras=True,export_cameras=False,export_lights=False)
arm.animation_data.action=action;arm.animation_data.action_slot=slot;scene.frame_set(1)
report={'generator':'Blender '+bpy.app.version_string,'bones':len(arm.data.bones),'glbBytes':out.stat().st_size,'meshes':[]}
for o in objects:
    if o.type=='MESH':
        o.data.calc_loop_triangles();report['meshes'].append({'name':o.name,'triangles':len(o.data.loop_triangles),'unweighted':sum(not v.groups for v in o.data.vertices)})
(ASSET/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
visible={'Traveller_Limbs','Traveller_Armor','Traveller_Hood','Base_Head','Traveller_Boots','Weapon_Sword','Copper_Ring','Ember_Amulet'}
for o in objects:
    if o.type=='MESH':o.hide_render=o.name not in visible;o.hide_set(o.name not in visible)
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'ashen-warrior-equipment-v1.blend'))
scene.render.resolution_x=700;scene.render.resolution_y=850;scene.cycles.samples=12
scene.render.filepath=str(ASSET/'renders/traveller.png');bpy.ops.render.render(write_still=True)
print('EQUIPMENT_BUILD',json.dumps({'meshes':len(report['meshes']),'triangles':sum(m['triangles'] for m in report['meshes']),'glbBytes':report['glbBytes']}))
