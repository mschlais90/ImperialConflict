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

	for unit_type: String in UnitData.DEFS:
		if unit_type == "explorer":
			continue  # Explorer built via planet build queue
		var def: Dictionary = UnitData.DEFS[unit_type]
		var cost: Dictionary = def["cost"]
		var affordable := _max_affordable(player, cost)

		var block := VBoxContainer.new()
		block.add_theme_constant_override("separation", 0)
		_train_section.add_child(block)

		var name_lbl := Label.new()
		var is_special: bool = def.get("is_special", false)
		if is_special:
			var empire_total := 0
			for p in GalaxyData.get_planets_for_empire(player.id):
				empire_total += p.units.get(unit_type, 0)
			name_lbl.text = "%s (empire: %d)" % [def["name"], empire_total]
		else:
			name_lbl.text = def["name"]
		name_lbl.add_theme_font_size_override("font_size", 11)
		name_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.9))
		block.add_child(name_lbl)

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		block.add_child(row)

		var cost_lbl := Label.new()
		cost_lbl.text = _format_cost(cost)
		cost_lbl.add_theme_font_size_override("font_size", 9)
		cost_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.55))
		cost_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(cost_lbl)

		var spin := SpinBox.new()
		spin.min_value = 0
		spin.max_value = affordable
		spin.value = 0
		spin.custom_minimum_size = Vector2(70, 0)
		spin.add_theme_font_size_override("font_size", 10)
		row.add_child(spin)

		var btn := Button.new()
		btn.text = "Train"
		btn.add_theme_font_size_override("font_size", 10)
		btn.custom_minimum_size = Vector2(42, 0)
		var utype: String = unit_type
		var spin_ref := spin
		btn.pressed.connect(func() -> void: _train_units(utype, int(spin_ref.value)))
		row.add_child(btn)

		if affordable == 0:
			var warn := Label.new()
			warn.text = "Not enough resources"
			warn.add_theme_font_size_override("font_size", 9)
			warn.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
			block.add_child(warn)


func _train_units(unit_type: String, count: int) -> void:
	if current_planet == null or count <= 0:
		return
	var player := GalaxyData.get_player_empire()
	if player == null or current_planet.owner_id != player.id:
		return

	var def := UnitData.get_def(unit_type)
	if def.is_empty():
		return

	var cost: Dictionary = def["cost"]
	var trained := 0
	for _i in count:
		if not _can_afford(player, cost):
			break
		for resource: String in cost:
			player.resources[resource] = player.resources.get(resource, 0) - cost[resource]
		current_planet.units[unit_type] = current_planet.units.get(unit_type, 0) + 1
		trained += 1

	if trained > 0:
		var uname: String = def.get("name", unit_type)
		EventBus.notification_posted.emit("Trained %d %s on %s" % [trained, uname, current_planet.planet_name], "build")
		if trained < count:
			EventBus.notification_posted.emit("Could only afford %d of %d" % [trained, count], "warning")
	else:
		EventBus.notification_posted.emit("Can't afford that!", "warning")

	EventBus.resources_changed.emit()
	_refresh()


# --- Send Fleet ---

