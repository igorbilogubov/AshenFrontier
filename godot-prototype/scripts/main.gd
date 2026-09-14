extends Node3D

const Actor = preload("res://scripts/actor.gd")
const Network = preload("res://scripts/network.gd")
const HUD = preload("res://scripts/hud.gd")
const Landscape = preload("res://scripts/environment.gd")

var world: Dictionary
var network: Node
var hud: CanvasLayer
var camera: Camera3D
var players: Dictionary = {}
var mobs: Dictionary = {}
var hero: Dictionary = {}
var held = false
var cursor = Vector2.ZERO
var selected_id = -1
var target_zoom = 1.0
var zoom = 1.0
var focus = Vector3(0.5, 0.3, 2)
var send_time = 0.0
var attack_time = 0.0
var elapsed = 0.0
var snapshot_count = 0
var damage_events = 0
var frame_samples: Array[float] = []
var snapshot_gaps: Array[float] = []
var last_snapshot_at = -1.0
var shot_nodes: Dictionary = {}

func _ready():
	world = JSON.parse_string(FileAccess.get_file_as_string("res://generated/world.json"))
	var landscape = Landscape.new()
	add_child(landscape)
	landscape.build(world)
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 14.2
	camera.near = 0.1
	camera.far = 120
	add_child(camera)
	camera.current = true
	_update_camera(1.0)
	hud = HUD.new()
	add_child(hud)
	hud.action.connect(_action)
	network = Network.new()
	network.snapshot.connect(_snapshot)
	network.status_changed.connect(func(message):
		hud.status.text = message
		if not network.connected:
			held = false
	)
	network.notice.connect(hud.notify)
	add_child(network)
	cursor = get_viewport().get_visible_rect().size / 2
	print("Godot prototype ready: Compatibility, shared Node world, authoritative movement/combat.")

func _snapshot(packet: Dictionary):
	snapshot_count += 1
	if last_snapshot_at >= 0:
		snapshot_gaps.append(elapsed - last_snapshot_at)
		if snapshot_gaps.size() > 600:
			snapshot_gaps.pop_front()
	last_snapshot_at = elapsed
	hero = packet.self.duplicate(true)
	var present = {}
	for player in packet.players:
		var id = str(player.id)
		present[id] = true
		if not players.has(id):
			var actor = Actor.new()
			add_child(actor)
			actor.setup("warrior", {})
			players[id] = actor
		players[id].receive(hero if id == network.hero_id else player)
	for id in players.keys():
		if not present.has(id):
			players[id].queue_free()
			players.erase(id)
	for mob in packet.mobs:
		var id = int(mob.id)
		if not mobs.has(id):
			var actor = Actor.new()
			add_child(actor)
			actor.setup(str(mob.type), world.mobTypes[mob.type])
			mobs[id] = actor
		mobs[id].receive(mob)
	_update_shots(packet.get("projectiles", []))
	for event in packet.get("events", []):
		match event.get("type", ""):
			"notice":
				hud.notify(str(event.get("text", "")))
			"safe":
				hud.notify("Лагерь безопасен. Идите по тропе к опушке.")
			"death":
				hud.notify("Вы пали. Возвращение к костру…")
			"hit", "hurt", "miss", "heal":
				damage_events += 1
				_float_text(event)
			"kill":
				hud.notify("Победа · опыт и добыча сохранены")

func _input(event):
	if event is InputEventMouse:
		cursor = event.position
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		_stop()

func _unhandled_input(event):
	if event is InputEventMouseMotion:
		cursor = event.position
	elif event is InputEventMouseButton:
		cursor = event.position
		if event.button_index == MOUSE_BUTTON_LEFT:
			held = event.pressed
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			target_zoom = clampf(target_zoom * 1.12, 0.7, 1.9)
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			target_zoom = clampf(target_zoom / 1.12, 0.7, 1.9)
		elif event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
			_attack(false)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_SHIFT: _action("run")
			KEY_R: _action("potion")
			KEY_Q: _action("special")
			KEY_1: _action("sword")
			KEY_2: _action("axe")
			KEY_SPACE: _attack(false)
			KEY_ESCAPE: _stop()
			KEY_F3: _save_diagnostics()

func _notification(what):
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_stop()

func _stop():
	held = false
	if network:
		network.movement(Vector2.ZERO)

func _action(command: String):
	_stop()
	if hero.is_empty() or not network.connected:
		return
	match command:
		"run": network.send({"type":"run", "running":not hero.running})
		"potion": network.send({"type":"potion"})
		"camp": network.send({"type":"camp"})
		"sword", "axe": network.send({"type":"weapon", "weapon":command})
		"special": _attack(true)

func _ground_point():
	var origin = camera.project_ray_origin(cursor)
	var direction = camera.project_ray_normal(cursor)
	return Plane(Vector3.UP, 0).intersects_ray(origin, direction)

func _pick_mob() -> int:
	var origin = camera.project_ray_origin(cursor)
	var direction = camera.project_ray_normal(cursor)
	var nearest = INF
	var chosen = -1
	for id in mobs:
		var actor = mobs[id]
		if actor.data.get("state") in ["dead", "return"]:
			continue
		# Transform the ray into the actor's yaw frame; use the same generous
		# selection volume in native and web, independent of mesh triangle count.
		var pose = Transform3D(Basis(Vector3.UP, actor.model.rotation.y), actor.position)
		var inverse = pose.affine_inverse()
		var local_origin = inverse * origin
		var local_direction = inverse.basis * direction
		var scale = actor.model.scale.x
		var bounds = AABB(Vector3(-0.5, 0.05, -1.2) * scale, Vector3(1, 1.45, 2.4) * scale)
		var hit = bounds.intersects_ray(local_origin, local_direction)
		if hit is Vector3:
			var distance = origin.distance_to(pose * hit)
			if distance < nearest:
				nearest = distance
				chosen = id
	return chosen

