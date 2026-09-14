extends CanvasLayer

signal action(command: String)
var root: Control
var hp_orb: Control
var mp_orb: Control
var hp_text: Label
var mp_text: Label
var summary: Label
var quest: Label
var status: Label
var performance_label: Label
var target: Label
var toast: Label
var run_button: Button
var potion_button: Button
var bottom: PanelContainer
var toast_time = 0.0
var modal = false
var title_font: SystemFont

func _ready():
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var theme = Theme.new()
	theme.default_font_size = 15
	theme.set_color("font_color", "Label", Color("e5dbc4"))
	for state in ["normal", "hover", "pressed", "focus"]:
		var style = StyleBoxFlat.new()
		style.bg_color = Color("27352f") if state == "normal" else Color("495342")
		style.border_color = Color("8f7950")
		style.set_border_width_all(1)
		style.set_corner_radius_all(4)
		style.content_margin_left = 12
		style.content_margin_right = 12
		style.content_margin_top = 10
		style.content_margin_bottom = 10
		theme.set_stylebox(state, "Button", style)
	root.theme = theme
	title_font = SystemFont.new()
	title_font.font_names = PackedStringArray(["Georgia", "serif"])
	var heading = label("Пепельная опушка", 30, Vector2(30, 34))
	heading.add_theme_font_override("font", title_font)
	label("П Е П Е Л Ь Н Ы Й   Р У Б Е Ж", 11, Vector2(32, 17)).modulate = Color("c4ae7a")
	label("GODOT  ·  ПРОБНАЯ СЦЕНА", 11, Vector2(33, 79)).modulate = Color("b8c6b5")
	var task_panel = panel(Vector2(30, 121), Vector2(240, 158))
	var tasks = VBoxContainer.new()
	task_panel.add_child(tasks)
	var task_title = Label.new()
	task_title.text = "ПЕРВАЯ ВЫЛАЗКА"
	task_title.add_theme_font_size_override("font_size", 12)
	task_title.modulate = Color("c4ae7a")
	tasks.add_child(task_title)
	quest = Label.new()
	quest.add_theme_font_size_override("font_size", 14)
	tasks.add_child(quest)
	status = label("Подключение…", 12, Vector2(30, 294))
	performance_label = label("", 12, Vector2.ZERO)
	performance_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	performance_label.offset_left = -335
	performance_label.offset_top = 24
	target = label("", 18, Vector2.ZERO)
	target.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	target.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	target.offset_left = -200
	target.offset_top = 110
	target.size = Vector2(400, 65)
	toast = label("", 17, Vector2.ZERO)
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	toast.offset_left = -350
	toast.offset_top = 190
	toast.size = Vector2(700, 50)
	bottom = panel(Vector2.ZERO, Vector2(756, 158))
	bottom.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	bottom.offset_left = -378
	bottom.offset_top = -185
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	bottom.add_child(row)
	hp_orb = _orb(row, Color("9d332b"))
	hp_text = _orb_label(hp_orb, "ЖИЗНЬ")
	var middle = VBoxContainer.new()
	middle.custom_minimum_size.x = 460
	middle.add_theme_constant_override("separation", 9)
	row.add_child(middle)
	summary = Label.new()
	summary.add_theme_font_size_override("font_size", 13)
	middle.add_child(summary)
	var buttons = HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 7)
	middle.add_child(buttons)
	_button(buttons, "Меч\n1", "sword")
	_button(buttons, "Топор\n2", "axe")
	_button(buttons, "Раскол\nQ", "special")
	potion_button = _button(buttons, "Зелье\nR", "potion")
	run_button = _button(buttons, "Бег\nShift", "run")
	var camp_button = _button(middle, "Вернуться к костру", "camp")
	camp_button.add_theme_font_size_override("font_size", 12)
	mp_orb = _orb(row, Color("2c608b"))
	mp_text = _orb_label(mp_orb, "МАНА")
	var hint = label("Удерживайте ЛКМ — идти / бить    ·    Колесо — зум    ·    Shift — шаг / бег", 12, Vector2.ZERO)
	hint.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	hint.offset_left = -420
	hint.offset_top = -24
	hint.size.x = 840
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

