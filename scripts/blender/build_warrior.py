"""Build the editable warrior and browser GLB from the archived Mixamo FBXs.

Blender 5.2: blender -b -t 4 --python scripts/blender/build_warrior.py
Source body/animation rights are documented in the asset README.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
ASSET = ROOT / 'art/characters/ashen-warrior-v1'
OUT = ROOT / 'public/game/characters'
CLIPS = [('Idle', 'idle'), ('Walk', 'walk'), ('Run', 'run'),
         ('Attack_Sword_1', 'attack-cross'), ('Attack_Sword_2', 'attack-down'),
         ('Hit', 'hit'), ('Death', 'death')]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(ASSET / 'source/paladin-tpose.fbx'))
scene = bpy.context.scene
scene.render.fps = 30
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
arm.name = 'Ashen_Warrior_Rig'
arm.animation_data_clear()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
body = bpy.data.objects['Paladin_J_Nordstrom_Helmet']
head = bpy.data.objects['Paladin_J_Nordstrom']
body.name = 'Armor_Body'
head.name = 'Helmet'
head['equipmentSlot'] = 'helmet'
body['equipmentSlot'] = 'armor'

# Keep boot topology, UVs and skin weights intact when separating the equipment.
boot_faces = set()
for p in body.data.polygons:
    counts = []
    for vi in p.vertices:
        v = body.data.vertices[vi]
        group = max(v.groups, key=lambda g: g.weight)
        counts.append(body.vertex_groups[group.group].name)
    if all('Foot' in n or 'Toe' in n for n in counts):
        boot_faces.add(p.index)
boots = body.copy()
boots.data = body.data.copy()
boots.name = 'Boots'
scene.collection.objects.link(boots)
boots['equipmentSlot'] = 'boots'
for obj, keep_boots in [(body, False), (boots, True)]:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.index in boot_faces) != keep_boots], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()

paladin = bpy.data.materials['Paladin_MAT']
paladin.name = 'Weathered_Paladin_Steel'
shader = next(n for n in paladin.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
shader.inputs['Metallic'].default_value = .4
shader.inputs['Roughness'].default_value = .57
for im in bpy.data.images:
    if im.size[0] > 1024:
        im.scale(1024, 1024)
    if im.size[0]:
        im.pack()

def material(name, color, metal=0, rough=.6):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m

steel = material('Forged_Steel', (.26, .34, .38), .75, .34)
edge = material('Honed_Edge', (.61, .68, .68), .8, .29)
brass = material('Worn_Brass', (.34, .22, .085), .7, .44)
leather = material('Grip_Leather', (.065, .035, .021), 0, .85)
cloth = material('Ashen_Burgundy', (.19, .018, .032), 0, .94)
stitch = material('Cape_Stitched_Hem', (.22, .135, .065), 0, .98)
cloth.use_backface_culling = False

def skinned_mesh(name, verts, faces, materials, indices, bone=None, weights=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.parent = arm
    for mat in materials:
        data.materials.append(mat)
    for poly, idx in zip(data.polygons, indices):
        poly.material_index = idx
    mod = obj.modifiers.new('Skin', 'ARMATURE')
    mod.object = arm
    if bone:
        obj.vertex_groups.new(name=bone).add(list(range(len(verts))), 1, 'REPLACE')
    else:
        for bone_name, values in weights.items():
            group = obj.vertex_groups.new(name=bone_name)
            for i, value in enumerate(values):
                if value > 0:
                    group.add([i], value, 'REPLACE')
    return obj

class Gear:
    def __init__(self):
        self.v, self.f, self.m = [], [], []

    def box(self, center, size, mat):
        x, y, z = center
        a, b, c = (v / 2 for v in size)
        vs = [(x+dx*a, y+dy*b, z+dz*c) for dx, dy, dz in
              [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        self.add(vs, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mat)

    def add(self, vs, fs, mat):
        base = len(self.v)
        self.v.extend(vs)
        self.f.extend(tuple(i+base for i in f) for f in fs)
        self.m.extend([mat]*len(fs))

    def cylinder(self, radius, z0, z1, mat, n=12):
        vs = [(math.cos(i*math.tau/n)*radius, math.sin(i*math.tau/n)*radius, z) for z in [z0,z1] for i in range(n)]
        fs = [tuple(reversed(range(n))), tuple(range(n,n*2))]
        fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        self.add(vs, fs, mat)

    def blade(self, rows, mat):
        vs = [(x,y,z) for z,w,d in rows for x,y in [(-w,0),(0,-d),(w,0),(0,d)]]
        fs = [(0,3,2,1)]
        for r in range(len(rows)-1):
            fs.extend((r*4+i,r*4+(i+1)%4,(r+1)*4+(i+1)%4,(r+1)*4+i) for i in range(4))
        fs.append(tuple(range(len(vs)-4,len(vs))))
        self.add(vs,fs,mat)

    def finish(self, name, bone='mixamorig:RightHand', shield=False):
        # Right-hand local X follows the grip through the curled fingers.
        rest = arm.data.bones[bone].matrix_local
        if shield:
            vs = [rest @ Vector((x,y+4,z-6)) for x,y,z in self.v]
        else:
            vs = [rest @ Vector((z,7-y,2+x)) for x,y,z in self.v]
        obj = skinned_mesh(name, vs, self.f, [steel,edge,brass,leather,cloth], self.m, bone=bone)
        obj['equipmentSlot'] = 'weapon'
        return obj

s = Gear()
s.cylinder(1.55,-9,7,3)
for z in range(-8,7,2):
    s.cylinder(1.7,z,z+.4,2)
s.cylinder(2.7,-12,-9,2)
s.box((0,0,8),(21,3.3,3),2)
s.box((-10,0,6),(3,3.6,5),0)
s.box((10,0,6),(3,3.6,5),0)
s.blade([(9,3.1,1.1),(16,3.6,.9),(64,2.7,.75),(78,0,.05)],1)
sword = s.finish('Weapon_Sword')

a = Gear()
a.cylinder(1.6,-11,62,3)
a.cylinder(2.3,-13,-10,2)
for z in [2,9,45,56]:
    a.cylinder(2,z,z+2,2)
a.blade([(43,3,2),(49,11,1.2),(59,14,1),(65,3,1.8)],0)
a.box((0,0,56),(4.5,5,18),2)
axe = a.finish('Weapon_Axe')

b = Gear()
# A compact buckler makes the captured shield stance readable; it adds no slot/stat.
segments = 24
for radius, z, next_radius, next_z, mi in [(0,-5,20,-1,0),(20,-1,23,0,2),(23,0,23,2,0)]:
    vs = [(radius*math.cos(i*math.tau/segments),radius*math.sin(i*math.tau/segments),z) for i in range(segments)]
    vs += [(next_radius*math.cos(i*math.tau/segments),next_radius*math.sin(i*math.tau/segments),next_z) for i in range(segments)]
    b.add(vs,[(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)],mi)
b.box((0,0,-5.5),(3,24,1.5),2)
b.box((0,3,-5.8),(19,3,1.5),2)
shield = b.finish('Weapon_Buckler', 'mixamorig:LeftHand', shield=True)

# Short segmented cape: smooth skin weights, no per-frame cloth simulation.
bpy.context.view_layer.update()
to_arm = arm.matrix_world.inverted()
verts, faces, mids = [], [], []
weights = {'mixamorig:Spine2':[], 'mixamorig:Spine1':[], 'mixamorig:Hips':[]}
for r in range(9):
    t = r/8
    for c in range(9):
        u = [-1,-.965,-.64,-.32,0,.32,.64,.965,1][c]
        x = u*(.195+.035*t)
        y = .115+.045*t+.065*t*t+.014*math.cos(u*math.pi*4)
        z = 1.43-.57*t+.03*u*u*t
        verts.append(to_arm @ Vector((x,y,z)))
        weights['mixamorig:Spine2'].append(1-t)
        weights['mixamorig:Spine1'].append(t*.7)
        weights['mixamorig:Hips'].append(t*.3)
        if r<8 and c<8:
            i=r*9+c
            faces.append((i,i+1,i+10,i+9)); mids.append(0 if c not in [0,7] else 1)
cape = skinned_mesh('Cape',verts,faces,[cloth,stitch],mids,weights=weights)
for p in cape.data.polygons:
    p.use_smooth=True
cape['equipmentSlot']='armor'

actions = {}
clip_report = {}
for name, filename in CLIPS:
    before = set(scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(ASSET / f'source/{filename}.fbx'))
    imported = set(scene.objects)-before
    source_arm = next(o for o in imported if o.type=='ARMATURE')
    action = source_arm.animation_data.action
    action.name=name
    action.use_fake_user=True
    assert set(source_arm.data.bones.keys())==set(arm.data.bones.keys()), 'Incompatible source rig'
    # Remove planar root motion; the authoritative simulation owns position.
    bag=action.layers[0].strips[0].channelbag(source_arm.animation_data.action_slot)
    for curve in bag.fcurves:
        if curve.data_path=='pose.bones["mixamorig:Hips"].location' and curve.array_index in [0,2]:
            for key in curve.keyframe_points:
                key.co.y=0; key.handle_left.y=0; key.handle_right.y=0
    actions[name]=action
    clip_report[name]={'source':filename+'.fbx','frames':list(action.frame_range),'seconds':(action.frame_range.y-action.frame_range.x)/30}
    for obj in imported:
        bpy.data.objects.remove(obj,do_unlink=True)

arm.animation_data_create()
for name, action in actions.items():
    track=arm.animation_data.nla_tracks.new()
    track.name=name
    strip=track.strips.new(name,1,action)
    strip.action_slot=action.slots[0]
    track.mute=True
arm.animation_data.action=actions['Idle']
arm.animation_data.action_slot=actions['Idle'].slots[0]
scene.frame_start=1
scene.frame_end=77
scene.frame_set(1)

# Only the game meshes and skeleton are exported; the source file retains a studio.
game_objects=[o for o in scene.objects if o.type in ['ARMATURE','MESH']]
scene.world=bpy.data.worlds.new('Studio_World')
scene.world.color=(.085,.10,.12)
target=Vector((0,0,.85))
for name,pos,energy,color,size in [('Key',(3,-4,5),650,(1,.88,.74),4),('Fill',(-3,-2,3),400,(.65,.80,1),3),('Rim',(1,3,4),900,(.84,.92,1),3)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=pos;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3,-5,2.9))
camera=bpy.context.object;camera.name='Portrait_Camera';camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.4;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=800;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
for obj in scene.objects: obj.select_set(False)
for obj in game_objects: obj.select_set(True)
bpy.context.view_layer.objects.active=arm
arm.animation_data.action=None
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'ashen-warrior-v1.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_optimize_animation_size=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_image_format='AUTO')
arm.animation_data.action=actions['Idle'];arm.animation_data.action_slot=actions['Idle'].slots[0]
axe.hide_render=True;axe.hide_set(True)
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'ashen-warrior-v1.blend'))
report={'generator':'Blender '+bpy.app.version_string,'bones':len(arm.data.bones),'clips':clip_report,'meshes':[]}
for obj in game_objects:
    if obj.type=='MESH':
        obj.data.calc_loop_triangles()
        report['meshes'].append({'name':obj.name,'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles),'unweighted':sum(not v.groups for v in obj.data.vertices)})
(ASSET/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('BUILD_REPORT',json.dumps(report))
scene.render.filepath=str(ASSET/'renders/warrior-idle.png')
bpy.ops.render.render(write_still=True)
