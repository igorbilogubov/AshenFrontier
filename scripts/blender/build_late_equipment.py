"""Author late-game modular gear against the approved Mixamo bind skeleton.
Only late-equipment-v1 outputs are written. No source character meshes are exported.
"""
import bpy,json,math,sys,zlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
ROOT=Path(__file__).resolve().parents[2]
ASSET=ROOT/'art/characters/late-equipment-v1';OUT=ROOT/'public/game/characters'
ASSET.mkdir(parents=True,exist_ok=True)
REPORT={}

def mat(name,hexcolor,metal=0,rough=.55,emission=False):
 c=tuple(int(hexcolor[i:i+2],16)/255 for i in (0,2,4));c=tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=.08
 if name.endswith('_Metal') or name.endswith('_Cloth'):
  # Deterministic authored surface texture: subtle hammered grain or woven cloth.
  # This map belongs to the generator; no third-party texture/image is copied.
  size=256;yy,xx=np.mgrid[0:size,0:size]/size;rng=np.random.default_rng(zlib.crc32(name.encode()))
  grain=np.zeros((size,size))
  for frequency,amount in [(3,.060),(9,.032),(27,.014),(74,.008)]:
   for _ in range(3):
    angle=rng.uniform(0,math.tau);phase=rng.uniform(0,math.tau);grain+=np.sin((xx*math.cos(angle)+yy*math.sin(angle))*frequency*math.tau+phase)*amount/3
  grain+=rng.normal(0,.009,(size,size))
  if name.endswith('_Cloth'):grain+=(np.sin(xx*math.tau*110)+np.sin(yy*math.tau*110))*.023
  else:
   for _ in range(18):
    start=rng.uniform(0,1,2);angle=rng.uniform(0,math.tau);length=rng.uniform(.01,.13);a=(xx-start[0])*math.cos(angle)+(yy-start[1])*math.sin(angle);b=-(xx-start[0])*math.sin(angle)+(yy-start[1])*math.cos(angle);grain+=((a>0)&(a<length)&(np.abs(b)<.0015))*.075
  pixels=np.ones((size,size,4),dtype=np.float32);pixels[:,:,:3]=np.clip(np.array([int(hexcolor[i:i+2],16)/255 for i in (0,2,4)])[None,None,:]*(.96+grain[:,:,None]),0,1)
  image=bpy.data.images.new(name+'_Surface',width=size,height=size);image.pixels.foreach_set(pixels.ravel());image.file_format='PNG';folder=ASSET/'textures';folder.mkdir(exist_ok=True);image.filepath_raw=str(folder/(name+'.png'));image.save();image.pack()
  node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;m.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color'])
 return m
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
  for p,i in zip(mesh.polygons,self.mi):p.material_index=i;p.use_smooth=False
  for name in sorted(set(k for row in self.weights for k in row)):
   g=o.vertex_groups.new(name='mixamorig:'+name)
   for i,row in enumerate(self.weights):
    if name in row:g.add([i],row[name],'REPLACE')
  o.modifiers.new('Shared_Rig','ARMATURE').object=self.arm
  for item in bpy.context.selected_objects:item.select_set(False)
  o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.1519,island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
  return o

def hand_world(arm,side,point):return arm.matrix_world@arm.data.bones['mixamorig:'+side+'Hand'].matrix_local@Vector(point)

