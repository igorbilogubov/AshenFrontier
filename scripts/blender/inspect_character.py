import bpy, json, sys
from pathlib import Path

source = Path(sys.argv[sys.argv.index('--') + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source))
report = {'source': source.name, 'objects': [], 'images': [], 'actions': []}
for obj in bpy.context.scene.objects:
    entry = {'name': obj.name, 'type': obj.type, 'dimensions': list(obj.dimensions), 'scale': list(obj.scale)}
    if obj.type == 'MESH':
        entry.update(vertices=len(obj.data.vertices), polygons=len(obj.data.polygons), materials=[m.name for m in obj.data.materials], groups=[g.name for g in obj.vertex_groups])
    if obj.type == 'ARMATURE':
        entry['bones'] = [{'name': b.name, 'head': list(b.head_local), 'tail': list(b.tail_local)} for b in obj.data.bones]
    report['objects'].append(entry)
report['images'] = [{'name': i.name, 'size': list(i.size), 'packed': bool(i.packed_file)} for i in bpy.data.images]
report['actions'] = [{'name': a.name, 'range': list(a.frame_range)} for a in bpy.data.actions]
out = source.parent / 'inspection.json'
out.write_text(json.dumps(report, indent=2))
print('CHARACTER_REPORT', out)
