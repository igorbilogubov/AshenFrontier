"""Render the 72 authored late-gear slots from their shipped GLB geometry."""
import bpy,json,sys
from pathlib import Path
from mathutils import Matrix
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from render_item_icons import setup,render,report
ROOT=Path(__file__).resolve().parents[2]
PREFIXES={'warrior':['bogwarden','ironbound','riftbreaker','dreadsovereign'],'archer':['reedstalker','deepdelver','emberhawk','nightsovereign'],'mage':['mireoracle','crystalweaver','voidcaller','astralsovereign']}
for cls,prefixes in PREFIXES.items():
 setup(f'ashen-{cls}-late-equipment-v1.glb')
 for prefix in prefixes:
  for slot in ['weapon','armor','helmet','boots','ring','amulet']:
   obj=bpy.data.objects[prefix+'-'+slot];obj.data=obj.data.copy();direction=(.36,-1,.26);roll=0
   if slot=='weapon':
    points=np.array([tuple(obj.matrix_world@v.co) for v in obj.data.vertices]);_,axes=np.linalg.eigh(np.cov(points.T));basis=Matrix((tuple(axes[:,1]),tuple(axes[:,0]),tuple(axes[:,2])))
    for v in obj.data.vertices:v.co=basis@(obj.matrix_world@v.co)
    obj.matrix_world=Matrix.Identity(4)
    for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
    direction=(.18,-1,.18);roll=-.28
   if slot=='ring':direction=(.1,-.3,1)
   render(prefix+'-'+slot+'-v1',[obj],direction,roll)
(ROOT/'art/characters/late-equipment-v1/icon-report.json').write_text(json.dumps({'generator':'Blender '+bpy.app.version_string,'size':256,'icons':report},indent=2)+'\n')
