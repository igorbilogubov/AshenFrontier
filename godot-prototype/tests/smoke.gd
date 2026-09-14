extends SceneTree

var game: Node3D
var failures: Array[String] = []

func _initialize():
	call_deferred("run")

func check(condition: bool, message: String):
	if not condition:
		failures.append(message)
		push_error(message)
	else:
		print("PASS ", message)

func pause(seconds: float):
	await create_timer(seconds).timeout

func mouse(point: Vector2, button = false, pressed = false):
	var event: InputEventMouse
	if button:
		event = InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = pressed
	else:
		event = InputEventMouseMotion.new()
	event.position = point
	event.global_position = point
	root.push_input(event, true)

func key(code: Key):
	var event = InputEventKey.new()
	event.physical_keycode = code
	event.pressed = true
	root.push_input(event, true)
	event = event.duplicate()
	event.pressed = false
	root.push_input(event, true)

func place() -> Vector2:
	return Vector2(game.hero.x, game.hero.z)

func steer(point: Vector3, seconds: float):
	mouse(game.camera.unproject_position(point), true, true)
	var until = Time.get_ticks_msec() + seconds * 1000
	while Time.get_ticks_msec() < until:
		mouse(game.camera.unproject_position(point))
		await process_frame
	mouse(game.cursor, true, false)
	await pause(0.3)

func run():
	var valid_fill = true
	for i in 10001:
		var polygon = preload("res://scripts/orb.gd").liquid_polygon(Vector2(55, 64), 47, i / 10000.0)
		if not polygon.is_empty() and Geometry2D.triangulate_polygon(polygon).is_empty():
			valid_fill = false
	check(valid_fill, "HP/MP liquid triangulates across empty, partial and full values")
	root.size = Vector2i(1280, 800)
	game = load("res://main.tscn").instantiate()
	root.add_child(game)
	await pause(2)
	check(game.network.connected and game.snapshot_count > 10, "Godot receives authoritative snapshots")
	if not game.network.connected:
		quit(1)
		return
	check(game.mobs.size() == 7, "Seven existing mobs loaded")
	check(game.hud.root.get_global_rect().encloses(game.hud.bottom.get_global_rect()), "Bottom HUD stays inside the viewport")
	for mob_actor in game.mobs.values():
		for mesh in mob_actor.model.find_children("*", "MeshInstance3D", true, false):
			for surface in mesh.mesh.get_surface_count():
				var material = mesh.get_active_material(surface)
				if material.resource_name == "Layered_Fur":
					check(material.vertex_color_use_as_albedo, "Creature coat markings survive GLB import: " + mob_actor.kind)
	var actor = game.players[game.network.hero_id]
	check(actor.clips.size() == 7, "Warrior imports seven animation clips")
	var skeleton = actor.model.find_children("*", "Skeleton3D", true, false)[0]
	var foot = -1
	for i in skeleton.get_bone_count():
		if "LeftFoot" in skeleton.get_bone_name(i):
			foot = i
	check(foot >= 0, "Imported warrior skeleton has a left foot")
	var initial = place()
	var yaw = float(game.hero.yaw)
	mouse(Vector2(950, 450))
	key(KEY_W)
	key(KEY_RIGHT)
	await pause(0.6)
	check(place().distance_to(initial) < 0.02 and absf(angle_difference(yaw, game.hero.yaw)) < 0.02, "Hover and movement keys do not move or turn hero")
	var basis = game.camera.global_basis
	var pose = skeleton.get_bone_pose_rotation(foot)
	mouse(game.camera.unproject_position(Vector3(4, 0, 2)), true, true)
	await pause(0.45)
	check(pose.angle_to(skeleton.get_bone_pose_rotation(foot)) > 0.01, "AnimationTree changes the actual skeleton pose during walking")
	mouse(game.cursor, true, false)
	await pause(0.3)
	check(place().distance_to(initial) > 0.3, "Held LMB moves through server simulation")
	var stopped = place()
	await pause(0.5)
	check(place().distance_to(stopped) < 0.02 and not game.held, "LMB release stops movement")
	check(game.camera.global_basis.is_equal_approx(basis), "Camera orientation stays fixed while following")
	var was_running = bool(game.hero.running)
	key(KEY_SHIFT)
	await pause(0.2)
	check(bool(game.hero.running) != was_running, "Shift toggles server walk/run mode")
	var wheel = InputEventMouseButton.new()
	wheel.position = Vector2(640, 400)
	wheel.button_index = MOUSE_BUTTON_WHEEL_UP
	wheel.pressed = true
	root.push_input(wheel, true)
	await pause(0.2)
	check(game.target_zoom > 1.0 and game.camera.size < 14.2, "Mouse wheel zooms the fixed camera")
	mouse(Vector2(950, 420), true, true)
	await pause(0.15)
	mouse(game.hud.bottom.get_global_rect().get_center())
	await pause(0.2)
	check(not game.held, "Dragging over the HUD stops movement")
	mouse(Vector2(950, 420), true, true)
	await pause(0.1)
	game._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	await pause(0.2)
	check(not game.held, "Losing focus releases movement")
	await steer(Vector3(6.5, 0, 2), 3)
	var old_xp = int(game.hero.xp)
	var old_gold = int(game.hero.gold)
	var until = Time.get_ticks_msec() + 30000
	var mob = game.mobs[0] if game.mobs.has(0) else game.mobs.values()[0]
	mouse(game.camera.unproject_position(mob.position + Vector3(0, 0.45, 0)), true, true)
	while Time.get_ticks_msec() < until and int(game.hero.xp) <= old_xp:
		mouse(game.camera.unproject_position(mob.position + Vector3(0, 0.45, 0)))
		if float(game.hero.hp) < 55:
			game.network.send({"type":"potion"})
		await process_frame
	mouse(game.cursor, true, false)
	await pause(0.5)
	check(int(game.hero.xp) > old_xp and int(game.hero.gold) > old_gold, "Held attack kills a mob and earns server XP and gold")
	game._action("camp")
	await pause(0.5)
	var saved_xp = int(game.hero.xp)
	var saved_gold = int(game.hero.gold)
	var identity = game.network.token
	game.network.socket.close()
	await pause(3)
	check(game.network.connected and identity == game.network.token and saved_xp == int(game.hero.xp) and saved_gold == int(game.hero.gold), "Reconnect restores the same saved hero and rewards")
	game.queue_free()
	await pause(1.2)
	game = load("res://main.tscn").instantiate()
	root.add_child(game)
	await pause(2)
	check(game.network.connected and identity == game.network.token and saved_xp == int(game.hero.xp) and saved_gold == int(game.hero.gold), "Reloading the client reads its saved identity and restores rewards")
	var qa_session = game.network.session_path
	print("SMOKE_RESULT ", JSON.stringify({"ok":failures.is_empty(), "failures":failures, "diagnostics":game.diagnostics()}))
	game.queue_free()
	await process_frame
	if qa_session.begins_with("user://qa-"):
		DirAccess.remove_absolute(qa_session)
	quit(0 if failures.is_empty() else 1)
