extends PanelContainer
## Right-side panel showing planet details, buildings, build queue, and build menu.
## Uncolonized planets show an Explore button to send the nearest explorer ship.

var current_planet: Planet = null
var _scroll: ScrollContainer
var _content: VBoxContainer

# Section references
var _title_label: Label
var _info_section: VBoxContainer
var _buildings_section: VBoxContainer
var _queue_section: VBoxContainer
var _build_menu_section: VBoxContainer
var _units_section: VBoxContainer
var _explore_section: VBoxContainer

# Track build menu widgets for in-place updates
var _build_spin_boxes: Array = []  # [{spin: SpinBox, warn: Label, cost: Dictionary}]


func _ready() -> void:
	# Style
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

	_title_label = Label.new()
	_title_label.add_theme_font_size_override("font_size", 16)
	_title_label.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(_title_label)

	_info_section = _create_section("Info")
	_explore_section = _create_section("Explore")
	_buildings_section = _create_section("Buildings")
	_queue_section = _create_section("Build Queue")
	_build_menu_section = _create_section("Build")
	_units_section = _create_section("Units")

	EventBus.planet_selected.connect(_on_planet_selected)
	EventBus.selection_cleared.connect(_on_selection_cleared)
	EventBus.tick_processed.connect(_on_tick)
	EventBus.building_completed.connect(_on_building_completed)


func _create_section(title: String) -> VBoxContainer:
	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep)

	var header := Label.new()
	header.text = title
	header.add_theme_font_size_override("font_size", 13)
	header.add_theme_color_override("font_color", Color(0.6, 0.7, 0.9))
	_content.add_child(header)

	var section := VBoxContainer.new()
	section.add_theme_constant_override("separation", 2)
	_content.add_child(section)
	return section


func _on_planet_selected(planet: Resource) -> void:
	current_planet = planet as Planet
	if current_planet:
		_refresh()


func _on_selection_cleared() -> void:
	current_planet = null


func _on_tick(_tick_number: int) -> void:
	if visible and current_planet:
		_refresh_tick()


func _on_building_completed(planet: Resource, building_type: String) -> void:
	if current_planet and planet == current_planet:
		var bdef := BuildingData.get_def(building_type)
		var udef := UnitData.get_def(building_type)
		var bname: String
		if not bdef.is_empty():
			bname = bdef.get("name", building_type)
		elif not udef.is_empty():
			bname = udef.get("name", building_type)
		else:
			bname = building_type
		EventBus.notification_posted.emit("%s completed on %s" % [bname, current_planet.planet_name], "build")


func _refresh() -> void:
	if current_planet == null:
		return

	_title_label.text = current_planet.planet_name

	_refresh_info()
	_refresh_explore()
	_refresh_buildings()
	_refresh_queue()
	_refresh_build_menu()
	_refresh_units()


func _refresh_tick() -> void:
	## Called on tick — updates dynamic sections and build affordability
	## without rebuilding the build menu (preserves SpinBox focus).
	if current_planet == null:
		return

	_title_label.text = current_planet.planet_name

	_refresh_info()
	_refresh_explore()
	_refresh_buildings()
	_refresh_queue()
	_update_build_affordability()
	_refresh_units()


func _update_build_affordability() -> void:
	## Update SpinBox max values and warning visibility in-place.
	var player := GalaxyData.get_player_empire()
	if player == null:
		return
	var construction_science := player.get_science_percent("construction")
	for entry in _build_spin_boxes:
		var spin: SpinBox = entry["spin"]
		var warn: Label = entry["warn"]
		var btype: String = entry["building_type"]
		var cost: Dictionary
		if entry["is_building"]:
			cost = BuildingData.get_build_cost(btype, construction_science, current_planet)
		else:
			var udef := UnitData.get_def(btype)
			cost = udef.get("cost", {})
		var affordable := _max_affordable(player, cost)
		spin.max_value = affordable
		if spin.value > affordable:
			spin.value = affordable
		warn.visible = affordable == 0


