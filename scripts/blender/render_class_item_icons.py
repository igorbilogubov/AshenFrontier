"""Render 20 actual modular class items from exported GLBs, source files read-only."""
import bpy,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from render_item_icons import setup,render,report
from mixamo_common import copy_faces
ROOT=Path(__file__).resolve().parents[2]
for classid,prefixes,jewels in [('archer',['ranger','sentinel'],['hawk-ring','leaf-amulet']),('mage',['acolyte','runekeeper'],['rune-ring','moon-amulet'])]:
 setup('ashen-'+classid+'-equipment-v1.glb')
 keys=[]
 for prefix in prefixes:keys += [prefix+('-bow' if classid=='archer' else '-staff'),prefix+'-armor',prefix+('-crown' if prefix=='runekeeper' else '-hood'),prefix+'-boots']
 for key in keys+jewels:
  obj=bpy.data.objects[key]
  if key.endswith('-armor'):
   keep={f.index for f in obj.data.polygons if all(.86<(obj.matrix_world@obj.data.vertices[i].co).z<1.56 and abs((obj.matrix_world@obj.data.vertices[i].co).x)<.41 for i in f.vertices)}
   obj=copy_faces(obj,'IconTorso_'+key,keep)
  direction=(.36,-1,.26);roll=0
  if key.endswith('bow') or key.endswith('staff'):
   # Bone-local equipment is arranged across the rest pose's hand axis. PCA
   # aligns the longest axis upright before rendering the broad face.
   import numpy as np
   from mathutils import Matrix
   points=np.array([tuple(obj.matrix_world@v.co) for v in obj.data.vertices]);_,axes=np.linalg.eigh(np.cov(points.T));basis=Matrix((tuple(axes[:,1]),tuple(axes[:,0]),tuple(axes[:,2])))
   for v in obj.data.vertices:v.co=basis@(obj.matrix_world@v.co)
   obj.matrix_world=Matrix.Identity(4)
   for mod in list(obj.modifiers):obj.modifiers.remove(mod)
   roll=-.28;direction=(.18,-1,.18)
  if key.endswith('ring'):direction=(.1,-.3,1)
  render(key,[obj],direction,roll)
(ROOT/'art/characters/class-equipment-v1/icon-report.json').write_text(json.dumps({'generator':'Blender '+bpy.app.version_string,'size':256,'icons':report},indent=2)+'\n')
