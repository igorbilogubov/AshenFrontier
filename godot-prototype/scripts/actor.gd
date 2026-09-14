extends Node3D

var kind = "warrior"
var data: Dictionary = {}
var config: Dictionary = {}
var model: Node3D
var animator: AnimationPlayer
var tree: AnimationTree
var clips: Array[String] = []
var durations: Dictionary = {}
var weights: Dictionary = {}
var health: Label3D
var selected_ring: MeshInstance3D
var warning: MeshInstance3D
var clock = 0.0
var stride_phase = 0.0
var turn_phase = 0.0
var death_age = 0.0
var was_dead = false
var initialized = false
var latest_at = 0.0
var blend_speed = 0.0
var blend_run = 0.0
var attack_serial = -1
var attack_clip = "Attack_Sword_1"
var animation_state = "Idle"
var hit_age = 9.0
var last_hp = -1.0

func setup(type: String, settings: Dictionary):
	kind = type
	config = settings
	model = load("res://assets/%s.glb" % kind).instantiate()
	add_child(model)
	model.scale = Vector3.ONE * (1.12 if kind == "warrior" else float(config.get("scale", 1.0)))
	_prepare_meshes(model)
	animator = _find_animation(model)
	assert(animator != null, "GLB must contain AnimationPlayer")
	_build_blending()
	selected_ring = ring(0.55 * model.scale.x, 0.59 * model.scale.x, TAU, Color("ddbc76"))
	add_child(selected_ring)
	selected_ring.position.y = 0.028
	selected_ring.visible = false
	warning = ring(0.06, float(config.get("range", 1.35)) + 0.2, 1.44, Color(1.0, 0.39, 0.10, 0.38))
	add_child(warning)
	warning.position.y = 0.02
	warning.visible = false
	health = Label3D.new()
	health.font_size = 28
	health.pixel_size = 0.009
	health.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	health.no_depth_test = true
	health.outline_size = 7
	health.modulate = Color("efdbb3")
	health.position.y = 2.35 if kind == "warrior" else 1.75 * model.scale.x
	add_child(health)

func _prepare_meshes(node: Node):
	if node is MeshInstance3D:
		node.extra_cull_margin = 3.0
		if "Weapon_Axe" in node.name:
			node.visible = false
		for i in node.mesh.get_surface_count():
			var mat = node.get_active_material(i)
			if mat is StandardMaterial3D and mat.resource_name == "Layered_Fur":
				# The GLB combines a grain texture with per-vertex coat markings.
				# Godot imports this textured surface without enabling COLOR_0.
				var fur = mat.duplicate()
				fur.vertex_color_use_as_albedo = true
				node.set_surface_override_material(i, fur)
			if mat is StandardMaterial3D and mat.resource_name == "Weathered_Paladin_Steel":
				var tuned = mat.duplicate()
				tuned.albedo_color = Color(1.5, 1.5, 1.5)
				tuned.metallic = 0.25
				tuned.roughness = 0.6
				node.set_surface_override_material(i, tuned)
	for child in node.get_children():
		_prepare_meshes(child)

