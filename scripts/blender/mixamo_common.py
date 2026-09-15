"""Rebind downloaded Mixamo meshes to the established game rest rig, keeping UVs."""
import bpy,bmesh,math
from mathutils import Vector,Matrix

def import_on_rig(path,target,prefix):
    before=set(bpy.context.scene.objects);materials=set(bpy.data.materials)
    bpy.ops.import_scene.fbx(filepath=str(path))
    imported=set(bpy.context.scene.objects)-before
    source=next(o for o in imported if o.type=='ARMATURE');source.animation_data_clear();source.data.pose_position='REST'
    bpy.context.view_layer.update()
    names={}
    for bone in source.data.bones:
        ancestor=bone
        while ancestor and ancestor.name not in target.data.bones:ancestor=ancestor.parent
        names[bone.name]=ancestor.name if ancestor else 'mixamorig:Head'
    torso=lambda rig:(rig.data.bones['mixamorig:Head'].head_local-rig.data.bones['mixamorig:Hips'].head_local).length
    # Some Mixamo FBXs use millimetres while others use centimetres internally.
    # Remove that unit difference before moving vertices between local bone frames.
    unit_scale=10**round(math.log10(torso(target)/torso(source)))
    transforms={name:target.data.bones[mapped].matrix_local@Matrix.Scale(unit_scale,4)@source.data.bones[mapped].matrix_local.inverted() for name,mapped in names.items()}
    result=[]
    for obj in imported:
        if obj.type!='MESH':continue
        original_name=obj.name;matrix=source.matrix_world.inverted()@obj.matrix_world
        weights=[]
        for vertex in obj.data.vertices:
            grouped={};point=Vector((0,0,0));total=0
            for group in vertex.groups:
                name=obj.vertex_groups[group.group].name
                if name not in transforms or group.weight<=0:continue
                target_name=names[name];grouped[target_name]=grouped.get(target_name,0)+group.weight
                point+=(transforms[name]@(matrix@vertex.co))*group.weight;total+=group.weight
            assert total>0, 'Unweighted source vertex: '+original_name
            vertex.co=point/total;weights.append({name:w/total for name,w in grouped.items()})
        obj.vertex_groups.clear()
        for name in sorted(set(name for row in weights for name in row)):
            group=obj.vertex_groups.new(name=name)
            for i,row in enumerate(weights):
                if name in row:group.add([i],row[name],'REPLACE')
        obj.parent=target;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
        for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
        obj.modifiers.new('Shared_Rig','ARMATURE').object=target
        obj.name=prefix+'_'+original_name;obj['mixamoSource']=path.name
        result.append(obj)
    for obj in imported:
        if obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)
    for material in set(bpy.data.materials)-materials:
        material.name=prefix+'_'+material.name
        shader=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if shader:
            shader.inputs['Metallic'].default_value=0;shader.inputs['Roughness'].default_value=.8
            # Eyelash cards keep their imported alpha. Other surfaces stay opaque.
            for link in list(shader.inputs['Metallic'].links):material.node_tree.links.remove(link)
    for image in bpy.data.images:
        if image.size[0]>1024:image.scale(1024,1024)
        if image.size[0]:image.pack()
    bpy.context.view_layer.update()
    return result

def copy_faces(source,name,keep):
    obj=source.copy();obj.data=source.data.copy();obj.name=name;bpy.context.scene.collection.objects.link(obj)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(obj.data);bm.free()
    return obj

def joined(objects,name):
    for obj in bpy.context.scene.objects:obj.select_set(False)
    objects=[o for o in objects if len(o.data.polygons)]
    assert objects,name+' is empty'
    for obj in objects:obj.hide_set(False);obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=bpy.context.object;obj.name=name
    return obj

def face_slot(obj,face):
    weight={'body':0,'head':0,'feet':0}
    for i in face.vertices:
        for group in obj.data.vertices[i].groups:
            name=obj.vertex_groups[group.group].name
            key='head' if 'Head' in name or 'Neck' in name else 'feet' if 'Foot' in name or 'Toe' in name else 'body'
            weight[key]+=group.weight
    return max(weight,key=weight.get)

def split_body(objects):
    parts={key:[] for key in ['body','head','feet']}
    for obj in objects:
        for key in parts:
            keep={f.index for f in obj.data.polygons if face_slot(obj,f)==key}
            if keep:parts[key].append(copy_faces(obj,'Part_'+key,keep))
        bpy.data.objects.remove(obj,do_unlink=True)
    return {key:joined(value,{'body':'Base_Body','head':'Base_Head','feet':'Base_Feet'}[key]) for key,value in parts.items()}

def components(obj):
    linked={}
    for face in obj.data.polygons:
        for vertex in face.vertices:linked.setdefault(vertex,[]).append(face.index)
    unseen=set(range(len(obj.data.polygons)));result=[]
    while unseen:
        faces=set();todo=[unseen.pop()]
        while todo:
            index=todo.pop();faces.add(index)
            for vertex in obj.data.polygons[index].vertices:
                for adjacent in linked[vertex]:
                    if adjacent in unseen:unseen.remove(adjacent);todo.append(adjacent)
        result.append(faces)
    return result
