extends Node3D

var materials = {}
var fire: OmniLight3D
var flames: Array[MeshInstance3D] = []
var clock = 0.0

func build(world: Dictionary):
	var environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("3c4a42")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("b9c9bc")
	environment.ambient_light_energy = 0.45
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var sky = WorldEnvironment.new()
	sky.environment = environment
	add_child(sky)
	var sun = DirectionalLight3D.new()
	sun.light_color = Color("ffe4bd")
	sun.light_energy = 0.85
	sun.rotation_degrees = Vector3(-55, -38, 0)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 65.0
	add_child(sun)
	_ground()
	_house()
	_camp()
	_forest(world.trees)
	var stone = material("6f756d")
	for obstacle in world.obstacles:
		var x = float(obstacle.x)
		var z = float(obstacle.z)
		if x < 5:
			continue
		if obstacle.has("w"):
			box(Vector3(x, 0.5, z), Vector3(obstacle.w, 1, obstacle.d), stone)
		elif float(obstacle.r) > 0.33:
			if x > 22 and z < 3:
				cylinder(Vector3(x, 0.8, z), 0.25, 0.36, 1.6, stone)
			else:
				var rock = SphereMesh.new()
				rock.radial_segments = 7
				rock.rings = 3
				rock.radius = float(obstacle.r) * 1.3
				rock.height = rock.radius * 1.6
				mesh(rock, Vector3(x, rock.radius * 0.55, z), stone)
	var sign = box(Vector3(4.7, 1.5, -0.7), Vector3(1.9, 0.45, 0.14), material("423d31"))
	sign.rotation.y = 0.55
	cylinder(Vector3(4.7, 0.7, -0.7), 0.065, 0.09, 1.4, material("574932"))
	var lettering = Label3D.new()
	lettering.text = "ОПУШКА  →"
	lettering.font_size = 40
	lettering.pixel_size = 0.007
	lettering.position = Vector3(4.75, 1.5, -0.62)
	lettering.rotation.y = 0.55
	lettering.modulate = Color("ead0a0")
	add_child(lettering)

func material(hex: String) -> StandardMaterial3D:
	if not materials.has(hex):
		var value = StandardMaterial3D.new()
		value.albedo_color = Color(hex)
		value.roughness = 0.9
		materials[hex] = value
	return materials[hex]

func mesh(shape: Mesh, pos: Vector3, mat: Material) -> MeshInstance3D:
	var instance = MeshInstance3D.new()
	instance.mesh = shape
	instance.position = pos
	instance.material_override = mat
	add_child(instance)
	return instance

func box(pos: Vector3, size: Vector3, mat: Material) -> MeshInstance3D:
	var shape = BoxMesh.new()
	shape.size = size
	return mesh(shape, pos, mat)

func cylinder(pos: Vector3, top: float, bottom: float, height: float, mat: Material, sides = 10) -> MeshInstance3D:
	var shape = CylinderMesh.new()
	shape.top_radius = top
	shape.bottom_radius = bottom
	shape.height = height
	shape.radial_segments = sides
	return mesh(shape, pos, mat)

func _ground():
	var plane = PlaneMesh.new()
	plane.size = Vector2(100, 70)
	var shader = Shader.new()
	shader.code = """
shader_type spatial;
uniform sampler2D soil : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
varying vec3 world_position;
void vertex() { world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
    vec2 p = world_position.xz;
    vec3 surface = texture(soil, p / 5.6).rgb;
    float path = abs(p.y - 1.0 - sin(p.x * 0.25) * 0.9);
    float trail = (1.0 - smoothstep(0.35, 2.0, path)) * 0.88;
    float camp = 1.0 - smoothstep(2.4, 4.4, length(p - vec2(-1.0, 0.0)));
    float grain = fract(sin(dot(floor(p * 95.0), vec2(12.9898, 78.233))) * 43758.5453);
    ALBEDO = mix(surface * vec3(0.40, 0.48, 0.39), vec3(0.25, 0.19, 0.12) * (0.92 + grain * 0.16), max(trail, camp) * 0.82);
    ROUGHNESS = 1.0;
}
"""
	var mat = ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("soil", load("res://assets/forest-floor.png"))
	var floor_mesh = mesh(plane, Vector3(10, -0.01, 0), mat)
	floor_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

func _house():
	var stone = material("74796e")
	var plaster = material("b4aa90")
	var timber = material("433a2f")
	var wood = material("70573a")
	box(Vector3(-5, 0.16, -4.6), Vector3(5, 0.32, 4.2), stone)
	box(Vector3(-5, 1.55, -4.6), Vector3(4.65, 2.6, 3.8), plaster)
	for x in [-7.32, -5.0, -2.68]:
		box(Vector3(x, 1.65, -2.66), Vector3(0.2, 2.8, 0.24), timber)
	for y in [0.5, 2.3, 2.83]:
		box(Vector3(-5, y, -4.6), Vector3(4.9, 0.16, 4.0), timber)
	for side in [-1, 1]:
		var roof = box(Vector3(-5, 3.30, -4.6 + side * 1.08), Vector3(5.5, 0.18, 2.7), material("455c64"))
		roof.rotation.x = side * 0.57
	box(Vector3(-5.65, 1.24, -2.63), Vector3(0.92, 1.85, 0.12), wood)
	for i in 3:
		box(Vector3(-5.65, 0.07 * (i + 1), -1.58 - i * 0.4), Vector3(1.55, 0.14 * (i + 1), 0.45), stone)
	var glow = material("e4aa59").duplicate()
	glow.emission_enabled = true
	glow.emission = Color("b77f33")
	for x in [-6.7, -3.88]:
		box(Vector3(x, 1.82, -2.63), Vector3(0.64, 0.75, 0.06), glow)
		box(Vector3(x, 1.82, -2.57), Vector3(0.045, 0.8, 0.12), timber)
		box(Vector3(x, 1.82, -2.57), Vector3(0.68, 0.055, 0.12), timber)
	box(Vector3(-3.15, 3.7, -4.9), Vector3(0.8, 1.5, 0.65), stone)