func _refresh_info() -> void:
	_clear_section(_info_section)

	var owner_text := "Uncolonized"
	if current_planet.owner_id >= 0:
		var empire := GalaxyData.get_empire(current_planet.owner_id)
		owner_text = empire.empire_name if empire else "Unknown"

	_add_info_row(_info_section, "Owner", owner_text)
	_add_info_row(_info_section, "Size", str(current_planet.size))
	if current_planet.owner_id >= 0:
		_add_info_row(_info_section, "Population", "%d / %d" % [current_planet.population, current_planet.get_max_population()])
		_add_info_row(_info_section, "Buildings", "%d / %d" % [current_planet.get_total_buildings(), current_planet.size])

	if not current_planet.resource_bonuses.is_empty():
		for res: String in current_planet.resource_bonuses:
			_add_info_row(_info_section, "Bonus", "%s x%.1f" % [res.capitalize(), current_planet.resource_bonuses[res]])


func _refresh_explore() -> void:
	_clear_section(_explore_section)

	if current_planet.owner_id >= 0:
		return  # Already colonized, hide explore section

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	# Find nearest player planet with an explorer ship
	var best_planet: Planet = null
	var best_distance := INF
	for p in GalaxyData.get_planets_for_empire(player.id):
		var explorer_count: int = p.units.get("explorer", 0)
		if explorer_count <= 0:
			continue
		var dist := _system_distance(p.system_id, current_planet.system_id)
		if dist < best_distance:
			best_distance = dist
			best_planet = p

	if best_planet == null:
		_add_label(_explore_section, "No explorer ships available", Color(0.5, 0.5, 0.5))
		_add_label(_explore_section, "Build one from an owned planet", Color(0.4, 0.4, 0.5))
		return

	var ticks := GalaxyData.calc_travel_ticks(best_planet.system_id, current_planet.system_id)
	_add_label(_explore_section, "Nearest explorer: %s (%d ticks)" % [best_planet.planet_name, ticks], Color(0.6, 0.8, 0.6))

	var btn := Button.new()
	btn.text = "Send Explorer to Colonize"
	btn.add_theme_font_size_override("font_size", 12)
	var source := best_planet  # capture
	btn.pressed.connect(func() -> void: _send_explorer(source))
	_explore_section.add_child(btn)


func _send_explorer(source_planet: Planet) -> void:
	if current_planet == null or current_planet.owner_id >= 0:
		return
	var player := GalaxyData.get_player_empire()
	if player == null:
		return
	var explorer_count: int = source_planet.units.get("explorer", 0)
	if explorer_count <= 0:
		EventBus.notification_posted.emit("No explorer ship on %s!" % source_planet.planet_name, "warning")
		return

	# Remove explorer from source planet
	source_planet.units["explorer"] = explorer_count - 1

	# Create exploration fleet
	var ticks := GalaxyData.calc_travel_ticks(source_planet.system_id, current_planet.system_id)
	var fleet := Fleet.create(
		GalaxyData.next_fleet_id(),
		player.id,
		{},
		source_planet.system_id,
		current_planet.system_id,
		current_planet.id,
		ticks
	)
	fleet.is_exploration = true
	GalaxyData.fleets.append(fleet)
	EventBus.fleet_launched.emit(fleet)
	EventBus.notification_posted.emit("Explorer sent to %s (%d ticks)" % [current_planet.planet_name, ticks], "explore")
	_refresh()


func _refresh_buildings() -> void:
	_clear_section(_buildings_section)

	if current_planet.owner_id < 0:
		return

	if current_planet.buildings.is_empty():
		_add_label(_buildings_section, "No buildings", Color(0.5, 0.5, 0.5))
		return

	for building_type: String in current_planet.buildings:
		var count: int = current_planet.buildings[building_type]
		if count <= 0:
			continue
		var def := BuildingData.get_def(building_type)
		var bname: String = def.get("name", building_type) if not def.is_empty() else building_type
		_add_info_row(_buildings_section, bname, "x%d" % count)


func _refresh_queue() -> void:
	_clear_section(_queue_section)

	if current_planet.owner_id < 0:
		return

	if current_planet.build_queue.is_empty():
		_add_label(_queue_section, "Empty", Color(0.5, 0.5, 0.5))
		return

	# Group by (type, ticks_remaining)
	var groups: Array[Dictionary] = []  # [{type, name, ticks, count}]
	for i in current_planet.build_queue.size():
		var order: BuildOrder = current_planet.build_queue[i]
		var found := false
		for g in groups:
			if g["type"] == order.building_type and g["ticks"] == order.ticks_remaining:
				g["count"] += 1
				found = true
				break
		if not found:
			var bdef := BuildingData.get_def(order.building_type)
			var udef := UnitData.get_def(order.building_type)
			var bname: String
			if not bdef.is_empty():
				bname = bdef.get("name", order.building_type)
			elif not udef.is_empty():
				bname = udef.get("name", order.building_type)
			else:
				bname = order.building_type
			groups.append({"type": order.building_type, "name": bname, "ticks": order.ticks_remaining, "count": 1})

	for g in groups:
		var count_str := " x%d" % g["count"] if g["count"] > 1 else ""
		_add_info_row(_queue_section, "%s%s" % [g["name"], count_str], "%d ticks" % g["ticks"])


