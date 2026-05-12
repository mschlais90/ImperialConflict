extends PanelContainer
## Fleet management panel: train units, send fleets, colonize planets.
## Appears below or replaces the planet panel when interacting with fleet operations.

var current_planet: Planet = null
var _scroll: ScrollContainer
var _content: VBoxContainer
var _train_section: VBoxContainer
var _send_section: VBoxContainer
var _fleets_section: VBoxContainer

# Send fleet state
var _send_amounts: Dictionary = {}  # unit_type -> SpinBox
var _target_planet_id: int = -1
var _target_label: Label
var _picking_target: bool = false
var _send_button: Button


func _ready() -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.06, 0.12, 0.95)
	style.border_color = Color(0.2, 0.3, 0.5)
	style.border_width_left = 2
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	add_theme_stylebox_override("panel", style)

	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_scroll)

	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 6)
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_content)

	var title := Label.new()
	title.text = "Fleet & Units"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(title)

	_train_section = _create_section("Train Units")
	_send_section = _create_section("Send Fleet")
	_fleets_section = _create_section("In Transit")

	EventBus.planet_selected.connect(_on_planet_selected)
	EventBus.selection_cleared.connect(_on_selection_cleared)
	EventBus.tick_processed.connect(_on_tick)


func _create_section(title_text: String) -> VBoxContainer:
	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep)

	var header := Label.new()
	header.text = title_text
	header.add_theme_font_size_override("font_size", 13)
	header.add_theme_color_override("font_color", Color(0.6, 0.7, 0.9))
	_content.add_child(header)

	var section := VBoxContainer.new()
	section.add_theme_constant_override("separation", 3)
	_content.add_child(section)
	return section


func _on_planet_selected(planet: Resource) -> void:
	var p := planet as Planet
	if p == null:
		return

	if _picking_target:
		# We're in target selection mode
		if p != current_planet:
			_target_planet_id = p.id
		_picking_target = false
		_refresh_send()
		return

	# Normal planet selection - update current planet
	current_planet = p
	_target_planet_id = -1
	_refresh()


func _on_selection_cleared() -> void:
	current_planet = null


func _on_tick(_tick_number: int) -> void:
	if visible and current_planet:
		_refresh_fleets()


func _refresh() -> void:
	if current_planet == null:
		return
	_refresh_train()
	_refresh_send()
	_refresh_fleets()


# --- Train Units ---

func _refresh_train() -> void:
	_clear_section(_train_section)

	var player := GalaxyData.get_player_empire()
	if player == null or current_planet.owner_id != player.id:
		_add_label(_train_section, "Not your planet", Color(0.5, 0.5, 0.5))
		return

	for unit_type in UnitData.DEFS:
		var def: Dictionary = UnitData.DEFS[unit_type]
		var btn := Button.new()
		btn.text = "%s (%s)" % [def["name"], _format_cost(def["cost"])]
		btn.add_theme_font_size_override("font_size", 11)
		btn.tooltip_text = def.get("description", "")
		btn.disabled = not _can_afford(player, def["cost"])

		var utype: String = unit_type
		btn.pressed.connect(func() -> void: _train_unit(utype))
		_train_section.add_child(btn)


func _train_unit(unit_type: String) -> void:
	var player := GalaxyData.get_player_empire()
	if player == null or current_planet == null or current_planet.owner_id != player.id:
		return

	var def := UnitData.get_def(unit_type)
	if def.is_empty():
		return

	var cost: Dictionary = def["cost"]
	if not _can_afford(player, cost):
		return

	# Deduct cost
	for resource in cost:
		player.resources[resource] = player.resources.get(resource, 0) - cost[resource]

	# Add unit instantly (simplified - no build queue for units in MVP)
	current_planet.units[unit_type] = current_planet.units.get(unit_type, 0) + 1
	EventBus.resources_changed.emit()
	_refresh()


# --- Send Fleet ---