func _camp():
	var wood = material("654b33")
	for i in 11:
		var angle = i * TAU / 11
		var rock = SphereMesh.new()
		rock.radius = 0.24
		rock.height = 0.3
		rock.radial_segments = 7
		rock.rings = 4
		mesh(rock, Vector3(-2.3 + cos(angle) * 0.83, 0.16, -0.6 + sin(angle) * 0.83), material("898873"))
	for i in 4:
		var log_mesh = cylinder(Vector3(-2.3, 0.18 + i * 0.04, -0.6), 0.12, 0.13, 1.1, wood)
		log_mesh.rotation = Vector3(0, i * 0.88, PI / 2)
	var flame_mat = material("ffad35").duplicate()
	flame_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for i in 5:
		flames.append(cylinder(Vector3(-2.3 + sin(i * 4.0) * 0.2, 0.63, -0.6 + cos(i * 4.0) * 0.2), 0.015, 0.22, 0.9, flame_mat, 7))
	fire = OmniLight3D.new()
	fire.position = Vector3(-2.3, 1.1, -0.6)
	fire.light_color = Color("ffb663")
	fire.light_energy = 2.2
	fire.omni_range = 7
	add_child(fire)
	for point in [Vector3(-4, 0.28, -0.5), Vector3(-2.1, 0.28, -2.25)]:
		var seat = cylinder(point, 0.23, 0.23, 1.8, wood)
		seat.rotation.z = PI / 2
		if point.x > -3:
			seat.rotation.y = PI / 2
	box(Vector3(-0.4, 0.4, -4.2), Vector3(1.13, 0.8, 0.7), wood)
	for x in [-0.8, 0.0]:
		box(Vector3(x, 0.4, -4.2), Vector3(0.07, 0.84, 0.73), material("393c35"))

func _forest(trees: Array):
	var trunk = CylinderMesh.new()
	trunk.top_radius = 0.055
	trunk.bottom_radius = 0.18
	trunk.height = 4.2
	trunk.radial_segments = 7
	var transforms: Array[Transform3D] = []
	for tree_data in trees:
		var scale = float(tree_data.s)
		transforms.append(Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * scale), Vector3(tree_data.x, 2.02 * scale, tree_data.z)))
	_instances(trunk, material("554937"), transforms)
	# Layered crowns share meshes and draw calls; no physics is duplicated here.
	for layer in 4:
		var crown = CylinderMesh.new()
		crown.top_radius = 0.03
		crown.bottom_radius = 1.15 - layer * 0.18
		crown.height = 1.75
		crown.radial_segments = 11
		transforms.clear()
		for i in trees.size():
			var item = trees[i]
			var scale = float(item.s)
			transforms.append(Transform3D(Basis(Vector3.UP, i * 0.71).scaled(Vector3.ONE * scale), Vector3(item.x, (1.45 + layer * 0.72) * scale, item.z)))
		_instances(crown, material(["344c3e", "3c5745", "47624c", "536e53"][layer]), transforms)
	var grass = ArrayMesh.new()
	var arrays = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(-0.06, 0, 0), Vector3(0, 0.23, 0.02), Vector3(0.06, 0, 0), Vector3(0, 0, -0.06), Vector3(0.02, 0.19, 0), Vector3(0, 0, 0.06)])
	arrays[Mesh.ARRAY_NORMAL] = PackedVector3Array([Vector3.UP, Vector3.UP, Vector3.UP, Vector3.UP, Vector3.UP, Vector3.UP])
	grass.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var grass_mat = material("738260").duplicate()
	grass_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	var rng = RandomNumberGenerator.new()
	rng.seed = 71493
	transforms.clear()
	for i in 1800:
		var x = rng.randf_range(-10, 31)
		var z = rng.randf_range(-15, 15)
		if absf(z - 1 - sin(x * 0.25) * 0.9) < 1.7 or Vector2(x + 1, z).length() < 5.5:
			continue
		transforms.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * rng.randf_range(0.6, 1.5)), Vector3(x, 0, z)))
	_instances(grass, grass_mat, transforms, false)

func _instances(shape: Mesh, mat: Material, transforms: Array[Transform3D], shadows = true):
	var batch = MultiMesh.new()
	batch.transform_format = MultiMesh.TRANSFORM_3D
	batch.mesh = shape
	batch.instance_count = transforms.size()
	for i in transforms.size():
		batch.set_instance_transform(i, transforms[i])
	var instance = MultiMeshInstance3D.new()
	instance.multimesh = batch
	instance.material_override = mat
	if not shadows:
		instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(instance)

func _process(dt):
	clock += dt
	for i in flames.size():
		flames[i].scale.y = 0.85 + sin(clock * 7 + i * 1.4) * 0.15
	if fire:
		fire.light_energy = 2.2 + sin(clock * 9) * 0.15
