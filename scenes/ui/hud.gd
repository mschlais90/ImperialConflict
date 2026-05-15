extends PanelContainer
## Top bar HUD: resource display, tick counter, and speed controls.

var _gc_label: Label
var _food_label: Label
var _iron_label: Label
var _end_label: Label
var _oct_label: Label
var _tick_label: Label
var _speed_label: Label
var _nw_label: Label
var _planets_label: Label


func _ready() -> void:
	# Style the panel
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.08, 0.15, 0.95)
	style.border_color = Color(0.2, 0.3, 0.5)
	style.border_width_bottom = 2
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	add_theme_stylebox_override("panel", style)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 20)
	add_child(hbox)

	# Resources section
	var res_box := HBoxContainer.new()
	res_box.add_theme_constant_override("separation", 15)
	hbox.add_child(res_box)

	_gc_label = _create_resource_label(res_box, "GC", Color(1.0, 0.85, 0.2))
	_food_label = _create_resource_label(res_box, "Food", Color(0.4, 0.9, 0.4))
	_iron_label = _create_resource_label(res_box, "Iron", Color(0.7, 0.7, 0.8))
	_end_label = _create_resource_label(res_box, "End", Color(0.5, 0.7, 1.0))
	_oct_label = _create_resource_label(res_box, "Oct", Color(0.8, 0.5, 1.0))

	# Separator
	var sep := VSeparator.new()
	hbox.add_child(sep)

	# Planets
	_planets_label = Label.new()
	_planets_label.add_theme_font_size_override("font_size", 13)
	_planets_label.add_theme_color_override("font_color", Color(0.6, 0.8, 1.0))
	hbox.add_child(_planets_label)

	# Networth
	_nw_label = Label.new()
	_nw_label.add_theme_font_size_override("font_size", 13)
	_nw_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	hbox.add_child(_nw_label)

	# Spacer
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hbox.add_child(spacer)

	# Tick counter
	_tick_label = Label.new()
	_tick_label.add_theme_font_size_override("font_size", 13)
	_tick_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	hbox.add_child(_tick_label)

	# Speed controls
	var speed_box := HBoxContainer.new()
	speed_box.add_theme_constant_override("separation", 4)
	hbox.add_child(speed_box)

	_create_speed_button(speed_box, "||", TickEngine.Speed.PAUSED)
	_create_speed_button(speed_box, ">", TickEngine.Speed.NORMAL)
	_create_speed_button(speed_box, ">>", TickEngine.Speed.FAST)
	_create_speed_button(speed_box, ">>>", TickEngine.Speed.FASTEST)

	_speed_label = Label.new()
	_speed_label.add_theme_font_size_override("font_size", 12)
	_speed_label.add_theme_color_override("font_color", Color(0.6, 0.8, 0.6))
	speed_box.add_child(_speed_label)

	EventBus.tick_processed.connect(_on_tick)
	EventBus.speed_changed.connect(_on_speed_changed)
	EventBus.resources_changed.connect(_update_display)

	_update_display()
	_update_speed_display()


func _create_resource_label(parent: HBoxContainer, res_name: String, color: Color) -> Label:
	var container := HBoxContainer.new()
	container.add_theme_constant_override("separation", 3)
	parent.add_child(container)

	var name_label := Label.new()
	name_label.text = res_name + ":"
	name_label.add_theme_font_size_override("font_size", 12)
	name_label.add_theme_color_override("font_color", color.darkened(0.2))
	container.add_child(name_label)

	var value_label := Label.new()
	value_label.text = "0"
	value_label.add_theme_font_size_override("font_size", 13)
	value_label.add_theme_color_override("font_color", color)
	value_label.custom_minimum_size = Vector2(55, 0)
	container.add_child(value_label)

	return value_label


func _create_speed_button(parent: HBoxContainer, text: String, speed: int) -> void:
	var btn := Button.new()
	btn.text = text
	btn.custom_minimum_size = Vector2(36, 24)
	btn.add_theme_font_size_override("font_size", 11)
	btn.pressed.connect(func() -> void: TickEngine.set_speed(speed))
	parent.add_child(btn)


func _on_tick(_tick_number: int) -> void:
	_update_display()


func _on_speed_changed(_new_speed: int) -> void:
	_update_speed_display()


func _update_display() -> void:
	var player := GalaxyData.get_player_empire()
	if player == null:
		return
	_gc_label.text = _format_number(player.resources.get("gc", 0))
	var net_food := _calc_net_food(player)
	var food_amount: int = player.resources.get("food", 0)
	if net_food < 0:
		_food_label.text = "%s (%s)" % [_format_number(food_amount), _format_number(net_food)]
		_food_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	else:
		_food_label.text = "%s (+%s)" % [_format_number(food_amount), _format_number(net_food)]
		_food_label.add_theme_color_override("font_color", Color(0.4, 0.9, 0.4))
	_iron_label.text = _format_number(player.resources.get("iron", 0))
	_end_label.text = _format_number(player.resources.get("endurium", 0))
	_oct_label.text = _format_number(player.resources.get("octarine", 0))
	_tick_label.text = "Tick: %d" % TickEngine.current_tick
	_planets_label.text = "Planets: %d" % GalaxyData.get_planets_for_empire(player.id).size()
	_nw_label.text = "NW: %s" % _format_number(int(GalaxyData.calc_empire_networth(player.id)))


func _update_speed_display() -> void:
	match TickEngine.current_speed:
		TickEngine.Speed.PAUSED:
			_speed_label.text = "Paused"
		TickEngine.Speed.NORMAL:
			_speed_label.text = "1x"
		TickEngine.Speed.FAST:
			_speed_label.text = "2x"
		TickEngine.Speed.FASTEST:
			_speed_label.text = "4x"


func _calc_net_food(empire: Empire) -> int:
	var planets := GalaxyData.get_planets_for_empire(empire.id)
	var resource_mult := 1.0 + empire.get_science_percent("resources") / 100.0

	# Food debuff
	var food_reduction := 0.0
	for d in empire.debuffs:
		if d["type"] == "reduced_food":
			food_reduction += d["value"]
	food_reduction = minf(food_reduction, 0.5)

	# Production
	var production := 0
	for planet in planets:
		var farm_count: int = planet.buildings.get("farm", 0)
		if farm_count > 0:
			var def := BuildingData.get_def("farm")
			if not def.is_empty() and def.has("production"):
				var base: int = def["production"].get("food", 0) * farm_count
				var bonus: float = planet.resource_bonuses.get("food", 1.0)
				var amount := int(base * bonus * resource_mult)
				if food_reduction > 0.0:
					amount = int(amount * (1.0 - food_reduction))
				production += amount

	# Consumption
	var consumption := 0
	for planet in planets:
		consumption += planet.population / 10
		consumption += planet.get_total_units_except_droids()

	# Decay (0.5% of current stockpile)
	var decay := int(empire.resources.get("food", 0) * 0.005)

	return production - consumption - decay


func _format_number(n: int) -> String:
	if n >= 1000000:
		return "%.1fM" % (float(n) / 1000000.0)
	elif n >= 10000:
		return "%.1fK" % (float(n) / 1000.0)
	return str(n)