func _refresh_send() -> void:
	_clear_section(_send_section)

	var player := GalaxyData.get_player_empire()
	if player == null or current_planet.owner_id != player.id:
		_add_label(_send_section, "Not your planet", Color(0.5, 0.5, 0.5))
		return

	# Portal fleet summary
	if current_planet.has_portal:
		var pooled := {}
		for p in GalaxyData.get_planets_for_empire(player.id):
			if not p.has_portal:
				continue
			for ut in ["fighter", "bomber", "transport", "soldier", "droid"]:
				var count: int = p.units.get(ut, 0)
				if count > 0:
					pooled[ut] = pooled.get(ut, 0) + count
		var has_pooled := false
		for ut in ["fighter", "bomber", "transport", "soldier", "droid"]:
			var total: int = pooled.get(ut, 0)
			if total > 0:
				if not has_pooled:
					var portal_hdr := Label.new()
					portal_hdr.text = "Portal Fleet (all portalled planets)"
					portal_hdr.add_theme_font_size_override("font_size", 11)
					portal_hdr.add_theme_color_override("font_color", Color(0.8, 0.5, 1.0))
					_send_section.add_child(portal_hdr)
					has_pooled = true
				var def := UnitData.get_def(ut)
				var uname: String = def.get("name", ut) if not def.is_empty() else ut
				_add_info_row(_send_section, "  " + uname, str(total))
		if has_pooled:
			var sep := HSeparator.new()
			sep.add_theme_color_override("separator", Color(0.3, 0.2, 0.5, 0.5))
			_send_section.add_child(sep)

	# Unit selection spinboxes (this planet only)
	_send_amounts.clear()
	for unit_type in current_planet.units:
		if unit_type == "agent" or unit_type == "wizard":
			continue  # Special units don't deploy in fleets
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

	# Transport capacity hint
	var hint := Label.new()
	hint.text = "Each transport carries up to 100 ground troops"
	hint.add_theme_font_size_override("font_size", 9)
	hint.add_theme_color_override("font_color", Color(0.4, 0.5, 0.6))
	_send_section.add_child(hint)

	# Send button
	_send_button = Button.new()
	_send_button.text = "Send Fleet"
	_send_button.add_theme_font_size_override("font_size", 12)
	_send_button.disabled = _target_planet_id < 0
	_send_button.pressed.connect(_on_send_fleet)
	_send_section.add_child(_send_button)

	# Recall to portal button (only on non-portal planets with units)
	if not current_planet.has_portal and not _send_amounts.is_empty():
		var nearest_portal: Planet = null
		var nearest_dist := INF
		for p in GalaxyData.get_planets_for_empire(player.id):
			if not p.has_portal or p.id == current_planet.id:
				continue
			var dist := _system_distance(current_planet.system_id, p.system_id)
			if dist < nearest_dist:
				nearest_dist = dist
				nearest_portal = p
		if nearest_portal != null:
			var ticks := GalaxyData.calc_travel_ticks(current_planet.system_id, nearest_portal.system_id)
			var sep := HSeparator.new()
			sep.add_theme_color_override("separator", Color(0.3, 0.2, 0.5, 0.5))
			_send_section.add_child(sep)

			var recall_btn := Button.new()
			recall_btn.text = "Recall to Portal (%s, %d ticks)" % [nearest_portal.planet_name, ticks]
			recall_btn.add_theme_font_size_override("font_size", 11)
			recall_btn.add_theme_color_override("font_color", Color(0.8, 0.5, 1.0))
			var target_p := nearest_portal
			recall_btn.pressed.connect(func() -> void: _on_recall_to_portal(target_p))
			_send_section.add_child(recall_btn)

			var recall_hint := Label.new()
			recall_hint.text = "Send selected units to nearest portal planet"
			recall_hint.add_theme_font_size_override("font_size", 9)
			recall_hint.add_theme_color_override("font_color", Color(0.5, 0.4, 0.6))
			_send_section.add_child(recall_hint)


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


func _on_recall_to_portal(target: Planet) -> void:
	if current_planet == null:
		return
	var player := GalaxyData.get_player_empire()
	if player == null or current_planet.owner_id != player.id:
		return

	# Gather selected units from spinboxes
	var units_to_send: Dictionary = {}
	var any_units := false
	for unit_type in _send_amounts:
		var spin: SpinBox = _send_amounts[unit_type]
		var amount := int(spin.value)
		if amount > 0:
			units_to_send[unit_type] = amount
			any_units = true

	if not any_units:
		# If nothing selected, send all military units
		for unit_type in ["fighter", "bomber", "soldier", "droid", "transport"]:
			var count: int = current_planet.units.get(unit_type, 0)
			if count > 0:
				units_to_send[unit_type] = count
				any_units = true

	if not any_units:
		EventBus.notification_posted.emit("No units to recall!", "warning")
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

	var ticks := GalaxyData.calc_travel_ticks(current_planet.system_id, target.system_id)

	var fleet := Fleet.create(
		GalaxyData.next_fleet_id(),
		player.id,
		units_to_send,
		current_planet.system_id,
		target.system_id,
		target.id,
		ticks
	)
	GalaxyData.fleets.append(fleet)
	EventBus.fleet_launched.emit(fleet)

	var total_sent := 0
	for ut in units_to_send:
		total_sent += units_to_send[ut]
	EventBus.notification_posted.emit("Recalling %d units to %s (%d ticks)" % [total_sent, target.planet_name, ticks], "fleet")
	_refresh()


# --- Helpers ---

func _system_distance(sys_a_id: int, sys_b_id: int) -> float:
	var sys_a := GalaxyData.get_system(sys_a_id)
	var sys_b := GalaxyData.get_system(sys_b_id)
	if sys_a == null or sys_b == null:
		return INF
	return sys_a.position.distance_to(sys_b.position)


func _max_affordable(empire: Empire, cost: Dictionary) -> int:
	var max_count := 9999
	for resource: String in cost:
		var available: int = empire.resources.get(resource, 0)
		var per_unit: int = cost[resource]
		if per_unit <= 0:
			continue
		var affordable := available / per_unit
		if affordable < max_count:
			max_count = affordable
	return max_count


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


func _add_info_row(parent: VBoxContainer, label_text: String, value_text: String) -> void:
	var row := HBoxContainer.new()
	parent.add_child(row)
	var lbl := Label.new()
	lbl.text = label_text
	lbl.add_theme_font_size_override("font_size", 11)
	lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(lbl)
	var val := Label.new()
	val.text = value_text
	val.add_theme_font_size_override("font_size", 11)
	val.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(val)


func _add_label(parent: VBoxContainer, text: String, color: Color) -> void:
	var lbl := Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", 11)
	lbl.add_theme_color_override("font_color", color)
	parent.add_child(lbl)


func _clear_section(section: VBoxContainer) -> void:
	for child in section.get_children():
		child.queue_free()