func _attack(special: bool):
	if hero.is_empty() or not network.connected or elapsed < attack_time:
		return
	var point = _ground_point()
	if selected_id >= 0 and mobs.has(selected_id):
		point = mobs[selected_id].position
	if point is Vector3:
		var yaw = atan2(point.x - float(hero.x), point.z - float(hero.z))
		network.send({"type":"attack", "yaw":yaw, "special":special})
		attack_time = elapsed + 0.15

func _process(dt):
	if not network:
		return
	elapsed += dt
	if elapsed > 5:
		frame_samples.append(dt * 1000)
		if frame_samples.size() > 3600:
			frame_samples.pop_front()
	var blocked = hud.blocked(cursor)
	if held and (blocked or not network.connected):
		_stop()
	selected_id = -1 if blocked else _pick_mob()
	for id in players:
		players[id].animate(dt, false, id == network.hero_id)
	for id in mobs:
		mobs[id].animate(dt, id == selected_id, false)
	_update_camera(dt)
	send_time += dt
	if send_time >= 0.05:
		send_time = fmod(send_time, 0.05)
		var direction = Vector2.ZERO
		var aim = null
		var point = _ground_point()
		if held and point is Vector3 and not hero.is_empty() and float(hero.dead) <= 0:
			var target_actor = mobs.get(selected_id)
			if target_actor:
				point = target_actor.position
			var difference = Vector2(point.x - float(hero.x), point.z - float(hero.z))
			var distance = difference.length()
			if distance > 0.001:
				aim = atan2(difference.x, difference.y)
			var in_camp = Vector2(float(hero.x) - float(world.camp.x), float(hero.z) - float(world.camp.z)).length() < float(world.camp.r)
			if target_actor and distance <= 1.55 and not in_camp:
				_attack(false)
			elif distance > 0.18:
				direction = difference / distance * (1.0 if target_actor else minf(1.0, (distance - 0.18) / 0.7))
			network.movement(direction, aim)
		else:
			network.movement(Vector2.ZERO)
	var selected = {}
	if selected_id >= 0:
		selected = mobs[selected_id].data.duplicate()
		selected.label = mobs[selected_id].config.name
		selected.maxHp = mobs[selected_id].config.hp
	hud.update(hero, selected, players.size(), dt)

func _update_camera(dt: float):
	if network and players.has(network.hero_id):
		focus = focus.lerp(players[network.hero_id].position + Vector3(0, 0.3, 0), 1 - exp(-7 * dt))
	zoom = lerpf(zoom, target_zoom, 1 - exp(-12 * dt))
	camera.size = 14.2 / zoom
	var elevation = float(world.camera.elevation)
	var azimuth = float(world.camera.azimuth)
	camera.position = focus + Vector3(sin(azimuth) * cos(elevation), sin(elevation), cos(azimuth) * cos(elevation)) * 28
	camera.look_at(focus)

func _float_text(event: Dictionary):
	if not event.has("x") or not event.has("z"):
		return
	var text = Label3D.new()
	text.text = "Мимо" if event.get("type") == "miss" else str(int(event.get("amount", event.get("damage", 0))))
	text.position = Vector3(event.x, 1.8, event.z)
	text.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	text.no_depth_test = true
	text.pixel_size = 0.015
	text.font_size = 32
	text.outline_size = 8
	text.modulate = Color("f2c773")
	add_child(text)
	var tween = create_tween().set_parallel(true)
	tween.tween_property(text, "position:y", 2.7, 0.7)
	tween.tween_property(text, "modulate:a", 0, 0.7)
	tween.chain().tween_callback(text.queue_free)

func _update_shots(projectiles: Array):
	var present = {}
	for shot in projectiles:
		var id = str(shot.id)
		present[id] = true
		if not shot_nodes.has(id):
			var node = MeshInstance3D.new()
			var ball = SphereMesh.new()
			ball.radius = 0.10
			ball.height = 0.2
			var mat = StandardMaterial3D.new()
			mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			mat.albedo_color = Color("c1a4ef")
			node.mesh = ball
			node.material_override = mat
			add_child(node)
			shot_nodes[id] = node
		shot_nodes[id].position = Vector3(shot.x, 0.9, shot.z)
	for id in shot_nodes.keys():
		if not present.has(id):
			shot_nodes[id].queue_free()
			shot_nodes.erase(id)

func diagnostics() -> Dictionary:
	var sorted = frame_samples.duplicate()
	sorted.sort()
	var frame_p95 = sorted[int(sorted.size() * 0.95)] if not sorted.is_empty() else 0.0
	return {"engine":Engine.get_version_info().string, "platform":OS.get_name(), "renderer":"gl_compatibility", "viewport":str(get_viewport().get_visible_rect().size), "connected":network.connected, "snapshots":snapshot_count, "players":players.size(), "mobs":mobs.size(), "fps":Engine.get_frames_per_second(), "frame_p95_ms":frame_p95, "draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), "objects":Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME), "hp":hero.get("hp", 0), "gold":hero.get("gold", 0), "xp":hero.get("xp", 0), "position":[hero.get("x", 0),hero.get("z", 0)], "held":held, "zoom":target_zoom, "animation":players[network.hero_id].animation_state if players.has(network.hero_id) else "loading", "damage_events":damage_events}

func _save_diagnostics():
	var report = diagnostics()
	var file = FileAccess.open("user://diagnostics.json", FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(report, "\t"))
	print("PROTOTYPE_DIAGNOSTICS ", JSON.stringify(report))
	hud.notify("Замер записан · F3")