func panel(pos: Vector2, dimensions: Vector2) -> PanelContainer:
	var node = PanelContainer.new()
	node.position = pos
	node.custom_minimum_size = dimensions
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.10, 0.09, 0.91)
	style.border_color = Color("746a49")
	style.set_border_width_all(1)
	style.set_corner_radius_all(5)
	style.set_content_margin_all(14)
	node.add_theme_stylebox_override("panel", style)
	root.add_child(node)
	return node

func label(text: String, font_size: int, position: Vector2) -> Label:
	var node = Label.new()
	node.text = text
	node.position = position
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.add_theme_font_size_override("font_size", font_size)
	root.add_child(node)
	return node

func _button(parent: Node, caption: String, command: String) -> Button:
	var button = Button.new()
	button.text = caption
	button.focus_mode = Control.FOCUS_NONE
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.pressed.connect(func(): action.emit(command))
	parent.add_child(button)
	return button

func _orb(parent: Node, color: Color) -> Control:
	var orb = preload("res://scripts/orb.gd").new()
	orb.custom_minimum_size = Vector2(110, 128)
	orb.tint = color
	orb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(orb)
	return orb

func _orb_label(parent: Control, caption: String) -> Label:
	var heading = Label.new()
	heading.text = caption
	heading.add_theme_font_size_override("font_size", 10)
	heading.position = Vector2(0, 0)
	heading.size.x = 110
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	parent.add_child(heading)
	var value = Label.new()
	value.add_theme_font_size_override("font_size", 15)
	value.add_theme_color_override("font_shadow_color", Color.BLACK)
	value.add_theme_constant_override("shadow_offset_y", 2)
	value.position = Vector2(0, 59)
	value.size.x = 110
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	parent.add_child(value)
	return value

func blocked(point: Vector2) -> bool:
	var hovered = root.get_viewport().gui_get_hovered_control()
	return hovered != null and hovered.mouse_filter != Control.MOUSE_FILTER_IGNORE or bottom.get_global_rect().has_point(point)

func update(hero: Dictionary, selected: Dictionary, count: int, dt: float):
	toast_time = maxf(toast_time - dt, 0)
	toast.visible = toast_time > 0
	performance_label.text = "%d FPS   ·   %d игроков   ·   Compatibility" % [Engine.get_frames_per_second(), count]
	if hero.is_empty():
		return
	hp_orb.ratio = lerpf(hp_orb.ratio, float(hero.hp) / maxf(float(hero.maxHp), 1), 1 - exp(-12 * dt))
	mp_orb.ratio = lerpf(mp_orb.ratio, float(hero.mana) / maxf(float(hero.maxMana), 1), 1 - exp(-12 * dt))
	hp_orb.queue_redraw()
	mp_orb.queue_redraw()
	hp_text.text = "%d / %d" % [hero.hp, hero.maxHp]
	mp_text.text = "%d / %d" % [hero.mana, hero.maxMana]
	summary.text = "Воин · ур. %d     %d золота     %d опыта" % [hero.level, hero.gold, hero.xp]
	run_button.text = ("Бег" if hero.running else "Шаг") + "\nShift"
	potion_button.text = "Зелье %d\nR" % hero.potions
	quest.text = "Верните лесу покой\n\nСущества: %d / 5\nСедой вожак: %s\n\nНаграда: 50 золота" % [mini(int(hero.questKills), 5), "побеждён" if hero.boss else "в руинах"]
	target.text = "" if selected.is_empty() else "%s\n%d / %d" % [selected.get("label", ""), selected.hp, selected.get("maxHp", 60)]

func notify(message: String):
	toast.text = message
	toast_time = 3.0
