import bpy, json, sys
from mathutils import Vector
from pathlib import Path

root = Path(__file__).resolve().parents[2]
asset = root / 'art/characters/ashen-warrior-v1'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(asset / 'source/paladin-tpose.fbx'))
bpy.context.view_layer.update()
points = [o.matrix_world @ v.co for o in bpy.context.scene.objects if o.type == 'MESH' for v in o.data.vertices]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
print('WORLD_BOUNDS', list(low), list(high))
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    print('MATERIAL', mat.name)
    for node in mat.node_tree.nodes:
        print('NODE', node.name, node.type, getattr(getattr(node,'image',None),'name',None))
    for link in mat.node_tree.links: print('LINK', link.from_node.name, link.from_socket.name, link.to_node.name, link.to_socket.name)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.render.resolution_x = 720
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Studio')
scene.world.color = (.13,.15,.17)
target = Vector((0,0,(low.z+high.z)/2))
def light(name, pos, energy, color, size):
    data = bpy.data.lights.new(name, 'AREA'); data.energy=energy; data.color=color; data.shape='DISK'; data.size=size
    obj = bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=pos; obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
light('Key', (3,-4,5), 700, (1,.87,.7), 4)
light('Fill', (-3,-2,2.5), 450, (.61,.76,1), 3)
light('Rim', (1,3,4), 1000, (.86,.92,1), 3)
bpy.ops.object.camera_add(location=(3,-5,2.8))
camera=bpy.context.object; camera.name='Portrait_Camera'; camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler(); camera.data.type='ORTHO'; camera.data.ortho_scale=2.8; scene.camera=camera
scene.render.filepath=str(asset/'renders/base-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(asset/'source/base-preview.blend'))
bpy.ops.render.render(write_still=True)
