"""Render inventory thumbnails from the shipped GLBs; never modify source models."""
import bpy, json, math, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from mixamo_common import copy_faces
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/game/item-icons';REPORT=ROOT/'art/ui/item-icons-v1'
OUT.mkdir(parents=True,exist_ok=True);REPORT.mkdir(parents=True,exist_ok=True)
report=[]

def material(name,color,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.55
    return m

def render(key,objects,direction=(.36,-1,.26),roll=0):
    scene=bpy.context.scene
    for o in scene.objects:
        if o.type=='MESH':o.hide_render=o not in objects
    # Freeze the rest mesh so the camera framing and thumbnail use exactly the same pose.
    frozen=[];deps=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(deps));mesh.materials.clear()
        for slot in obj.material_slots:
            if slot.material:mesh.materials.append(slot.material)
        copy=bpy.data.objects.new('Icon_'+obj.name,mesh);scene.collection.objects.link(copy);copy.matrix_world=obj.matrix_world;obj.hide_render=True;frozen.append(copy)
    points=[o.matrix_world@v.co for o in frozen for v in o.data.vertices]
    low=Vector(tuple(min(p[k] for p in points) for k in range(3)));high=Vector(tuple(max(p[k] for p in points) for k in range(3)));center=(low+high)/2
    size=max((high-low).length,.01)
    for o in frozen:
        for v in o.data.vertices:v.co=(o.matrix_world@v.co-center)/size
        o.matrix_world=Matrix.Identity(4)
    points=[v.co for o in frozen for v in o.data.vertices]
    if 'blade' in key or key=='legacy-axe' or key.endswith('-ring'):
        _,axes=np.linalg.eigh(np.cov(np.array([tuple(p) for p in points]).T))
        # Face the broad surface, not the thin edge of the sword or ring.
        basis=Matrix((Vector(axes[:,1]),Vector(axes[:,0]),Vector(axes[:,2])))
        for o in frozen:
            for v in o.data.vertices:v.co=basis@v.co
        points=[v.co for o in frozen for v in o.data.vertices]
        direction=(.25,-1,.16)
    camera=scene.camera;camera.location=Vector(direction).normalized()*4;camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();camera.rotation_euler.rotate_axis('Z',roll)
    inverse=camera.rotation_euler.to_matrix().inverted();projected=[inverse@p for p in points];width=max(p.x for p in projected)-min(p.x for p in projected);height=max(p.y for p in projected)-min(p.y for p in projected)
    camera.data.ortho_scale=max(width,height)*1.19
    scene.render.filepath=str(OUT/(key+'.png'));bpy.ops.render.render(write_still=True)
    report.append({'id':key,'parts':[o.name for o in objects],'bytes':(OUT/(key+'.png')).stat().st_size})
    for o in frozen:bpy.data.objects.remove(o,do_unlink=True)

def setup(filename):
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/game/characters'/filename))
    scene=bpy.context.scene
    for obj in scene.objects:
        if obj.type=='ARMATURE':obj.animation_data_clear();obj.data.pose_position='REST'
    for m in bpy.data.materials:
        if not m.use_nodes:continue
        shader=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if shader:shader.inputs['Roughness'].default_value=.72
        if m.name.startswith('Traveller_Leather_') and shader:
            color=shader.inputs['Base Color'];links=list(color.links)
            if links:
                source=links[0].from_socket;m.node_tree.links.remove(links[0]);mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.412,.296,.177,1);m.node_tree.links.new(source,mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],color)
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.3,.34,.4,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.3
    scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0
    camera=bpy.data.objects.new('IconCamera',bpy.data.cameras.new('IconCamera'));scene.collection.objects.link(camera);camera.data.type='ORTHO';scene.camera=camera
    for name,location,power,color in [('Key',(-2,-3,4),240,(1,.85,.65)),('Fill',(3,-2,1),140,(.73,.84,1)),('Rim',(1,3,2),300,(1,.88,.7))]:
        light=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(light);light.location=location;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler();light.data.energy=power;light.data.shape='DISK';light.data.size=3;light.data.color=color
    bpy.context.view_layer.update()

