"""Render regional material variants of the actual approved equipped meshes."""
import bpy,json,sys
from pathlib import Path
from mathutils import Color,Matrix
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from render_item_icons import setup,render,report
from mixamo_common import copy_faces
ROOT=Path(__file__).resolve().parents[2]
PALETTES={'snow':{'warrior':('frostguard','acd3df'),'archer':('snowhunter','8aa9ac'),'mage':('winterweaver','a6b7de')},'wasteland':{'warrior':('obsidian','ce9878'),'archer':('ashranger','ab8762'),'mage':('ashseer','c395ab')}}
PARTS={'warrior':['Weapon_WatchSword','Armor_Body','Helmet','Boots','Copper_Ring','Ember_Amulet'],'archer':['sentinel-bow','sentinel-armor','sentinel-hood','sentinel-boots','hawk-ring','leaf-amulet'],'mage':['runekeeper-staff','runekeeper-armor','runekeeper-crown','runekeeper-boots','rune-ring','moon-amulet']}
SLOTS=['weapon','armor','helmet','boots','ring','amulet']
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
for region,palettes in PALETTES.items():
 for classid,(prefix,hexcolor) in palettes.items():
  setup('ashen-'+classid+'-equipment-v1.glb')
  tint=tuple(linear(int(hexcolor[i:i+2],16)/255) for i in (0,2,4))
  for slot,name in zip(SLOTS,PARTS[classid]):
   obj=bpy.data.objects[name];obj.data=obj.data.copy()
   for index,material in enumerate(obj.data.materials):
    material=material.copy();obj.data.materials[index]=material
    if not material.use_nodes:continue
    shader=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not shader:continue
    color=shader.inputs['Base Color'];links=list(color.links)
    # Same original-material tuning as character.ts, then per-item palette.
    boost=1.6 if material.name.startswith('Weathered_Paladin_Steel') else 1
    if links:
     source=links[0].from_socket;material.node_tree.links.remove(links[0]);mix=material.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=tuple(c*boost for c in tint)+(1,);material.node_tree.links.new(source,mix.inputs[1]);material.node_tree.links.new(mix.outputs[0],color)
    else:color.default_value=tuple(color.default_value[i]*tint[i]*boost for i in range(3))+(1,)
    if slot in ['weapon','ring','amulet']:shader.inputs['Metallic'].default_value=max(shader.inputs['Metallic'].default_value,.35);shader.inputs['Roughness'].default_value=.48
   if slot=='armor':
    width=.30 if classid=='warrior' else .41
    faces={f.index for f in obj.data.polygons if all(.88<(obj.matrix_world@obj.data.vertices[i].co).z<1.56 and abs((obj.matrix_world@obj.data.vertices[i].co).x)<width for i in f.vertices)}
    obj=copy_faces(obj,'IconTorso_'+prefix,faces)
   direction=(.36,-1,.26);roll=0
   if slot=='weapon':
    points=np.array([tuple(obj.matrix_world@v.co) for v in obj.data.vertices]);_,axes=np.linalg.eigh(np.cov(points.T));basis=Matrix((tuple(axes[:,1]),tuple(axes[:,0]),tuple(axes[:,2])))
    for v in obj.data.vertices:v.co=basis@(obj.matrix_world@v.co)
    obj.matrix_world=Matrix.Identity(4)
    for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
    direction=(.18,-1,.18);roll=-.28
   if slot=='ring':direction=(.1,-.3,1)
   render(prefix+'-'+slot+'-v1',[obj],direction,roll)
(ROOT/'art/characters/regional-equipment-v1/icon-report.json').write_text(json.dumps({'generator':'Blender '+bpy.app.version_string,'size':256,'icons':report},indent=2)+'\n')