func _find_animation(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found = _find_animation(child)
		if found:
			return found
	return null

func _build_blending():
	# Each imported clip is sampled explicitly. The AnimationTree blends poses;
	# travelled distance controls gait, and server attack time controls contact.
	var graph = AnimationNodeBlendTree.new()
	for full_name in animator.get_animation_list():
		if full_name == "RESET":
			continue
		var clip = str(full_name).get_slice("/", str(full_name).get_slice_count("/") - 1)
		clips.append(clip)
		durations[clip] = animator.get_animation(full_name).length
		weights[clip] = 1.0 if clip == "Idle" else 0.0
		var animation = AnimationNodeAnimation.new()
		animation.animation = full_name
		graph.add_node(clip, animation)
		graph.add_node(clip + "_seek", AnimationNodeTimeSeek.new())
		graph.connect_node(clip + "_seek", 0, clip)
	assert(clips.has("Idle") and clips.has("Walk") and clips.has("Run"), "Missing locomotion clips")
	clips.erase("Idle")
	clips.push_front("Idle")
	var previous = "Idle_seek"
	for i in range(1, clips.size()):
		var node_name = "mix_%d" % i
		graph.add_node(node_name, AnimationNodeBlend2.new())
		graph.connect_node(node_name, 0, previous)
		graph.connect_node(node_name, 1, clips[i] + "_seek")
		previous = node_name
	graph.connect_node("output", 0, previous)
	tree = AnimationTree.new()
	add_child(tree)
	tree.anim_player = tree.get_path_to(animator)
	tree.root_node = tree.get_path_to(animator.get_node(animator.root_node))
	tree.tree_root = graph
	tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	tree.active = true

func receive(next: Dictionary):
	data = next.duplicate(true)
	latest_at = clock
	if not initialized:
		position = Vector3(float(data.x), 0, float(data.z))
		model.rotation.y = float(data.get("yaw", 0))
		initialized = true
	var hp = float(data.get("hp", 0))
	if last_hp >= 0 and hp < last_hp:
		hit_age = 0
	last_hp = hp

func animate(dt: float, selected: bool, local_hero: bool):
	if not initialized:
		return
	clock += dt
	hit_age += dt
	var old = position
	var before_yaw = model.rotation.y
	var goal = Vector3(float(data.x), 0, float(data.z))
	position = goal if position.distance_to(goal) > 3.0 else position.lerp(goal, 1.0 - exp(-18.0 * dt))
	model.rotation.y = lerp_angle(model.rotation.y, float(data.get("yaw", 0)), 1.0 - exp(-18.0 * dt))
	var travelled = position.distance_to(old)
	var turn = angle_difference(before_yaw, model.rotation.y)
	var speed = travelled / maxf(dt, 0.001)
	var dead = float(data.get("dead", 0)) > 0 if kind == "warrior" else data.get("state") == "dead"
	var state = str(data.get("state", "idle"))
	var extrapolation = minf(clock - latest_at, 0.1)
	var target = {}
	var times = {}
	for clip in clips:
		target[clip] = 0.0
		times[clip] = 0.0
	if dead:
		death_age = death_age + dt if was_dead else 0.0
		target.Death = 1.0
		times.Death = minf(death_age, durations.Death)
		animation_state = "Death"
	elif kind == "warrior" and data.get("attack") is Dictionary:
		var attack = data.attack
		if int(attack.id) != attack_serial:
			attack_serial = int(attack.id)
			attack_clip = "Attack_Sword_2" if data.get("weapon") == "axe" or attack_serial % 2 == 0 else "Attack_Sword_1"
		var phase = clampf((float(attack.age) + extrapolation) / float(attack.duration), 0, 1)
		var impact = 0.445 if attack_clip == "Attack_Sword_2" else 0.5
		var source_phase = phase / 0.49 * impact if phase < 0.49 else impact + (phase - 0.49) / 0.51 * (1 - impact)
		target[attack_clip] = 1.0
		times[attack_clip] = source_phase * durations[attack_clip]
		animation_state = attack_clip
	elif kind != "warrior" and (state == "windup" or state == "recover" and float(data.age) < 0.45):
		var phase = clampf(1.0 - (float(data.timer) - extrapolation) / float(config.windup), 0, 1) * 0.68 if state == "windup" else 0.68 + 0.32 * clampf((float(data.age) + extrapolation) / 0.45, 0, 1)
		target.Attack = 1.0
		times.Attack = phase * durations.Attack
		animation_state = "Attack"
	else:
		if was_dead:
			stride_phase = 0
			blend_speed = 0
		var move = clampf(speed / (1.0 if kind == "warrior" else 0.2), 0, 1)
		var run = clampf(float(data.get("runBlend", 0)), 0, 1) if kind == "warrior" else (1.0 if state != "idle" else 0.0)
		blend_speed = lerpf(blend_speed, move, 1.0 - exp(-12.0 * dt))
		blend_run = lerpf(blend_run, run, 1.0 - exp(-10.0 * dt))
		var strides = Vector2(1.4, 1.9) if kind == "warrior" else (Vector2(0.52, 0.82) if kind == "boar" else Vector2(0.72, 1.12))
		stride_phase += travelled / (lerpf(strides.x, strides.y, blend_run) * (model.scale.x if kind != "warrior" else 1.0))
		turn_phase += absf(turn)
		var turning = clampf(absf(turn) / maxf(dt, 0.001) / 0.65, 0, 1) * (1 - blend_speed) if clips.has("Turn_Left") else 0.0
		target.Idle = (1 - blend_speed) * (1 - turning)
		target.Walk = blend_speed * (1 - blend_run)
		target.Run = blend_speed * blend_run
		times.Idle = fmod(clock, durations.Idle)
		times.Walk = fmod(stride_phase, 1.0) * durations.Walk
		times.Run = fmod(stride_phase, 1.0) * durations.Run
		if clips.has("Turn_Left"):
			target["Turn_Left" if turn > 0 else "Turn_Right"] = turning
			times.Turn_Left = fmod(turn_phase, 1.0) * durations.Turn_Left
			times.Turn_Right = fmod(turn_phase, 1.0) * durations.Turn_Right
		animation_state = "Idle" if blend_speed < 0.1 else ("Run" if blend_run > 0.5 else "Walk")
		if hit_age < 0.22 and clips.has("Hit"):
			var hit_weight = sin(hit_age / 0.22 * PI) * 0.35
			for clip in clips:
				target[clip] *= 1.0 - hit_weight
			target.Hit = hit_weight
			times.Hit = hit_age
	var total = 0.0
	for i in clips.size():
		var clip = clips[i]
		weights[clip] = lerpf(weights[clip], target[clip], 1.0 - exp(-dt * (35.0 if dead else 22.0)))
		total += weights[clip]
		tree.set("parameters/%s_seek/seek_request" % clip, times[clip])
		if i > 0:
			tree.set("parameters/mix_%d/blend_amount" % i, weights[clip] / total if total > 0.0001 else 0.0)
	tree.advance(0.0)
	was_dead = dead
	model.visible = not dead or kind == "warrior" or float(data.get("age", 0)) < 2.0
	selected_ring.visible = not dead and (selected or local_hero)
	warning.visible = not dead and state == "windup"
	warning.rotation.y = float(data.get("targetYaw", 0))
	health.visible = not dead and not local_hero and (kind == "warrior" or selected or float(data.hp) < float(config.get("hp", 60)))
	health.text = "%s\n%d / %d" % [data.get("name", config.get("name", "Страж")), int(data.hp), int(data.get("maxHp", config.get("hp", 100)))]
	if kind == "warrior":
		for part in model.find_children("Weapon_*", "MeshInstance3D", true, false):
			if "Sword" in part.name:
				part.visible = data.get("weapon", "sword") != "axe"
			elif "Axe" in part.name:
				part.visible = data.get("weapon") == "axe"

static func ring(inner: float, outer: float, angle: float, color: Color) -> MeshInstance3D:
	var vertices = PackedVector3Array()
	var segments = 48
	for i in segments:
		var a = -angle / 2 + angle * i / segments
		var b = -angle / 2 + angle * (i + 1) / segments
		var p = Vector3(sin(a), 0, cos(a))
		var q = Vector3(sin(b), 0, cos(b))
		vertices.append_array(PackedVector3Array([p * inner, p * outer, q * outer, p * inner, q * outer, q * inner]))
	var arrays = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	var mesh = ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mat = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = color
	var instance = MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = mat
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return instance
