extends Node

signal snapshot(packet: Dictionary)
signal status_changed(message: String)
signal notice(message: String)

var socket: WebSocketPeer
var endpoint = "ws://127.0.0.1:4733/ws"
var hero_id = ""
var token = ""
var connected = false
var joined = false
var sequence = 0
var elapsed = 0.0
var retry_at = 0.0
var opened_at = 0.0
var received_at = 0.0
var retry_delay = 0.6
var fatal = false
var session_path = "user://session.cfg"

func _ready():
	if OS.has_feature("web"):
		endpoint = str(JavaScriptBridge.eval("(location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'"))
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--server="):
			endpoint = argument.trim_prefix("--server=")
		if argument.begins_with("--qa-session="):
			session_path = "user://qa-%s.cfg" % argument.trim_prefix("--qa-session=").sha256_text()
	var config = ConfigFile.new()
	if config.load(session_path) == OK:
		token = str(config.get_value(endpoint.sha256_text(), "token", ""))
	_open()

func _open():
	socket = WebSocketPeer.new()
	socket.inbound_buffer_size = 1048576
	socket.outbound_buffer_size = 65536
	connected = false
	joined = false
	sequence = 0
	opened_at = elapsed
	status_changed.emit("Подключаемся к опушке…")
	var error = socket.connect_to_url(endpoint)
	if error != OK:
		retry_at = elapsed + retry_delay

func _process(dt):
	elapsed += dt
	if fatal:
		return
	socket.poll()
	var state = socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not joined:
			joined = true
			var request = {"type":"join", "protocol":2, "name":"Страж Godot", "classId":"warrior"}
			if not token.is_empty():
				request.token = token
			send(request)
		while socket.get_available_packet_count() > 0:
			var packet = JSON.parse_string(socket.get_packet().get_string_from_utf8())
			if packet is Dictionary:
				_receive(packet)
		if (connected and elapsed - received_at > 3.0) or (not connected and elapsed - opened_at > 7.0):
			socket.close()
	elif state == WebSocketPeer.STATE_CLOSED:
		if connected:
			connected = false
			status_changed.emit("Связь потеряна · восстанавливаем героя…")
			retry_at = elapsed + retry_delay
		if elapsed >= retry_at:
			retry_delay = minf(retry_delay * 1.7, 4.0)
			retry_at = elapsed + retry_delay
			_open()
	elif state == WebSocketPeer.STATE_CONNECTING and elapsed - opened_at > 7.0:
		socket.close()

func _receive(packet: Dictionary):
	match packet.get("type", ""):
		"welcome":
			hero_id = str(packet.id)
			token = str(packet.token)
			var config = ConfigFile.new()
			config.load(session_path)
			config.set_value(endpoint.sha256_text(), "token", token)
			if config.save(session_path) != OK:
				notice.emit("Не удалось сохранить ключ этого тестового героя")
		"state":
			if hero_id.is_empty():
				return
			connected = true
			received_at = elapsed
			retry_delay = 0.6
			var saved = packet.get("save", {}).get("ok", false)
			status_changed.emit("Общий тестовый мир · сохранение работает" if saved else "Ошибка сохранения на сервере")
			snapshot.emit(packet)
		"error":
			status_changed.emit(str(packet.get("text", "Не удалось войти")))
			if packet.get("code") != "full":
				fatal = true
				connected = false
				socket.close()

func send(packet: Dictionary):
	if socket and socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		socket.send_text(JSON.stringify(packet))

func movement(direction: Vector2, aim = null):
	if not connected:
		return
	sequence += 1
	send({"type":"input", "x":direction.x, "z":direction.y, "aim":aim, "seq":sequence})

func _exit_tree():
	if socket:
		movement(Vector2.ZERO)
		socket.close(1000, "Client closed")