func _refresh_send() -> void:
	_clear_section(_send_section)

	var player := GalaxyData.get_player_empire()
	if player == null or current_planet.owner_id != player.id:
		_add_label(_send_section, "Not your planet", Color(0.5, 0.5, 0.5))
		return

	# Unit selection spinboxes
	_send_amounts.clear()
	for unit_type in current_planet.units:
		var count: int = current_planet.units[unit_type]
		if count <= 0:
			continue
		var def := UnitData.get_def(unit_type)
		var uname: String = def.get("name", unit_type) if not def.is_empty() else unit_type

		var row := HBoxContainer.new()
		_send_section.add_child(row)

		var lbl := Label.new()
		lbl.text = "%s (%d):" % [uname, count]
		lbl.add_theme_font_size_override("font_size", 11)
		lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(lbl)

		var spin := SpinBox.new()
		spin.min_value = 0
		spin.max_value = count
		spin.value = 0
		spin.custom_minimum_size = Vector2(70, 0)
		spin.add_theme_font_size_override("font_size", 11)
		row.add_child(spin)
		_send_amounts[unit_type] = spin

	# Target selection
	var target_row := HBoxContainer.new()
	_send_section.add_child(target_row)

	var target_lbl := Label.new()
	target_lbl.text = "Target:"
	target_lbl.add_theme_font_size_override("font_size", 11)
	target_lbl.add_theme_color_override("font_color", Color(0.6, 0.7, 0.9))
	target_row.add_child(target_lbl)

	_target_label = Label.new()
	_target_label.add_theme_font_size_override("font_size", 11)
	_target_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if _target_planet_id >= 0:
		var tp := GalaxyData.get_planet(_target_planet_id)
		_target_label.text = tp.planet_name if tp else "Invalid"
		_target_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.3))
	else:
		_target_label.text = "Click a planet"
		_target_label.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))
	target_row.add_child(_target_label)

	# Pick target button
	var pick_btn := Button.new()
	pick_btn.text = "Pick..."
	pick_btn.add_theme_font_size_override("font_size", 11)
	pick_btn.pressed.connect(_on_pick_target)
	target_row.add_child(pick_btn)

	# Travel time display
	if _target_planet_id >= 0:
		var tp := GalaxyData.get_planet(_target_planet_id)
		if tp:
			var ticks := GalaxyData.calc_travel_ticks(current_planet.system_id, tp.system_id)
			var travel_lbl := Label.new()
			travel_lbl.text = "Travel time: %d tick(s)" % ticks
			travel_lbl.add_theme_font_size_override("font_size", 11)
			travel_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
			_send_section.add_child(travel_lbl)

	# Send button
	_send_button = Button.new()
	_send_button.text = "Send Fleet"
	_send_button.add_theme_font_size_override("font_size", 12)
	_send_button.disabled = _target_planet_id < 0
	_send_button.pressed.connect(_on_send_fleet)
	_send_section.add_child(_send_button)


# --- Fleet Tracking ---

func _refresh_fleets() -> void:
	_clear_section(_fleets_section)

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	var player_fleets := GalaxyData.get_fleets_for_empire(player.id)
	if player_fleets.is_empty():
		_add_label(_fleets_section, "No fleets in transit", Color(0.5, 0.5, 0.5))
		return

	for fleet in player_fleets:
		var target_planet := GalaxyData.get_planet(fleet.target_planet_id)
		var target_name := target_planet.planet_name if target_planet else "Unknown"
		var type_text := "Exploring" if fleet.is_exploration else "%d units" % fleet.get_total_units()
		var row_text := "%s -> %s (%d ticks)" % [type_text, target_name, fleet.ticks_remaining]

		var lbl := Label.new()
		lbl.text = row_text
		lbl.add_theme_font_size_override("font_size", 11)
		lbl.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
		_fleets_section.add_child(lbl)


# --- Actions ---

func _on_pick_target() -> void:
	_picking_target = true
	EventBus.notification_posted.emit("Click a planet to set as fleet target", "info")


func _on_send_fleet() -> void:
	if current_planet == null or _target_planet_id < 0:
		return
	var player := GalaxyData.get_player_empire()
	if player == null or current_planet.owner_id != player.id:
		return

	var units_to_send: Dictionary = {}
	var any_units := false
	for unit_type in _send_amounts:
		var spin: SpinBox = _send_amounts[unit_type]
		var amount := int(spin.value)
		if amount > 0:
			units_to_send[unit_type] = amount
			any_units = true

	if not any_units:
		return

	# Check transport capacity
	var ground_units: int = units_to_send.get("soldier", 0) + units_to_send.get("droid", 0)
	var transport_capacity: int = units_to_send.get("transport", 0) * 100
	if ground_units > transport_capacity:
		EventBus.notification_posted.emit("Not enough transports! Need %d, have capacity for %d" % [ground_units, transport_capacity], "warning")
		return

	# Remove units from planet
	for unit_type in units_to_send:
		current_planet.units[unit_type] -= units_to_send[unit_type]

	# Calculate travel time
	var target_planet := GalaxyData.get_planet(_target_planet_id)
	var ticks := GalaxyData.calc_travel_ticks(current_planet.system_id, target_planet.system_id)

	# Create fleet
	var fleet := Fleet.create(
		GalaxyData.next_fleet_id(),
		player.id,
		units_to_send,
		current_planet.system_id,
		target_planet.system_id,
		_target_planet_id,
		ticks
	)
	GalaxyData.fleets.append(fleet)
	EventBus.fleet_launched.emit(fleet)

	var target_name := target_planet.planet_name if target_planet else "Unknown"
	EventBus.notification_posted.emit("Fleet dispatched to %s (%d ticks)" % [target_name, ticks], "fleet")

	_target_planet_id = -1
	_refresh()


# --- Helpers ---

func _can_afford(empire: Empire, cost: Dictionary) -> bool:
	for resource in cost:
		if empire.resources.get(resource, 0) < cost[resource]:
			return false
	return true


func _format_cost(cost: Dictionary) -> String:
	var parts: Array[String] = []
	for resource: String in cost:
		var label: String = resource
		match resource:
			"gc": label = "gc"
			"iron": label = "ir"
			"endurium": label = "en"
			"octarine": label = "oc"
			"food": label = "fd"
		parts.append("%d%s" % [cost[resource], label])
	return ", ".join(parts)


func _add_label(parent: VBoxContainer, text: String, color: Color) -> void:
	var lbl := Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", 11)
	lbl.add_theme_color_override("font_color", color)
	parent.add_child(lbl)


func _clear_section(section: VBoxContainer) -> void:
	for child in section.get_children():
		child.queue_free()