def plate(m,points,material,bone,thickness=.012):
 points=[Vector(p) for p in points];normal=(points[1]-points[0]).cross(points[2]-points[0]).normalized();center=sum(points,Vector())/len(points);n=len(points)
 inner=[center+(p-center)*.88+normal*.004 for p in points]
 vertices=points+inner+[p-normal*thickness for p in points]
 faces=[tuple(range(n,n*2)),tuple(reversed(range(n*2,n*3)))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[(i,i+n*2,(i+1)%n+n*2,(i+1)%n) for i in range(n)]
 m.add(vertices,faces,material,bone)

def torso_weights(p):
 if p[2]<1.10:return {'Hips':max(0,(1.10-p[2])/.14),'Spine':min(1,(p[2]-.96)/.14)}
 if p[2]<1.30:return {'Spine':(1.30-p[2])/.20,'Spine1':(p[2]-1.10)/.20}
 return {'Spine2':1}

def torso(m,tier,cls,metal,cloth,trim,glow):
 # Fitted open-neck breastplate: sculpted cross sections, facets and a raised ridge.
 rings=[(1.00,.205,.147),(1.08,.177,.145),(1.25,.192,.17),(1.40,.242,.17),(1.49,.205,.115)]
 n=16;verts=[]
 for z,rx,ry in rings:
  for i in range(n):
   a=i*math.tau/n;verts.append((rx*math.cos(a),ry*math.sin(a),z))
 m.add(verts,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(rings)-1) for i in range(n)],metal if cls=='warrior' else cloth,torso_weights)
 # Chevron panels with thickness preserve a crafted silhouette under overhead light.
 for sign in [-1,1]:
  for row in range(2+tier):
   z=1.40-row*.075;x=.14 if row<2 else .11
   plate(m,[(sign*.015,-.178,z+.016),(sign*x,-.166,z+.038),(sign*(x+.015),-.166,z-.012),(sign*.015,-.183,z-.031)],metal if cls=='warrior' else cloth,'Spine2' if row<2 else 'Spine1')
  m.tube([(sign*.175,-.125,1.43),(sign*.118,-.18,1.24),(sign*.14,-.166,1.07)],.007,trim,torso_weights,6)
 m.gem((0,-.195,1.385),.027+tier*.003,.075,glow,'Spine2')
 # Layered shoulder plates. Distinct tiers: scale fans, forged hexagons, flame fins, gothic wings.
 for sign in [-1,1]:
  bone='LeftArm' if sign>0 else 'RightArm'
  count=(3 if tier==0 else 4 if tier<3 else 5) if cls=='warrior' else (3+tier if sign>0 else 2) if cls=='archer' else 2
  for k in range(count):
   x=sign*(.225+k*.037);z=1.49-k*.008;width=.060+(tier*.005);y=.155-(k*.009)
   if tier==0:points=[(x-sign*.04,-y,z),(x+sign*width,-y*.6,z-.025),(x+sign*(width+.02),0,z+.035),(x+sign*width,y*.7,z-.025),(x-sign*.04,y,z)]
   elif tier==1:points=[(x-sign*.04,-y,z+.015),(x+sign*width,-y,z+.015),(x+sign*(width+.016),-.035,z+.065),(x+sign*(width+.016),.07,z+.065),(x-sign*.025,y,z)]
   elif tier==2:points=[(x-sign*.04,-y,z),(x+sign*.06,-y*.6,z+.015),(x+sign*.105,0,z+.16-k*.014),(x+sign*.07,y*.7,z+.02),(x-sign*.025,y,z)]
   else:points=[(x-sign*.04,-y,z),(x+sign*.067,-y*.7,z+.035),(x+sign*.14,0,z+.18-k*.011),(x+sign*.078,y*.7,z+.02),(x-sign*.04,y,z)]
   if cls=='mage':
    points=[(sign*.18,-.12,1.50),(sign*.25,-.105,1.51),(sign*(.27+k*.045),0,1.62+tier*.023),(sign*.22,.11,1.50)]
   elif cls=='archer':points=[(p[0],p[1]*.82,1.49+(p[2]-1.49)*.55) for p in points]
   plate(m,points,metal if cls=='warrior' else cloth if cls=='archer' else trim,bone);m.tube(points[:3],.004,trim,bone,6)
   if cls=='mage':m.gem((sign*(.235+k*.04),-.015,1.575+tier*.018),.021,.07+tier*.01,glow,bone)
  # Forearm bracers follow their own forearm rather than sticking to the torso.
  fore='LeftForeArm' if sign>0 else 'RightForeArm'
  center=Vector((sign*.53,0,1.47));plate(m,[(center.x-sign*.07,-.08,1.47),(center.x+sign*.12,-.065,1.465),(center.x+sign*.14,0,1.55),(center.x-sign*.07,.075,1.49)],metal,fore)
 # Belt and split tassets. Mage has long side panels; archer angled short coats.
 for sign in [-1,1]:
  bone='LeftUpLeg' if sign>0 else 'RightUpLeg';end=.43 if cls=='mage' else .74 if cls=='archer' else .79
  for k in range(2 if cls=='warrior' else 3):
   x=sign*(.07+k*.055);plate(m,[(x-sign*.03,-.16,1.045),(x+sign*.04,-.145,1.03),(x+sign*.075,-.16,end+.02*k),(x-sign*.03,-.17,end-.04)],cloth if cls!='warrior' else metal,bone,.007)
   if tier>0:m.tube([(x,-.177,1.025),(x+sign*.025,-.185,end+.03)],.004,trim,bone,6)
 plate(m,[(-.19,-.158,1.05),(.19,-.158,1.05),(.18,-.17,1.00),(-.18,-.17,1.00)],trim,'Hips')
 m.gem((0,-.188,1.026),.028,.044,glow,'Hips')
 # Mantle's segmented panels visibly grow in complexity, with leg weights near the hem.
 cols=10;rows=6;v=[]
 for row in range(rows):
  t=row/(rows-1);width=.22+t*(.055+tier*.014)
  for col in range(cols):
   u=col/(cols-1)*2-1;v.append((u*width,.175+t*.045+.016*math.cos(u*math.pi*3),1.48-t*(.56+tier*.055)+.065*abs(u)*t))
 weight=lambda p:{'Spine2':max(0,min(1,(p[2]-.96)/.40)),'Hips':1-max(0,min(1,(p[2]-.96)/.40))}
 m.add(v,[(r*cols+c,r*cols+c+1,(r+1)*cols+c+1,(r+1)*cols+c) for r in range(rows-1) for c in range(cols-1)],cloth,weight)
 m.tube([v[(rows-1)*cols+c] for c in range(cols)],.005,trim,weight,6)
 if tier>=2:
  for sign in [-1,1]:plate(m,[(sign*.08,.192,1.44),(sign*.17,.207,1.35),(sign*.12,.22,1.12),(sign*.04,.205,1.34)],trim,'Spine2',.004)