func _refresh_build_menu() -> void:
	_clear_section(_build_menu_section)
	_build_spin_boxes.clear()

	var player := GalaxyData.get_player_empire()
	if player == null or current_planet.owner_id != player.id:
		if current_planet.owner_id >= 0:
			_add_label(_build_menu_section, "Not your planet", Color(0.5, 0.5, 0.5))
		return

	var construction_science := player.get_science_percent("construction")

	# Overbuilding warning
	var ob_mult := BuildingData.get_overbuild_multiplier(current_planet)
	if ob_mult > 1.0:
		_add_label(_build_menu_section, "Overbuilding: x%.2f cost penalty" % ob_mult, Color(1.0, 0.6, 0.2))

	# Buildings
	for building_type: String in BuildingData.DEFS:
		var def: Dictionary = BuildingData.DEFS[building_type]
		var cost := BuildingData.get_build_cost(building_type, construction_science, current_planet)
		var ticks := BuildingData.get_build_ticks(building_type, construction_science)

		var block := VBoxContainer.new()
		block.add_theme_constant_override("separation", 0)
		_build_menu_section.add_child(block)

		var name_lbl := Label.new()
		name_lbl.text = def["name"]
		name_lbl.add_theme_font_size_override("font_size", 11)
		name_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.9))
		block.add_child(name_lbl)

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		block.add_child(row)

		var cost_lbl := Label.new()
		cost_lbl.text = "%s | %dt" % [_format_cost(cost), ticks]
		cost_lbl.add_theme_font_size_override("font_size", 9)
		cost_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.55))
		cost_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(cost_lbl)

		var affordable := _max_affordable(player, cost)

		var spin := SpinBox.new()
		spin.min_value = 0
		spin.max_value = affordable
		spin.value = 0
		spin.custom_minimum_size = Vector2(60, 0)
		spin.add_theme_font_size_override("font_size", 10)
		row.add_child(spin)

		var btn := Button.new()
		btn.text = "Build"
		btn.add_theme_font_size_override("font_size", 10)
		btn.custom_minimum_size = Vector2(42, 0)
		var btype: String = building_type
		var spin_ref := spin
		btn.pressed.connect(func() -> void: _queue_buildings(btype, int(spin_ref.value)))
		row.add_child(btn)

		var warn := Label.new()
		warn.text = "Not enough resources"
		warn.add_theme_font_size_override("font_size", 9)
		warn.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		warn.visible = affordable == 0
		block.add_child(warn)

		_build_spin_boxes.append({"spin": spin, "warn": warn, "building_type": building_type, "is_building": true})

	# Explorer ship build option
	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.3))
	_build_menu_section.add_child(sep)

	var explorer_def: Dictionary = UnitData.get_def("explorer")
	if not explorer_def.is_empty():
		var block := VBoxContainer.new()
		block.add_theme_constant_override("separation", 0)
		_build_menu_section.add_child(block)

		var name_lbl := Label.new()
		name_lbl.text = explorer_def["name"]
		name_lbl.add_theme_font_size_override("font_size", 11)
		name_lbl.add_theme_color_override("font_color", Color(0.4, 0.9, 0.4))
		block.add_child(name_lbl)

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		block.add_child(row)

		var cost_lbl := Label.new()
		cost_lbl.text = "%s | %dt" % [_format_cost(explorer_def["cost"]), explorer_def["build_ticks"]]
		cost_lbl.add_theme_font_size_override("font_size", 9)
		cost_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.55))
		cost_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(cost_lbl)

		var explorer_affordable := _max_affordable(player, explorer_def["cost"])

		var spin := SpinBox.new()
		spin.min_value = 0
		spin.max_value = explorer_affordable
		spin.value = 0
		spin.custom_minimum_size = Vector2(60, 0)
		spin.add_theme_font_size_override("font_size", 10)
		row.add_child(spin)

		var btn := Button.new()
		btn.text = "Build"
		btn.add_theme_font_size_override("font_size", 10)
		btn.custom_minimum_size = Vector2(42, 0)
		var spin_ref := spin
		btn.pressed.connect(func() -> void: _queue_explorers(int(spin_ref.value)))
		row.add_child(btn)

		var warn := Label.new()
		warn.text = "Not enough resources"
		warn.add_theme_font_size_override("font_size", 9)
		warn.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		warn.visible = explorer_affordable == 0
		block.add_child(warn)

		_build_spin_boxes.append({"spin": spin, "warn": warn, "building_type": "explorer", "is_building": false})