if __name__=='__main__':
    setup('ashen-warrior-equipment-v1.glb')
    for key,name in [('wanderer-blade','Weapon_Sword'),('watch-blade','Weapon_WatchSword'),('wanderer-armor','Traveller_Armor'),('watch-armor','Armor_Body'),('wanderer-hood','Traveller_Hood'),('watch-helm','Helmet'),('wanderer-boots','Traveller_Boots'),('watch-boots','Boots'),('copper-ring','Copper_Ring'),('ember-amulet','Ember_Amulet'),('legacy-axe','Weapon_Axe')]:
        obj=bpy.data.objects[name]
        # Armour thumbnails show the torso/shoulders, without the separately worn helmet or boots.
        if key.endswith('armor'):
            faces={f.index for f in obj.data.polygons if all(.90<(obj.matrix_world@obj.data.vertices[i].co).z<1.53 and abs((obj.matrix_world@obj.data.vertices[i].co).x)<.30 for i in f.vertices)}
            obj=copy_faces(obj,'IconTorso_'+name,faces)
        direction=(.36,-1,.26);roll=0
        if 'blade' in key or key=='legacy-axe':direction=(.25,-1,.7);roll=-.5
        if key=='copper-ring':direction=(0,-.2,1)
        render(key,[obj],direction,roll)
    for kind in ['archer','mage']:
        setup('ashen-'+kind+'-v1.glb');obj=bpy.data.objects['Class_Body'];keep=set()
        for face in obj.data.polygons:
            zs=[(obj.matrix_world@obj.data.vertices[i].co).z for i in face.vertices]
            if .90<sum(zs)/len(zs)<1.49 and all(abs((obj.matrix_world@obj.data.vertices[i].co).x)<.30 for i in face.vertices):keep.add(face.index)
        obj=copy_faces(obj,'IconTorso_'+kind,keep);render(kind+'-armor',[obj])
    # These two weapons are still procedural in character.ts. Reproduce their current
    # wood/metal/crystal silhouette at icon scale; no new in-game weapon is introduced.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup('ashen-warrior-equipment-v1.glb')
    wood=material('BowWood',(.31,.17,.072));stringmat=material('BowString',(.74,.64,.43));staffmat=material('StaffWood',(.13,.083,.061));crystalmat=material('StaffCrystal',(.48,.35,.91),.25)
    def cylinder(name,radius,depth,position,mat):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=depth,location=position);o=bpy.context.object;o.name=name;o.data.materials.append(mat);return o
    shaft=cylinder('Shaft',.017,1.3,(0,0,0),staffmat)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.07,location=(0,0,.67));crystal=bpy.context.object;crystal.data.materials.append(crystalmat)
    render('legacy-staff',[shaft,crystal],(.2,-1,.25),-.48)
    curve=bpy.data.curves.new('Bow','CURVE');curve.dimensions='3D';curve.bevel_depth=.018;curve.bevel_resolution=2;spline=curve.splines.new('BEZIER');spline.bezier_points.add(4)
    for p,co in zip(spline.bezier_points,[(0,0,-.55),(.15,0,-.25),(.18,0,0),(.15,0,.25),(0,0,.55)]):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    bow=bpy.data.objects.new('Bow',curve);bpy.context.scene.collection.objects.link(bow);bow.data.materials.append(wood)

    for o in bpy.context.scene.objects:o.select_set(False)
    bpy.context.view_layer.objects.active=bow;bow.select_set(True);bpy.ops.object.convert(target='MESH');bow=bpy.context.object
    string=cylinder('String',.0022,1.1,(0,0,0),stringmat);render('legacy-bow',[bow,string],(.1,-1,.14),-.42)
    (REPORT/'build-report.json').write_text(json.dumps({'generator':'Blender '+bpy.app.version_string,'size':256,'icons':report},indent=2)+'\n')