def helmet(m,tier,cls,metal,cloth,trim,glow):
 if cls=='warrior':
  # Open visor and cheeks; intentionally angular, with a raised crest at high tiers.
  n=12;v=[]
  for z,rx,ry in [(1.59,.11,.115),(1.72,.112,.116),(1.79,.055,.075)]:
   for i in range(n):a=i*math.tau/n;v.append((rx*math.cos(a),.018+ry*math.sin(a),z))
  m.add(v,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(2) for i in range(n) if j or math.sin((i+.5)*math.tau/n)>-.8]+[tuple(range(n*2,n*3))],metal,'Head')
  if tier>=1:
   for sign in [-1,1]:
    for j in range(tier+2):m.tube([(sign*.045,-.122,1.642-j*.014),(sign*.094,-.103,1.65-j*.014)],.0035,trim,'Head',6)
  if tier==3:
   for j in range(5):
    x=(j-2)*.027;plate(m,[(x-.013,-.020,1.785),(x+.013,-.020,1.785),(x*1.1,-.028,1.92-abs(j-2)*.018)],trim,'Head')
  for sign in [-1,1]:plate(m,[(sign*.025,-.114,1.70),(sign*.105,-.094,1.71),(sign*.10,-.095,1.57),(sign*.065,-.11,1.54)],metal,'Head');m.tube([(sign*.025,-.12,1.69),(sign*.096,-.10,1.695)],.006,glow,'Head',6)
  plate(m,[(-.025,-.119,1.72),(.025,-.119,1.72),(.017,-.135,1.58),(0,-.15,1.565),(-.017,-.135,1.58)],trim,'Head')
 elif cls=='archer':
  # Hood-like open shell plus long swept temples, preserves the face and bow sightline.
  n=16;v=[]
  for z,rx,ry in [(1.56,.132,.12),(1.71,.128,.132),(1.79,.045,.068)]:
   for i in range(n):a=i*math.tau/n;v.append((rx*math.cos(a),.025+ry*math.sin(a),z))
  m.add(v,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(2) for i in range(n) if math.sin((i+.5)*math.tau/n)>-.72],cloth,'Head')
  for sign in [-1,1]:plate(m,[(sign*.09,-.074,1.70),(sign*.14,.015,1.73),(sign*.105,.13,1.84+tier*.025),(sign*.072,.075,1.69)],metal,'Head')
 else:
  # Circlet/crown with separate ascending fins; no opaque helmet hiding the mage's face.
  pts=[(.112*math.cos(a),.005+.119*math.sin(a),1.69) for a in [i*math.tau/24 for i in range(25)]];m.tube(pts,.011,metal,'Head',8)
  for i in range(5+tier*2):
   a=math.pi+i*math.pi/(4+tier*2);x=.112*math.cos(a);y=.005+.119*math.sin(a);h=.075+tier*.035
   plate(m,[(x-.015,y,1.69),(x+.015,y,1.69),(x*1.3,y*1.25,1.69+h),(x-.01,y,1.735)],metal,'Head')
 for sign in [-1,1]:
  height=.04+tier*.04
  if tier==0:points=[(sign*.09,.04,1.74),(sign*.16,.075,1.82),(sign*.17,.09,1.875)]
  elif tier==1:points=[(sign*.08,.045,1.75),(sign*.15,.05,1.81),(sign*.15,.06,1.875)]
  elif tier==2:points=[(sign*.08,.04,1.76),(sign*.20,.09,1.85),(sign*.18,.03,1.965)]
  else:points=[(sign*.07,.035,1.77),(sign*.14,.03,1.84),(sign*.13,-.03,1.98),(sign*.095,-.07,2.02)]
  m.tube(points,[.02]*(len(points)-1)+[.003],trim,'Head',8)
 m.gem((0,-.127,1.722),.021+tier*.003,.058+tier*.008,glow,'Head')