func _refresh_units() -> void:
	_clear_section(_units_section)

	if current_planet.owner_id < 0:
		return

	var has_units := false
	for unit_type: String in current_planet.units:
		var count: int = current_planet.units[unit_type]
		if count > 0:
			has_units = true
			var def := UnitData.get_def(unit_type)
			var uname: String = def.get("name", unit_type) if not def.is_empty() else unit_type
			_add_info_row(_units_section, uname, "x%d" % count)

	if not has_units:
		_add_label(_units_section, "No units", Color(0.5, 0.5, 0.5))


func _queue_buildings(building_type: String, count: int) -> void:
	if current_planet == null or count <= 0:
		return
	var player := GalaxyData.get_player_empire()
	if player == null or current_planet.owner_id != player.id:
		return

	var construction_science := player.get_science_percent("construction")
	var ticks := BuildingData.get_build_ticks(building_type, construction_science)

	var built := 0
	for _i in count:
		# Recalculate cost each iteration — overbuilding multiplier increases per building
		var cost := BuildingData.get_build_cost(building_type, construction_science, current_planet)
		if not _can_afford(player, cost):
			break
		# Deduct cost
		for resource: String in cost:
			player.resources[resource] = player.resources.get(resource, 0) - cost[resource]
		var order := BuildOrder.create(building_type, ticks)
		current_planet.build_queue.append(order)
		built += 1

	if built > 0:
		var def := BuildingData.get_def(building_type)
		var bname: String = def.get("name", building_type) if not def.is_empty() else building_type
		EventBus.notification_posted.emit("Queued %d %s on %s" % [built, bname, current_planet.planet_name], "build")
		if built < count:
			EventBus.notification_posted.emit("Could only afford %d of %d" % [built, count], "warning")
	else:
		EventBus.notification_posted.emit("Can't afford that!", "warning")

	EventBus.resources_changed.emit()
	_refresh()


func _queue_explorers(count: int) -> void:
	if current_planet == null or count <= 0:
		return
	var player := GalaxyData.get_player_empire()
	if player == null or current_planet.owner_id != player.id:
		return

	var explorer_def: Dictionary = UnitData.get_def("explorer")
	if explorer_def.is_empty():
		return
	var cost: Dictionary = explorer_def["cost"]
	var ticks: int = explorer_def["build_ticks"]

	var built := 0
	for _i in count:
		if not _can_afford(player, cost):
			break
		for resource: String in cost:
			player.resources[resource] = player.resources.get(resource, 0) - cost[resource]
		var order := BuildOrder.create("explorer", ticks, "unit")
		current_planet.build_queue.append(order)
		built += 1

	if built > 0:
		EventBus.notification_posted.emit("Queued %d Explorer Ship(s) on %s" % [built, current_planet.planet_name], "build")
		if built < count:
			EventBus.notification_posted.emit("Could only afford %d of %d" % [built, count], "warning")
	else:
		EventBus.notification_posted.emit("Can't afford that!", "warning")

	EventBus.resources_changed.emit()
	_refresh()


func _system_distance(sys_a_id: int, sys_b_id: int) -> float:
	var sys_a := GalaxyData.get_system(sys_a_id)
	var sys_b := GalaxyData.get_system(sys_b_id)
	if sys_a == null or sys_b == null:
		return INF
	return sys_a.position.distance_to(sys_b.position)


func _can_afford(empire: Empire, cost: Dictionary) -> bool:
	for resource: String in cost:
		if empire.resources.get(resource, 0) < cost[resource]:
			return false
	return true


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
