"""Modular derivatives of the immutable Erika/Dreyar game-ready source scenes."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from mixamo_common import copy_faces,components,joined,import_on_rig
ROOT=Path(__file__).resolve().parents[2];ASSET=ROOT/'art/characters/class-equipment-v1'
REPORT={}

def material(name,color,metal=0,rough=.65):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m

def tint(obj,name,color):
 # Bake colour into copied texture pixels. The GLB and icon render then agree,
 # without requiring a client-only material override or changing source images.
 import numpy as np
 for i,source in enumerate(list(obj.data.materials)):
  mat=source.copy();mat.name=name+'_'+str(i);obj.data.materials[i]=mat
  if not mat.use_nodes:continue
  shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
  if not shader:continue
  shader.inputs['Metallic'].default_value=0;shader.inputs['Roughness'].default_value=.82
  links=shader.inputs['Base Color'].links
  if links and links[0].from_node.type=='TEX_IMAGE':
   node=links[0].from_node;image=node.image.copy();image.name=mat.name+'_Diffuse';pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape((-1,4));pixels[:,:3]*=np.array(color);image.pixels.foreach_set(pixels.ravel());image.pack();node.image=image
  else:shader.inputs['Base Color'].default_value=(*color,1)

class Mesh:
 def __init__(self,name,arm):self.name=name;self.arm=arm;self.v=[];self.f=[];self.mi=[];self.weights=[];self.mats=[]
 def add(self,vertices,faces,mat,bone):
  if mat not in self.mats:self.mats.append(mat)
  off=len(self.v);inv=self.arm.matrix_world.inverted();self.v.extend(inv@Vector(p) for p in vertices);self.f.extend(tuple(off+i for i in f) for f in faces);self.mi.extend([self.mats.index(mat)]*len(faces));self.weights.extend(bone(p) if callable(bone) else {bone:1} for p in vertices)
 def tube(self,points,radii,mat,bone,sides=10):
  points=[Vector(p) for p in points];verts=[]
  for i,p in enumerate(points):
   tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized();normal=tangent.cross(Vector((0,1,0)))
   if normal.length<.01:normal=tangent.cross(Vector((1,0,0)))
   normal.normalize();other=tangent.cross(normal).normalized();r=radii[i] if isinstance(radii,list) else radii
   for j in range(sides):verts.append(p+r*(math.cos(j*math.tau/sides)*normal+math.sin(j*math.tau/sides)*other))
  faces=[(i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j) for i in range(len(points)-1) for j in range(sides)]
  faces += [tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))];self.add(verts,faces,mat,bone)
 def gem(self,center,radius,height,mat,bone):
  x,y,z=center;n=6;verts=[(x,y,z+height/2)]+[(x+radius*math.cos(j*math.tau/n),y+radius*math.sin(j*math.tau/n),z) for j in range(n)]+[(x,y,z-height/2)]
  self.add(verts,[(0,1+j,1+(j+1)%n) for j in range(n)]+[(7,1+(j+1)%n,1+j) for j in range(n)],mat,bone)
 def finish(self):
  mesh=bpy.data.meshes.new(self.name);mesh.from_pydata(self.v,[],self.f);mesh.update();o=bpy.data.objects.new(self.name,mesh);bpy.context.scene.collection.objects.link(o);o.parent=self.arm
  for mat in self.mats:mesh.materials.append(mat)
  for p,i in zip(mesh.polygons,self.mi):p.material_index=i;p.use_smooth=True
  for name in sorted(set(k for row in self.weights for k in row)):
   g=o.vertex_groups.new(name='mixamorig:'+name)
   for i,row in enumerate(self.weights):
    if name in row:g.add([i],row[name],'REPLACE')
  o.modifiers.new('Shared_Rig','ARMATURE').object=self.arm
  return o

def hand_world(arm,side,point):return arm.matrix_world@arm.data.bones['mixamorig:'+side+'Hand'].matrix_local@Vector(point)
def combine(base,extras,name):return joined([base]+extras,name)
def duplicate(obj,name):
 o=obj.copy();o.data=obj.data.copy();o.name=name;bpy.context.scene.collection.objects.link(o);return o

def jewelry(arm,classid,metal,gem):
 ringname='hawk-ring' if classid=='archer' else 'rune-ring';name='leaf-amulet' if classid=='archer' else 'moon-amulet'
 m=Mesh(ringname,arm);pts=[hand_world(arm,'Right',(4+1.1*math.cos(i*math.tau/24),6,2+1.1*math.sin(i*math.tau/24))) for i in range(25)];m.tube(pts,.0028,metal,'RightHand',8);m.finish()
 m=Mesh(name,arm);pts=[(.07*math.cos(i*math.pi/24),-.15-.01*math.sin(i*math.pi/24),1.43-.11*math.sin(i*math.pi/24)) for i in range(25)];m.tube(pts,.0028,metal,'Spine2',8);m.gem((0,-.17,1.302),.024,.065,gem,'Spine2');m.finish()

def bow(arm,name,variant,wood,metal,string):
 m=Mesh(name,arm);length=62 if variant else 55
 # Recurved, tapered limbs, reinforced grip, brass limb tips and layered overlays.
 local=[(-length,0,-8),(-length*.87,0,0),(-length*.62,0,13),(-length*.25,0,18),(0,0,12),(length*.25,0,18),(length*.62,0,13),(length*.87,0,0),(length,0,-8)]
 world=lambda p:hand_world(arm,'Left',p)
 m.tube([world(p) for p in local],[.007,.013,.019,.022,.02,.022,.019,.013,.007],wood,'LeftHand',12)
 m.tube([world((-length,0,-8)),world((length,0,-8))],.0016,string,'LeftHand',6)
 m.tube([world((-8,0,12)),world((8,0,12))],.025,metal,'LeftHand',12)
 for sign in [-1,1]:
  for k in [20,28,36]:m.tube([world((sign*(k-1),-.5,17)),world((sign*(k+1),-.5,17))],.023,metal,'LeftHand',8)
  if variant:
   m.tube([world((sign*25,0,18)),world((sign*40,-1,25)),world((sign*53,0,13))],[.018,.013,.002],metal,'LeftHand',10)
 return m.finish()

def staff(arm,name,variant,wood,metal,gem):
 m=Mesh(name,arm);world=lambda x,y,z:hand_world(arm,'Right',(x,y+7,z+2))
 m.tube([world(-72,0,0),world(-48,0,0),world(0,0,0),world(53,0,0)],[.018,.022,.019,.025],wood,'RightHand',12)
 for x in [-64,-20,-12,25,43,49]:m.tube([world(x-1,0,0),world(x+1,0,0)],.031,metal,'RightHand',12)
 if variant:
  # Split crescent prongs around the faceted focus.
  for sign in [-1,1]:m.tube([world(45,0,0),world(58,0,sign*12),world(72,0,sign*11),world(80,0,sign*3)],[.027,.025,.016,.003],metal,'RightHand',10)
 else:
  for sign in [-1,1]:m.tube([world(45,0,0),world(56,0,sign*8),world(66,0,sign*5)],[.025,.019,.005],wood,'RightHand',10)
 # Gem built in bone coordinates so its long axis follows the staff.
 center=world(63,0,0);axis=(world(64,0,0)-center).normalized();u=(world(63,1,0)-center).normalized();v=axis.cross(u);r=.057 if variant else .044;h=.17
 vertices=[center+axis*h/2]+[center+r*(math.cos(i*math.tau/6)*u+math.sin(i*math.tau/6)*v) for i in range(6)]+[center-axis*h/2]
 m.add(vertices,[(0,1+i,1+(i+1)%6) for i in range(6)]+[(7,1+(i+1)%6,1+i) for i in range(6)],gem,'RightHand');return m.finish()

def mantle(arm,name,mat,metal,variant,mage=False):
 m=Mesh(name,arm)
 # Tailored rear mantle with shoulder yoke and a curved scalloped hem, 3D thickness.
 rows=7;cols=10;verts=[]
 for j in range(rows):
  t=j/(rows-1);width=(.22 if mage else .24)*(1-.10*t)
  for i in range(cols):
   u=i/(cols-1)*2-1;verts.append((u*width,.14+.035*(1-u*u)+.035*t,1.46-t*(.67 if mage else .57)+.035*u*u*t))
 weights=lambda p:{'Spine2':max(0,min(1,(p[2]-1.02)/.3)),'Hips':1-max(0,min(1,(p[2]-1.02)/.3))}
 m.add(verts,[(j*cols+i,j*cols+i+1,(j+1)*cols+i+1,(j+1)*cols+i) for j in range(rows-1) for i in range(cols-1)],mat,weights)
 m.tube([verts[(rows-1)*cols+i] for i in range(cols)],.008,metal,'Hips',8)
 o=m.finish();mod=o.modifiers.new('Tailored_Thickness','SOLIDIFY');mod.thickness=.004
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def shoulders(arm,name,metal,cloth,mage=False):
 m=Mesh(name,arm)
 for sign in [-1,1]:
  bone='LeftArm' if sign>0 else 'RightArm'
  # Four overlapping pointed lamellae follow the shoulder and upper-arm contour.
  for j in range(4):
   x=sign*(.19+j*.04);z=1.515-j*.012;w=.09;depth=.125
   verts=[(x-sign*.035,-depth,z-.02),(x+sign*.055,-depth*.75,z-.045),(x+sign*.07,0,z+.025),(x+sign*.04,depth*.8,z-.02),(x-sign*.035,depth,z-.04),(x-sign*.04,0,z+.018)]
   m.add(verts,[(0,1,2,5),(5,2,3,4)],metal,bone);m.tube([verts[0],verts[1],verts[2],verts[3]],.004,cloth,bone,6)
 return m.finish()

def robe(arm,name,cloth,trim,long):
 m=Mesh(name,arm);n=28;rows=5;verts=[]
 for j in range(rows):
  t=j/(rows-1);z=1.02-t*(.64 if long else .47)
  for i in range(n):
   a=i*math.tau/n;radius=.215+t*.075+.006*math.cos(a*14);verts.append((radius*math.cos(a),radius*.77*math.sin(a),z+.025*math.cos(a*2)*t))
 def weight(p):
  t=max(0,min(.9,(1.02-p[2])*2.5));return {'Hips':1-t,('LeftUpLeg' if p[0]>0 else 'RightUpLeg'):t}
 m.add(verts,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(rows-1) for i in range(n) if math.sin((i+.5)*math.tau/n)>-.25],cloth,weight)
 m.tube([verts[(rows-1)*n+i] for i in range(n//2+1)],.007,trim,weight,8)
 # Flat embroidered tabs follow the jacket; solid ribbons avoid rod-like trim.
 for sign in [-1,1]:
  verts=[(sign*(.07+d),y,z) for y,z in [(-.157,1.37),(-.177,1.18),(-.18,1.07)] for d in [-.017,.017]]
  m.add(verts,[(0,1,3,2),(2,3,5,4)],trim,'Spine1')
 o=m.finish();mod=o.modifiers.new('Cloth_Thickness','SOLIDIFY');mod.thickness=.004;bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);return o

def crown(arm,name,metal,gem):
 m=Mesh(name,arm);pts=[(.105*math.cos(a),.005+.116*math.sin(a),1.65) for a in [i*math.tau/32 for i in range(33)]];m.tube(pts,.009,metal,'Head',10)
 for i in range(7):
  a=math.pi+i*math.pi/6;x=.105*math.cos(a);y=.005+.116*math.sin(a);h=.10 if i==3 else .045
  m.tube([(x,y,1.65),(x*1.12,y*1.08,1.65+h)],[.012,.001],metal,'Head',8)
 m.gem((0,-.119,1.665),.017,.049,gem,'Head');return m.finish()

for classid,prefixes in [('archer',['ranger','sentinel']),('mage',['acolyte','runekeeper'])]:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/f'art/characters/mixamo-classes-v1/ashen-{classid}-v1.blend'))
 scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');action=arm.animation_data.action;actionslot=arm.animation_data.action_slot;arm.animation_data.action=None;arm.data.pose_position='REST'
 for o in scene.objects:o.hide_set(False);o.hide_render=False
 bpy.context.view_layer.update();source=bpy.data.objects['Class_Body'];groups={k:set() for k in ['Body','Head','Boots','Hood']}
 for comp in components(source):
  points=[source.matrix_world@source.data.vertices[i].co for f in comp for i in source.data.polygons[f].vertices];lo=[min(p[k] for p in points) for k in range(3)];hi=[max(p[k] for p in points) for k in range(3)];mat=source.data.polygons[next(iter(comp))].material_index
  if classid=='archer':key='Head' if mat!=0 else 'Hood' if hi[2]>1.66 else 'Boots' if hi[2]<.5 else 'Body'
  else:key='Head' if hi[2]>1.60 else 'Boots' if hi[2]<.45 else 'Body'
  groups[key].update(comp)
 parts={k:copy_faces(source,'Class_Base_'+k,v) for k,v in groups.items() if v};bpy.data.objects.remove(source,do_unlink=True)
 if classid=='mage':
  head=parts['Head'];hairfaces={f.index for f in head.data.polygons if all((arm.matrix_world@head.data.vertices[i].co).z>1.65 for i in f.vertices)}
  hair=copy_faces(head,'Class_Base_Hair',hairfaces);face=copy_faces(head,'Class_Head_NoHair',set(range(len(head.data.polygons)))-hairfaces)
  bpy.data.objects.remove(head,do_unlink=True);face.name='Class_Base_Head';parts['Head']=face
 # Natural face, original hands and original clothes ensure no gaps when stripped.
 if classid=='archer':hood=parts.pop('Hood');hood.name='ranger-hood'
 else:
  imported=import_on_rig(ROOT/'art/characters/mixamo-classes-v1/source/erika-archer-tpose.fbx',arm,'HoodSource');clothes=next(o for o in imported if 'Erika_Archer_Body_Mesh' in o.name);faces=set()
  for comp in components(clothes):
   points=[arm.matrix_world@clothes.data.vertices[i].co for f in comp for i in clothes.data.polygons[f].vertices]
   if len(comp)>100 and max(p.z for p in points)>1.66 and min(p.y for p in points)<0:faces.update(comp)
  hood=copy_faces(clothes,'acolyte-hood',faces)
  for o in imported:bpy.data.objects.remove(o,do_unlink=True)
  inv=arm.matrix_world.inverted()
  for v in hood.data.vertices:
   p=arm.matrix_world@v.co
   if p.z>1.47:p.x*=1.13;p.y=.02+(p.y-.02)*1.16;p.z=1.47+(p.z-1.47)*1.34
   v.co=inv@p
 colors=[(.58,.83,.53),(.30,.54,.65)] if classid=='archer' else [(.55,.47,.74),(.23,.37,.67)]
 metal=material(classid+'_BrushedMetal',(.36,.26,.105) if classid=='archer' else (.46,.51,.62),.75,.35)
 wood=material(classid+'_DarkWood',(.12,.058,.025),0,.76);wood2=material(classid+'_Heartwood',(.21,.12,.055),0,.68);string=material('Linen_Bowstring',(.65,.55,.36));gem=material(classid+'_Gem',(.11,.30,.12) if classid=='archer' else (.21,.42,.75),.35,.27)
 for i,prefix in enumerate(prefixes):
  body=duplicate(parts['Body'],prefix+'-armor');boots=duplicate(parts['Boots'],prefix+'-boots');tint(body,prefix+'_Garment',colors[i]);tint(boots,prefix+'_Boots',colors[i]);cloth=material(prefix+'_Cloth',(.045,.12,.095) if classid=='archer' else ((.055,.038,.095) if i==0 else (.018,.035,.07)))
  extras=[]
  if i:extras += [mantle(arm,prefix+'_Mantle',cloth,metal,i,classid=='mage'),shoulders(arm,prefix+'_Pauldrons',metal,cloth,classid=='mage')]
  if classid=='mage':extras.append(robe(arm,prefix+'_Robe',cloth,metal,i==1))
  if extras:body=combine(body,extras,prefix+'-armor')
  if i:
   # Raised metal calf bands and a longer cuff distinguish the second boots.
   detail=Mesh(prefix+'_Greaves',arm)
   for sign in [-1,1]:
    bone='LeftLeg' if sign>0 else 'RightLeg'
    for z in [.20,.28,.34]:detail.tube([(sign*.1+.065*math.cos(a),.045+.073*math.sin(a),z) for a in [j*math.tau/16 for j in range(17)]],.008,metal,bone,8)
   boots=combine(boots,[detail.finish()],prefix+'-boots')
  if classid=='archer':bow(arm,prefix+'-bow',i,wood if not i else wood2,metal,string)
  else:staff(arm,prefix+'-staff',i,wood if not i else wood2,metal,gem)
  if not i:tint(hood,prefix+'_Hood',colors[i])
  elif classid=='archer':
   h=duplicate(hood,'sentinel-hood');tint(h,prefix+'_Hood',(.52,.70,.84));h=combine(h,[crown(arm,'Sentinel_Circlet',metal,gem)],'sentinel-hood')
  else:crown(arm,'runekeeper-crown',metal,gem)
 jewelry(arm,classid,metal,gem)
 # Base clothes retain the source shape and UV detail, in muted everyday cloth.
 tint(parts['Body'],'Base_'+classid,(.48,.46,.43));tint(parts['Boots'],'BaseBoots_'+classid,(.36,.34,.32))
 arm.data.pose_position='POSE';objects=[o for o in scene.objects if o.type in ['MESH','ARMATURE']]
 for o in scene.objects:o.select_set(False)
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=arm;out=ROOT/f'public/game/characters/ashen-{classid}-equipment-v1.glb'
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_optimize_animation_size=True,export_materials='EXPORT',export_image_format='JPEG',export_jpeg_quality=88,export_extras=True,export_cameras=False,export_lights=False)
 REPORT[classid]={'bones':len(arm.data.bones),'glbBytes':out.stat().st_size,'meshes':[]}
 for o in objects:
  if o.type=='MESH':o.data.calc_loop_triangles();REPORT[classid]['meshes'].append({'name':o.name,'triangles':len(o.data.loop_triangles),'unweighted':sum(not v.groups for v in o.data.vertices)})
 arm.animation_data.action=action;arm.animation_data.action_slot=actionslot;scene.frame_set(1)
 visible={'Class_Base_Head',prefixes[0]+'-armor',prefixes[0]+'-boots',prefixes[0]+'-hood',prefixes[0]+('-bow' if classid=='archer' else '-staff'),'hawk-ring' if classid=='archer' else 'rune-ring','leaf-amulet' if classid=='archer' else 'moon-amulet'}
 for o in objects:
  if o.type=='MESH':o.hide_render=o.name not in visible;o.hide_set(o.name not in visible)
 bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/f'ashen-{classid}-equipment-v1.blend'),compress=True)
 scene.render.resolution_x=700;scene.render.resolution_y=850;scene.cycles.samples=12;scene.render.filepath=str(ASSET/f'renders/{classid}.png');bpy.ops.render.render(write_still=True)
(ASSET/'build-report.json').write_text(json.dumps(REPORT,indent=2)+'\n');print('CLASS_EQUIPMENT',json.dumps(REPORT))