def boots(m,tier,cls,metal,cloth,trim,glow):
 for sign in [-1,1]:
  leg='LeftLeg' if sign>0 else 'RightLeg';foot='LeftFoot' if sign>0 else 'RightFoot';x=sign*.11
  # Segment toward the ankle and layer a separate sabaton on the foot bone.
  for k in range(3+tier):
   z=.12+k*.055;w=.058+k*.004
   plate(m,[(x-w,-.083,z+.047),(x+w,-.083,z+.047),(x+w*.8,-.105,z),(x,-.12,z-.012),(x-w*.8,-.105,z)],metal if cls=='warrior' else cloth,leg)
  for k in range(3):
   y=-.06-k*.045;plate(m,[(x-.063,y,.09),(x+.063,y,.09),(x+.07,y-.05,.054),(x-.07,y-.05,.054)],metal if cls=='warrior' else cloth,foot)
  m.tube([(x,-.13,.13),(x,-.10,.25+tier*.035)],.004,glow,leg,6)
  if tier>=2:plate(m,[(x-.045,-.087,.30),(x+.045,-.087,.30),(x,-.11,.415+tier*.015)],trim,leg)

def weapon(m,arm,tier,cls,metal,cloth,trim,glow):
 if cls=='warrior':
  # Blade along hand-local X, grip matches approved sword socket.
  world=lambda x,y,z:hand_world(arm,'Right',(x,y+7,z+2));length=90+tier*7;width=5+tier*.8
  blade=[world(10,-1,-width),world(length-16,-1,-width*.85),world(length,-1,0),world(length-16,-1,width*.85),world(10,-1,width)]
  plate(m,blade,metal,'RightHand',.015)
  m.tube([world(-15,0,0),world(10,0,0)],.020,cloth,'RightHand',10)
  for sign in [-1,1]:m.tube([world(10,0,0),world(8,0,sign*(14+tier*2)),world(16+tier*3,0,sign*(16+tier*2))],[.024,.018,.005],trim,'RightHand',8)
  for side in [-1,1]:
   m.tube([world(18,side*2,0),world(length-11,side*2,0)],.0045,glow,'RightHand',6)
   for sign in [-1,1]:m.tube([world(14,side*1.3,sign*width),world(length-16,side*1.3,sign*width*.85),world(length,side*1.3,0)],.002,trim,'RightHand',6)
  for k in range(tier+2):m.gem(world(23+k*14,-2,0),.011,.022,glow,'RightHand')
  if tier>=2:
   for sign in [-1,1]:plate(m,[world(15,0,sign*width),world(33,0,sign*width),world(20,0,sign*(width+7)),world(9,0,sign*(width+4))],trim,'RightHand')
 elif cls=='archer':
  world=lambda p:hand_world(arm,'Left',p);length=64+tier*4
  points=[(-length,0,-8),(-length*.86,0,1),(-length*.56,0,17),(-length*.26,0,21),(0,0,12),(length*.26,0,21),(length*.56,0,17),(length*.86,0,1),(length,0,-8)]
  m.tube([world(p) for p in points],[.005,.014,.022,.026,.023,.026,.022,.014,.005],metal if tier>0 else cloth,'LeftHand',10)
  m.tube([world((-8,0,12)),world((8,0,12))],.027,cloth,'LeftHand',10)
  # High-tier bows have open double limbs and hooked tip blades, not thicker recolours.
  for sign in [-1,1]:
   m.tube([world((sign*13,-1,18)),world((sign*33,-1,25+tier*3)),world((sign*52,-1,15))],[.012,.015,.004],trim,'LeftHand',8)
   for k in range(2+tier):
    x=sign*(20+k*8);plate(m,[world((x,-1,18)),world((x+sign*8,-1,15)),world((x+sign*12,-1,30+tier*2)),world((x+sign*3,-1,25))],metal,'LeftHand',.008)
   m.tube([world((sign*14,-2,20)),world((sign*37,-2,25+tier*2))],.004,glow,'LeftHand',6)
  m.gem(world((0,-2,14)),.023,.067,glow,'LeftHand')
  # Dynamic string is drawn by bow-presentation.ts and touches these exact tip sockets.
 else:
  world=lambda x,y,z:hand_world(arm,'Right',(x,y+7,z+2));length=62+tier*4
  m.tube([world(-72,0,0),world(-35,0,0),world(15,0,0),world(length-18,0,0)],[.019,.023,.022,.032],cloth,'RightHand',10)
  for x in [-63,-18,-10,16,length-25]:m.tube([world(x-1,0,0),world(x+1,0,0)],.032,trim,'RightHand',8)
  # Root fork, angular prism cage, crescent and crowned astrolabe progression.
  for sign in [-1,1]:
   if tier==0:points=[world(length-22,0,0),world(length-8,0,sign*13),world(length+9,0,sign*11),world(length+18,0,sign*2)]
   elif tier==1:points=[world(length-21,0,0),world(length-9,0,sign*13),world(length+13,0,sign*13),world(length+24,0,0)]
   elif tier==2:points=[world(length-23,0,0),world(length-6,0,sign*18),world(length+13,0,sign*18),world(length+27,0,sign*5)]
   else:points=[world(length-24,0,0),world(length-6,0,sign*21),world(length+14,0,sign*16),world(length+31,0,sign*8)]
   m.tube(points,[.029,.026,.020,.003],metal,'RightHand',10)
  center=world(length+4,0,0);axis=(world(length+5,0,0)-center).normalized();u=(world(length+4,1,0)-center).normalized();v=axis.cross(u);r=.058+tier*.010;h=.19+tier*.022
  vertices=[center+axis*h/2]+[center+r*(math.cos(i*math.tau/6)*u+math.sin(i*math.tau/6)*v) for i in range(6)]+[center-axis*h/2]
  m.add(vertices,[(0,1+i,1+(i+1)%6) for i in range(6)]+[(7,1+(i+1)%6,1+i) for i in range(6)],glow,'RightHand')
  if tier==3:
   pts=[world(length+4,13*math.cos(i*math.tau/24),13*math.sin(i*math.tau/24)) for i in range(25)];m.tube(pts,.008,trim,'RightHand',8)

