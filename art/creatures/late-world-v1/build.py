"""Original late-region creatures. Writes only the named new assets in README."""
import bpy, math, json, sys, importlib.util
from pathlib import Path
from mathutils import Vector, Quaternion
ROOT=Path(__file__).resolve().parents[3];ASSET=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('wasteland_helpers',ROOT/'art/creatures/wasteland-v1/build.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
snow=w.snow;f=w.f;S=f.Sculpt;V=f.V;smooth=f.smooth;CLIPS=w.CLIPS
KINDS=['swamp-frog','marsh-crocodile','plague-mosquito','bog-spider','cave-bat','cave-crawler','crystal-beetle','stone-guardian','hellhound','lava-elemental','ember-crab','basalt-brute','bonehound','gargoyle','void-stalker','iron-warden']
QUAD=['hellhound','bonehound','void-stalker'];BIPED=['cave-bat','stone-guardian','lava-elemental','basalt-brute','gargoyle','iron-warden'];FLY=['plague-mosquito','cave-bat'];WING=FLY+['gargoyle'];BASE={k:('ice-golem' if k in BIPED else 'ash-jackal' if k in QUAD else 'monitor-lizard' if k in ['swamp-frog','marsh-crocodile'] else 'scorpion' if k in ['cave-crawler','ember-crab'] else 'scarab' if k in ['plague-mosquito','crystal-beetle'] else 'frost-spider') for k in KINDS}
PALETTES=[((.22,.32,.12),(.49,.47,.24),(.53,.79,.16)),((.20,.28,.16),(.49,.43,.28),(.89,.60,.18)),((.20,.25,.17),(.33,.38,.26),(.63,.85,.23)),((.19,.22,.18),(.41,.32,.21),(.64,.19,.14)),((.19,.15,.20),(.32,.25,.31),(.68,.29,.15)),((.34,.28,.21),(.54,.44,.31),(.61,.71,.25)),((.13,.23,.25),(.26,.51,.52),(.42,.85,.82)),((.29,.30,.29),(.48,.46,.39),(.35,.76,.77)),((.12,.10,.10),(.39,.20,.10),(.95,.31,.08)),((.19,.13,.11),(.40,.24,.13),(1,.38,.055)),((.22,.12,.09),(.52,.28,.15),(.92,.49,.08)),((.17,.16,.17),(.39,.31,.25),(.98,.39,.08)),((.43,.41,.33),(.68,.64,.49),(.42,.77,.59)),((.23,.24,.29),(.40,.38,.45),(.63,.36,.82)),((.16,.12,.24),(.31,.23,.39),(.61,.35,.94)),((.18,.23,.26),(.43,.44,.41),(.73,.43,.29))]
STRIDES={k:((.64,.92) if k in BIPED else (.72,1.) if k in QUAD else (.58,.82) if k in ['swamp-frog','marsh-crocodile'] else (.52,.76) if k in ['cave-crawler','ember-crab'] else (.54,.78) if k in ['plague-mosquito','crystal-beetle'] else (.62,.9)) for k in KINDS}

def rig(kind):
 base=BASE[kind];arm=snow.rig(base) if base in ['ice-golem','frost-spider'] else w.rig(base)
 if kind in WING:
  bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
  for side,suffix in [(-1,'L'),(1,'R')]:
   b=arm.data.edit_bones.new('Wing_'+suffix);h=1.65 if kind in BIPED else .6;b.head=V(side*.28,h,0);b.tail=V(side*1.4,h,.15);b.parent=arm.data.edit_bones['Chest']
  bpy.ops.object.mode_set(mode='OBJECT')
  for p in arm.pose.bones:p.rotation_mode='QUATERNION'
 return arm

def model(kind,arm):
 base,detail,glow=PALETTES[KINDS.index(kind)];coat=f.material('Mottled_hide',base,.87);node=coat.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='Coat';coat.node_tree.links.new(node.outputs['Color'],coat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 shell=f.material('Horn_stone_armor',detail,.72,.12 if kind in ['iron-warden','crystal-beetle'] else 0);dark=f.material('Creases_and_claws',(.025,.029,.026),.8);light=f.material('Living_eyes',glow,.38);bs=light.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(*glow,1);bs.inputs['Emission Strength'].default_value=.45
 objects=[];conv=lambda p:(p.x,p.z,-p.y)
 def part(n,s,mat,bone,flat=False):
  o=s.finish(n);o.data.materials.append(mat);f.bind(o,arm,bone);objects.append(o);a=o.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT');o.data.color_attributes.active_color=a
  for v in o.data.vertices:
   x,y,h=v.co;noise=.83+.12*math.sin(x*31+y*37+h*21)+.05*math.sin(y*14+h*9);c=Vector(base)*noise if mat==coat else Vector((1,1,1));a.data[v.index].color=(*c,1)
  if flat:
   for poly in o.data.polygons:poly.use_smooth=False
  return o
 def ell(n,c,r,m,b):s=S();s.ellipsoid(c,r);return part(n,s,m,b)
 def tube(n,p,r,m,b,nside=8):s=S();s.tube(p,r,nside);return part(n,s,m,b)
 def rock(n,c,r,m,b):
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=V(*c));o=bpy.context.object;o.scale=(r[0],r[2],r[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);s=S();s.parts=[o];return part(n,s,m,b,True)
 def boneparts(prefix,thick=.08,mat=coat):
  for b in arm.data.bones:
   if b.name.startswith(prefix):
    upper='Upper' in b.name;tube(b.name,[conv(b.head_local),conv(b.tail_local)],[thick if upper else thick*.60,thick*.65 if upper else thick*.34],mat,b.name)
 def eye(x,h,z,b='Head',size=.04):
  for side in [-1,1]:ell('Eye_socket',(side*x,h,z),(size*.75,size*.60,size*.55),dark,b);ell('Eye',(side*(x+.016),h+.005,z+.021),(size*.27,size*.35,size*.35),light,b)
 if kind in ['swamp-frog','marsh-crocodile']:
  frog=kind=='swamp-frog';ell('Haunch_body',(0,.41,-.29),(.47 if frog else .39,.31 if frog else .22,.48 if frog else .7),coat,'Hips');ell('Shoulders',(0,.40,.20),(.45 if frog else .4,.24,.4),coat,'Chest');ell('Broad_head',(0,.43,.59),(.49 if frog else .26,.22 if frog else .13,.31 if frog else .54),coat,'Head');ell('Lower_jaw',(0,.27,.67),(.4 if frog else .23,.05,.32 if frog else .5),shell,'Jaw');boneparts('Leg_',.15 if frog else .12)
  if frog:
   for side,suf in [(-1,'L'),(1,'R')]:ell('Powerful_haunch',(side*.56,.33,-.50),(.33,.27,.37),coat,'Leg_1_'+suf+'_Upper');ell('Raised_eye_ridge',(side*.33,.66,.60),(.15,.13,.13),coat,'Head')
   eye(.37,.7,.70,size=.07)
   for i in range(16):ell('Toad_wart',((i%4-1.5)*.16,.65+math.sin(i)*.03,-.6+i//4*.20),(.042,.033,.040),shell,'Hips')
  else:
   eye(.23,.55,.57)
   for i in range(3):b=arm.data.bones['Tail_'+str(i+1)];tube('Heavy_crocodile_tail',[conv(b.head_local),conv(b.tail_local)],[.24/(i+1),.24/(i+2) if i<2 else .006],coat,b.name,10)
   for i in range(10):
    for side in [-1,1]:tube('Armored_dorsal_scute',[(side*.16,.57,-.72+i*.12),(side*.15,.76,-.75+i*.12)],[.065,.001],shell,'Hips' if i<5 else 'Chest',5)
   for side in [-1,1]:
    for i in range(7):tube('Visible_tooth',[(side*.23,.29,.40+i*.10),(side*.23,.35,.4+i*.1)],[.025,.001],shell,'Jaw',5)
 elif kind in QUAD:
  bonehound=kind=='bonehound';stalker=kind=='void-stalker';ell('Pelvis',(0,.93,-.45),(.23,.24,.33),shell if bonehound else coat,'Hips');ell('Thorax',(0,1.0,.19),(.32 if not stalker else .22,.34,.38),coat,'Chest');ell('Neck',(0,1.14,.58),(.21,.25,.27),coat,'Chest');ell('Skull',(0,1.23,.80),(.24 if bonehound else .18,.22,.28),shell if bonehound else coat,'Head');ell('Muzzle',(0,1.09,1.04),(.14,.11,.27 if not stalker else .10),shell if bonehound else coat,'Head');ell('Jaw',(0,.96,1.0),(.12,.05,.24),shell,'Jaw')
  boneparts('Front_',.13 if not bonehound else .06,shell if bonehound else coat);boneparts('Hind_',.13 if not bonehound else .06,shell if bonehound else coat)
  for b in arm.data.bones:
   if b.name.endswith('_Paw'):p=conv(b.tail_local);ell('Paw',(p[0],.07,p[2]),(.12,.07,.16),dark,b.name)
  eye(.20,1.27,.93,size=.05)
  if bonehound:
   tube('Exposed_spine',[(0,1.10,-.71),(0,1.22,.38)],[.07,.07],shell,'Hips')
   for i in range(6):
    for side in [-1,1]:tube('Separate_rib',[(0,1.21,-.46+i*.14),(side*.30,1.07,-.46+i*.14),(side*.28,.80,-.43+i*.14)],[.035,.038,.015],shell,'Chest' if i>2 else 'Hips',6)
  elif stalker:
   for side,suf in [(-1,'L'),(1,'R')]:tube('Swept_sensor',[(side*.16,1.36,.71),(side*.27,1.70,.40),(side*.24,1.83,.19)],[.09,.055,.001],shell,'Head');tube('Forearm_blade',[(side*.26,.54,.52),(side*.41,.34,.88)],[.085,.001],shell,'Front_'+suf+'_Lower')
  else:
   for side in [-1,1]:tube('Curving_horn',[(side*.18,1.39,.68),(side*.29,1.58,.49),(side*.26,1.80,.38)],[.10,.075,.001],shell,'Head');ell('Molten_flank',(side*.285,1.05,.20),(.017,.16,.20),light,'Chest')
  tube('Tail',[(0,.94,-.73),(0,.79,-1.07),(0,.69,-1.38)],[.07,.06,.001],shell if bonehound else coat,'Tail_1')
 elif kind in BIPED:
  bat=kind=='cave-bat';lava=kind=='lava-elemental';garg=kind=='gargoyle';iron=kind=='iron-warden';brute=kind=='basalt-brute'
  fn=ell if bat or garg else rock
  fn('Pelvis',(0,1.02,0),(.16 if bat else .33,.20 if bat else .25,.15 if bat else .25),coat,'Hips');fn('Torso',(0,1.46,0),(.22 if bat else .68 if brute else .52,.31 if bat else .42,.19 if bat else .30),coat,'Chest');fn('Head',(0,1.99,.03),(.18 if bat else .29,.21 if bat else .28,.18 if bat else .24),shell,'Head');eye(.11,2.04,.29 if iron else .23,size=.04)
  if not lava and not bat:
   for side,suf in [(-1,'L'),(1,'R')]:
    fn('Thigh',(side*.27,.78,.02),(.055 if bat else .24,.25 if bat else .28,.07 if bat else .20),coat,'Leg_'+suf+'_Upper');fn('Shin',(side*.29,.39,.03),(.04 if bat else .18,.22 if bat else .26,.05 if bat else .18),shell,'Leg_'+suf+'_Lower');fn('Foot',(side*.29,.115,.15),(.055 if bat else .18,.055 if bat else .105,.17 if bat else .3),shell,'Leg_'+suf+'_Paw')
  elif lava:
   for i in range(5):rock('Floating_magma',(math.sin(i*2.2)*.2,.25+i*.15,math.cos(i*2.2)*.16),(.2,.17,.2),shell,'Hips');ell('Molten_column',(0,1.1,0),(.25,.7,.2),light,'Hips')
  if bat:
   for side in [-1,1]:
    tube('Bat_hind_talon',[(side*.12,1.08,-.05),(side*.19,.91,-.11),(side*.20,.93,.03)],[.035,.025,.001],dark,'Hips')
   ell('Short_bat_muzzle',(0,1.90,.21),(.09,.075,.12),coat,'Head')
  for side,suf in [(-1,'L'),(1,'R')]:
   if not bat:fn('Shoulder',(side*.51,1.66,0),(.22 if bat else .33,.27,.28),shell,'Arm_'+suf);fn('Arm',(side*.71,1.34,.02),(.12 if bat else .24,.27,.2),coat,'Arm_'+suf);fn('Forearm',(side*.81,.99,.09),(.12 if bat else .25,.30,.22),shell,'Fist_'+suf);fn('Hand',(side*.85,.73,.14),(.12 if bat else .25,.20,.25),shell,'Fist_'+suf)
   if bat:tube('Bat_ear',[(side*.16,2.13,.04),(side*.23,2.51,.01)],[.11,.001],coat,'Head')
   if garg:tube('Gargoyle_horn',[(side*.20,2.15,0),(side*.30,2.40,-.07)],[.08,.001],shell,'Head')
   if brute or iron:
    for i in range(3):tube('Shoulder_spike',[(side*(.45+i*.11),1.84,0),(side*(.57+i*.15),2.12+i*.06,-.10)],[.09,.001],shell,'Arm_'+suf,5)
  if lava or kind=='stone-guardian':ell('Chest_core',(0,1.49,.3),(.15,.19,.05),light,'Chest')
  if brute:rock('Back_slab',(0,1.57,-.28),(.63,.45,.17),shell,'Chest')
  if iron:
   for i in range(4):rock('Segmented_breastplate',(0,1.23+i*.15,.3),(.46-i*.025,.08,.055),shell,'Chest')
   tube('Hammer_handle',[(.85,.68,.15),(.85,.68,1.22)],[.055,.055],dark,'Fist_R');rock('Hammer_head',(.85,.68,1.18),(.36,.27,.21),shell,'Fist_R');rock('Face_mask',(0,1.98,.24),(.22,.22,.07),shell,'Head')
 else:
  mos=kind=='plague-mosquito';spider=kind=='bog-spider';crawler=kind=='cave-crawler';crab=kind=='ember-crab';beetle=kind=='crystal-beetle'
  if mos:ell('Slender_abdomen',(0,.56,-.40),(.16,.15,.6),coat,'Hips');ell('Thorax',(0,.59,.16),(.21,.24,.28),coat,'Chest');ell('Head',(0,.53,.51),(.20,.18,.20),shell,'Head');tube('Long_proboscis',[(0,.46,.61),(0,.40,1.28)],[.035,.003],dark,'Head')
  elif spider:ell('Large_abdomen',(0,.63,-.48),(.51,.39,.56),coat,'Hips');ell('Thorax',(0,.52,.11),(.34,.27,.37),coat,'Chest');ell('Head',(0,.45,.51),(.23,.20,.24),shell,'Head')
  elif crawler:
   for i in range(5):ell('Overlapping_segment',(0,.47,-.62+i*.22),(.33,.24,.19),shell,'Hips' if i<3 else 'Chest')
   ell('Blind_head',(0,.42,.57),(.28,.23,.27),coat,'Head')
  elif crab:
   rock('Wide_crab_carapace',(0,.55,-.10),(.74,.35,.59),shell,'Hips');ell('Neck',(0,.44,.37),(.36,.22,.30),coat,'Chest');ell('Head',(0,.44,.55),(.20,.17,.15),shell,'Head')
  else:
   ell('Beetle_abdomen',(0,.55,-.3),(.55,.39,.60),coat,'Hips');ell('Neck_shield',(0,.57,.25),(.47,.3,.31),shell,'Chest');ell('Head',(0,.45,.57),(.28,.22,.22),coat,'Head')
   for side in [-1,1]:ell('Wingcase',(side*.23,.7,-.25),(.31,.31,.61),shell,'Hips')
   for i in range(7):tube('Crystal_cluster',[((i%3-1)*.23,.91,-.55+i//3*.33),((i%3-1)*.3,1.18+(i%3)*.15,-.59+i//3*.33)],[.14,.001],light,'Hips',5)
  boneparts('Leg_',.033 if mos else .072,shell)
  eye(.12,.59,.66,size=.04)
  if spider:
   for side in [-1,1]:
    for i in range(2):ell('Small_spider_eye',(side*(.06+i*.08),.64,.61),(.021,.025,.019),light,'Head')
    tube('Fang',[(side*.12,.37,.60),(side*.17,.25,.83),(side*.08,.18,.84)],[.07,.04,.002],shell,'Head')
  if crawler:
   for side in [-1,1]:tube('Sensory_feeler',[(side*.16,.59,.66),(side*.35,.71,.99),(side*.43,.65,1.28)],[.023,.015,.001],coat,'Head')
  if crab:
   for side,suf in [(-1,'L'),(1,'R')]:
    b=arm.data.bones['Claw_'+suf];tube('Crab_arm',[conv(b.head_local),conv(b.tail_local)],[.16,.15],coat,b.name);ell('Crab_palm',(side*.67,.39,1.06),(.26,.19,.31),shell,'Pincer_'+suf)
    for off in [-1,1]:tube('Massive_crab_claw',[(side*.67+off*.15,.39,1.21),(side*.67+off*.20,.35,1.5),(side*.67+off*.04,.33,1.6)],[.12,.075,.001],shell,'Pincer_'+suf)
 if kind in WING:
  for side,suf in [(-1,'L'),(1,'R')]:
   h=1.65 if kind in BIPED else .63;span=2.15 if kind=='cave-bat' else 1.75 if kind!='plague-mosquito' else 1.20;bone='Wing_'+suf
   points=[(side*.29,h,-.03),(side*span,h+.14,.13),(side*span*.83,h-.12,-.62),(side*.75,h-.25,-.9),(side*.36,h-.13,-.5)]
   verts=[V(*p) for p in points];data=bpy.data.meshes.new('Wing_membrane');data.from_pydata(verts,[],[(0,1,2),(0,2,3),(0,3,4)]);o=bpy.data.objects.new('Wing_membrane',data);bpy.context.collection.objects.link(o);s=S();s.parts=[o];part('Broad_wing_membrane',s,shell if kind=='plague-mosquito' else coat,bone)
   for j in [1,2,3,4]:tube('Wing_finger',[points[0],points[j]],[.035,.01],shell,bone,6)
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();body=bpy.context.object;body.name=kind+'_SkinnedMesh';return body

def pose(arm,kind,clip,t):
 base=BASE[kind]
 if base in ['ice-golem','frost-spider']:snow.pose(arm,base,clip,t)
 else:w.pose(arm,base,clip,t)
 if kind in WING:
  death=smooth((t-.06)/.78) if clip=='Death' else 0
  for side,suf in [(-1,'L'),(1,'R')]:
   flap=(.6*math.sin(t*math.tau*2) if kind in FLY else .08*math.sin(t*math.tau))*(1-death)
   f.rotate_world(arm,'Wing_'+suf,(0,side*(flap+.38*death),0))
  if kind in FLY:
   root=arm.pose.bones['Root'];rise=(.55 if kind=='plague-mosquito' else .32)*(1-death);root.location+=root.bone.matrix_local.to_3x3().inverted()@V(0,rise+.035*math.sin(t*math.tau)*(1-death),0)
 if kind=='iron-warden':
  if clip=='Death':f.rotate_world(arm,'Fist_R',(-1.84*smooth((t-.06)/.78),0,0))
  if clip=='Attack':
   hit=smooth((t-.36)/.32)*(1-smooth((t-.68)/.32));anticipation=smooth(t/.36)*(1-smooth((t-.38)/.30));f.rotate_world(arm,'Fist_R',(-.5*anticipation-.7*hit,0,0))
 if kind=='lava-elemental' and clip!='Death':
  root=arm.pose.bones['Root'];root.location+=root.bone.matrix_local.to_3x3().inverted()@V(0,.035*math.sin(t*math.tau),0)

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
 arm.animation_data.action=actions['Idle'];arm.animation_data.action_slot=actions['Idle'].slots[0];scene.frame_set(0);f.ASSET=ASSET;f.studio(kind);scene.camera.data.ortho_scale=4.4;scene.cycles.samples=8;bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/f'{kind}.blend'));body.data.calc_loop_triangles();report={'type':kind,'rigFamily':BASE[kind],'bones':len(arm.data.bones),'vertices':len(body.data.vertices),'triangles':len(body.data.loop_triangles),'materials':len(body.data.materials),'unweighted':sum(not v.groups for v in body.data.vertices),'clips':dict(CLIPS),'strides':dict(zip(['walk','run'],STRIDES[kind])),'bytes':out.stat().st_size};(ASSET/f'{kind}-report.json').write_text(json.dumps(report,indent=2)+'\n');print('REPORT',report,flush=True);bpy.ops.render.render(write_still=True)
if __name__=='__main__':
 for kind in (sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else KINDS):build(kind)