def jewelry(m,arm,tier,slot,metal,glow):
 if slot=='ring':
  world=lambda p:hand_world(arm,'Right',p);pts=[world((4+1.15*math.cos(i*math.tau/24),6,2+1.15*math.sin(i*math.tau/24))) for i in range(25)];m.tube(pts,.0028,metal,'RightHand',8);m.gem(world((4,6,3.4)),.008+tier*.001,.018,glow,'RightHand')
 else:
  pts=[(.08*math.cos(i*math.pi/24),-.179-.009*math.sin(i*math.pi/24),1.43-.14*math.sin(i*math.pi/24)) for i in range(25)];m.tube(pts,.003,metal,'Spine2',6)
  m.gem((0,-.199,1.275),.026+tier*.002,.08+tier*.01,glow,'Spine2')
  for sign in [-1,1]:m.tube([(0,-.198,1.34),(sign*.040,-.198,1.29),(0,-.198,1.22)],.004,metal,'Spine2',6)

CONFIG={
 'swamp':{'prefixes':['bogwarden','reedstalker','mireoracle'],'metal':'77816a','cloth':'293a31','trim':'b5aa74','glow':['7ed8a4','b4d67a','7cd9c5']},
 'mines':{'prefixes':['ironbound','deepdelver','crystalweaver'],'metal':'839caa','cloth':'263441','trim':'c6a060','glow':['7bd5f7','e6ba78','81aff3']},
 'rift':{'prefixes':['riftbreaker','emberhawk','voidcaller'],'metal':'624c58','cloth':'302638','trim':'c59967','glow':['e79462','f5d275','be91f3']},
 'citadel':{'prefixes':['dreadsovereign','nightsovereign','astralsovereign'],'metal':'666d8a','cloth':'242638','trim':'d6c19b','glow':['bfb0ff','9ce8d6','d5c8ff']}
}
for ci,cls in enumerate(['warrior','archer','mage']):
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/f'ashen-{cls}-equipment-v1.glb'))
 arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');arm.animation_data_clear();arm.data.pose_position='REST'
 for obj in list(bpy.context.scene.objects):
  if obj.type!='ARMATURE':bpy.data.objects.remove(obj,do_unlink=True)
 bpy.context.view_layer.update();meshes=[]
 for tier,(region,cfg) in enumerate(CONFIG.items()):
  prefix=cfg['prefixes'][ci];metal=mat(prefix+'_Metal',cfg['metal'],.38,.60);cloth=mat(prefix+'_Cloth',cfg['cloth'],0,.86);trim=mat(prefix+'_Trim',cfg['trim'],.78,.32);glow=mat(prefix+'_Glow',cfg['glow'][ci],.3,.26,True)
  for slot in ['weapon','armor','helmet','boots','ring','amulet']:
   mesh=Mesh(prefix+'-'+slot,arm)
   if slot=='weapon':weapon(mesh,arm,tier,cls,metal,cloth,trim,glow)
   elif slot=='armor':torso(mesh,tier,cls,metal,cloth,trim,glow)
   elif slot=='helmet':helmet(mesh,tier,cls,metal,cloth,trim,glow)
   elif slot=='boots':boots(mesh,tier,cls,metal,cloth,trim,glow)
   else:jewelry(mesh,arm,tier,slot,trim,glow)
   obj=mesh.finish();obj['equipmentSlot']=slot;obj['appearance']=prefix+'-'+slot;obj['collection']=prefix
   if cls=='archer' and slot=='weapon':obj['lateBow']=True;obj['bowLength']=64+tier*4
   meshes.append(obj)
 # Export only our geometry and shared bind skeleton; no copies of the licensed body/textures.
 bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/f'ashen-{cls}-late-equipment-v1.blend'))
 for o in bpy.context.scene.objects:o.select_set(True)
 path=OUT/f'ashen-{cls}-late-equipment-v1.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_yup=True,export_materials='EXPORT',export_skins=True,export_apply=False)
 REPORT[cls]={'file':path.name,'bytes':path.stat().st_size,'bones':len(arm.data.bones),'collections':4,'parts':[{'name':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)} for o in meshes]}
(ASSET/'build-report.json').write_text(json.dumps({'generator':'Blender '+bpy.app.version_string,'classes':REPORT},indent=2)+'\n')
