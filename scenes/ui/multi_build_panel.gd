extends PanelContainer
## Multi-planet build panel: select multiple planets, queue buildings on all at once.
## Planets are grouped by system with collapsible headers.

var _content: VBoxContainer
var _planet_list: VBoxContainer
var _selected_label: Label
var _build_section: VBoxContainer
var _build_rows: Array = []  # [{spin: SpinBox, warn: Label, building_type: String}]
var _select_all_cb: CheckBox

# Planet selection state
var _system_groups: Dictionary = {}  # system_id -> {btn: Button, container: VBoxContainer, expanded: bool}
var _planet_checks: Array = []  # [{checkbox: CheckBox, planet: Planet}]


func _ready() -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.06, 0.12, 0.95)
	style.border_color = Color(0.3, 0.4, 0.6)
	style.set_border_width_all(2)
	style.set_corner_radius_all(4)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	add_theme_stylebox_override("panel", style)

	anchors_preset = Control.PRESET_CENTER
	anchor_left = 0.5
	anchor_right = 0.5
	anchor_top = 0.5
	anchor_bottom = 0.5
	offset_left = -350
	offset_right = 350
	offset_top = -300
	offset_bottom = 300

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(scroll)

	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 6)
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_content)

	# Title
	var title := Label.new()
	title.text = "Multi-Planet Build"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(title)

	# Select All checkbox
	_select_all_cb = CheckBox.new()
	_select_all_cb.text = "Select All"
	_select_all_cb.add_theme_font_size_override("font_size", 11)
	_select_all_cb.toggled.connect(_on_select_all_toggled)
	_content.add_child(_select_all_cb)

	# Separator
	var sep1 := HSeparator.new()
	sep1.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep1)

	# Column headers
	var header_row := HBoxContainer.new()
	header_row.add_theme_constant_override("separation", 4)
	_content.add_child(header_row)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(22, 0)
	header_row.add_child(spacer)

	var h_name := Label.new()
	h_name.text = "Planet"
	h_name.add_theme_font_size_override("font_size", 9)
	h_name.add_theme_color_override("font_color", Color(0.45, 0.5, 0.6))
	h_name.custom_minimum_size = Vector2(90, 0)
	header_row.add_child(h_name)

	var h_bldg := Label.new()
	h_bldg.text = "Bldgs"
	h_bldg.add_theme_font_size_override("font_size", 9)
	h_bldg.add_theme_color_override("font_color", Color(0.45, 0.5, 0.6))
	h_bldg.custom_minimum_size = Vector2(55, 0)
	header_row.add_child(h_bldg)

	var h_ob := Label.new()
	h_ob.text = "Over%"
	h_ob.add_theme_font_size_override("font_size", 9)
	h_ob.add_theme_color_override("font_color", Color(0.45, 0.5, 0.6))
	h_ob.custom_minimum_size = Vector2(50, 0)
	header_row.add_child(h_ob)

	var h_icons := Label.new()
	h_icons.text = "Info"
	h_icons.add_theme_font_size_override("font_size", 9)
	h_icons.add_theme_color_override("font_color", Color(0.45, 0.5, 0.6))
	h_icons.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	h_icons.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_child(h_icons)

	# Planet list
	_planet_list = VBoxContainer.new()
	_planet_list.add_theme_constant_override("separation", 1)
	_content.add_child(_planet_list)

	# Separator
	var sep2 := HSeparator.new()
	sep2.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep2)

	# Selected count label
	_selected_label = Label.new()
	_selected_label.text = "Selected: 0 planets"
	_selected_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_selected_label.add_theme_font_size_override("font_size", 12)
	_selected_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	_content.add_child(_selected_label)

	# Build section
	_build_section = VBoxContainer.new()
	_build_section.add_theme_constant_override("separation", 4)
	_content.add_child(_build_section)

	# Hint
	var hint := Label.new()
	hint.text = "Press B to close"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_font_size_override("font_size", 10)
	hint.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5))
	_content.add_child(hint)

	visible = false
	EventBus.tick_processed.connect(_on_tick)


func show_panel() -> void:
	_refresh_planet_list()
	_refresh_build_menu()
	visible = true


func hide_panel() -> void:
	visible = false


func _on_tick(_tick_number: int) -> void:
	if visible:
		_update_planet_labels()
		_update_build_affordability()


# --- Planet List ---

func _refresh_planet_list() -> void:
	_clear(_planet_list)
	_system_groups.clear()
	_planet_checks.clear()

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	var player_planets := GalaxyData.get_planets_for_empire(player.id)
	if player_planets.is_empty():
		var lbl := Label.new()
		lbl.text = "No planets owned"
		lbl.add_theme_font_size_override("font_size", 11)
		lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))
		_planet_list.add_child(lbl)
		return

	# Group planets by system
	var by_system: Dictionary = {}  # system_id -> Array[Planet]
	for p in player_planets:
		if not by_system.has(p.system_id):
			by_system[p.system_id] = []
		by_system[p.system_id].append(p)

	# Sort system IDs by system name
	var system_ids: Array = by_system.keys()
	system_ids.sort_custom(func(a: int, b: int) -> bool:
		var sa := GalaxyData.get_system(a)
		var sb := GalaxyData.get_system(b)
		var na: String = sa.system_name if sa else ""
		var nb: String = sb.system_name if sb else ""
		return na < nb
	)

	for sys_id in system_ids:
		var sys := GalaxyData.get_system(sys_id)
		var sys_planets: Array = by_system[sys_id]
		var sys_name: String = sys.system_name if sys else "Unknown"

		# System header button
		var sys_btn := Button.new()
		sys_btn.flat = true
		sys_btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		sys_btn.add_theme_font_size_override("font_size", 12)
		sys_btn.add_theme_color_override("font_color", Color(0.6, 0.8, 1.0))
		sys_btn.text = "v %s (%d planet%s)" % [sys_name, sys_planets.size(), "" if sys_planets.size() == 1 else "s"]
		_planet_list.add_child(sys_btn)

		# Planet checkboxes container
		var planet_container := VBoxContainer.new()
		planet_container.add_theme_constant_override("separation", 1)
		_planet_list.add_child(planet_container)

		var sid: int = sys_id
		sys_btn.pressed.connect(func() -> void: _toggle_system(sid))

		_system_groups[sys_id] = {
			"btn": sys_btn,
			"container": planet_container,
			"expanded": true,
			"name": sys_name,
			"count": sys_planets.size(),
		}

		# Sort planets by name
		sys_planets.sort_custom(func(a: Planet, b: Planet) -> bool:
			return a.planet_name < b.planet_name
		)

		for planet in sys_planets:
			var p: Planet = planet
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 4)
			planet_container.add_child(row)

			var cb := CheckBox.new()
			cb.text = ""
			cb.custom_minimum_size = Vector2(22, 0)
			cb.toggled.connect(func(_pressed: bool) -> void: _on_selection_changed())
			row.add_child(cb)

			var name_lbl := Label.new()
			name_lbl.text = p.planet_name
			name_lbl.add_theme_font_size_override("font_size", 10)
			name_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.8))
			name_lbl.custom_minimum_size = Vector2(90, 0)
			row.add_child(name_lbl)

			var buildings_lbl := Label.new()
			buildings_lbl.add_theme_font_size_override("font_size", 10)
			buildings_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.65))
			buildings_lbl.custom_minimum_size = Vector2(55, 0)
			row.add_child(buildings_lbl)

			var ob_lbl := Label.new()
			ob_lbl.add_theme_font_size_override("font_size", 10)
			ob_lbl.custom_minimum_size = Vector2(50, 0)
			row.add_child(ob_lbl)

			var icons_lbl := Label.new()
			icons_lbl.add_theme_font_size_override("font_size", 10)
			icons_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			icons_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(icons_lbl)

			_update_planet_row(p, buildings_lbl, ob_lbl, icons_lbl)

			_planet_checks.append({"checkbox": cb, "planet": p, "name_lbl": name_lbl, "buildings_lbl": buildings_lbl, "ob_lbl": ob_lbl, "icons_lbl": icons_lbl})


func _toggle_system(system_id: int) -> void:
	if not _system_groups.has(system_id):
		return
	var group: Dictionary = _system_groups[system_id]
	group["expanded"] = not group["expanded"]
	group["container"].visible = group["expanded"]
	var arrow := "v" if group["expanded"] else ">"
	group["btn"].text = "%s %s (%d planet%s)" % [arrow, group["name"], group["count"], "" if group["count"] == 1 else "s"]


func _update_planet_labels() -> void:
	for entry in _planet_checks:
		var p: Planet = entry["planet"]
		_update_planet_row(p, entry["buildings_lbl"], entry["ob_lbl"], entry["icons_lbl"])


func _update_planet_row(p: Planet, buildings_lbl: Label, ob_lbl: Label, icons_lbl: Label) -> void:
	var total_b := p.get_total_buildings_including_queue()
	buildings_lbl.text = "%d/%d" % [total_b, p.size]

	var ob_mult := BuildingData.get_overbuild_multiplier(p)
	if ob_mult > 1.0:
		var ob_pct := int((ob_mult - 1.0) * 100)
		ob_lbl.text = "+%d%%" % ob_pct
		ob_lbl.add_theme_color_override("font_color", Color(1.0, 0.6, 0.2))
	else:
		ob_lbl.text = ""

	var icons := ""
	if p.has_portal:
		icons += "[P]"
	if p.get_building_count("laser") > 0:
		icons += " [L%d]" % p.get_building_count("laser")
	if not p.resource_bonuses.is_empty():
		for res: String in p.resource_bonuses:
			icons += " %s x%.1f" % [res.capitalize(), p.resource_bonuses[res]]
	icons_lbl.text = icons.strip_edges()
	if p.has_portal:
		icons_lbl.add_theme_color_override("font_color", Color(0.8, 0.5, 1.0))
	elif p.get_building_count("laser") > 0:
		icons_lbl.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4))
	elif not p.resource_bonuses.is_empty():
		icons_lbl.add_theme_color_override("font_color", Color(0.4, 0.9, 0.5))
	else:
		icons_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))


func _on_select_all_toggled(pressed: bool) -> void:
	for entry in _planet_checks:
		var cb: CheckBox = entry["checkbox"]
		cb.button_pressed = pressed
	_on_selection_changed()


func _get_selected_planets() -> Array[Planet]:
	var result: Array[Planet] = []
	for entry in _planet_checks:
		var cb: CheckBox = entry["checkbox"]
		if cb.button_pressed:
			result.append(entry["planet"])
	return result


func _on_selection_changed() -> void:
	var selected := _get_selected_planets()
	_selected_label.text = "Selected: %d planet%s" % [selected.size(), "" if selected.size() == 1 else "s"]
	# Sync the select-all checkbox without re-triggering its signal
	var all_checked := _planet_checks.size() > 0 and selected.size() == _planet_checks.size()
	_select_all_cb.set_pressed_no_signal(all_checked)
	_refresh_build_menu()


# --- Build Menu ---

func _refresh_build_menu() -> void:
	_clear(_build_section)
	_build_rows.clear()

	var selected := _get_selected_planets()
	if selected.is_empty():
		var lbl := Label.new()
		lbl.text = "Select planets above to build"
		lbl.add_theme_font_size_override("font_size", 11)
		lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_build_section.add_child(lbl)
		return

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	var construction_science := player.get_science_percent("construction")
	var num_planets := selected.size()

	for building_type: String in BuildingData.DEFS:
		var def: Dictionary = BuildingData.DEFS[building_type]
		var base_ticks := BuildingData.get_build_ticks(building_type, construction_science)

		# Find worst-case cost (highest overbuild multiplier among selected planets)
		var worst_cost := BuildingData.get_build_cost(building_type, construction_science, selected[0])
		for i in range(1, selected.size()):
			var pcost := BuildingData.get_build_cost(building_type, construction_science, selected[i])
			for res: String in pcost:
				if pcost[res] > worst_cost.get(res, 0):
					worst_cost[res] = pcost[res]

		# Max affordable — portal is special: only 1 per planet, check single cost
		var affordable: int
		if building_type == "portal":
			affordable = 1 if _can_afford(player, worst_cost) else 0
		else:
			affordable = _max_affordable_multi(player, worst_cost, num_planets)

		var block := VBoxContainer.new()
		block.add_theme_constant_override("separation", 0)
		_build_section.add_child(block)

		var name_lbl := Label.new()
		name_lbl.text = def["name"]
		name_lbl.add_theme_font_size_override("font_size", 11)
		name_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.9))
		block.add_child(name_lbl)

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		block.add_child(row)

		var cost_text := "%s | %dt" % [_format_cost(worst_cost), base_ticks]
		if num_planets > 1:
			cost_text += " x%d planets" % num_planets

		var cost_lbl := Label.new()
		cost_lbl.text = cost_text
		cost_lbl.add_theme_font_size_override("font_size", 9)
		cost_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.55))
		cost_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(cost_lbl)

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
		btn.pressed.connect(func() -> void: _queue_on_selected(btype, int(spin_ref.value)))
		row.add_child(btn)

		var warn := Label.new()
		warn.text = "Not enough resources"
		warn.add_theme_font_size_override("font_size", 9)
		warn.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		warn.visible = affordable == 0
		block.add_child(warn)

		_build_rows.append({"spin": spin, "warn": warn, "building_type": building_type})


func _update_build_affordability() -> void:
	var player := GalaxyData.get_player_empire()
	if player == null:
		return
	var selected := _get_selected_planets()
	if selected.is_empty():
		return

	var construction_science := player.get_science_percent("construction")
	var num_planets := selected.size()

	for entry in _build_rows:
		var spin: SpinBox = entry["spin"]
		var warn: Label = entry["warn"]
		var btype: String = entry["building_type"]

		var worst_cost := BuildingData.get_build_cost(btype, construction_science, selected[0])
		for i in range(1, selected.size()):
			var pcost := BuildingData.get_build_cost(btype, construction_science, selected[i])
			for res: String in pcost:
				if pcost[res] > worst_cost.get(res, 0):
					worst_cost[res] = pcost[res]

		var affordable: int
		if btype == "portal":
			affordable = 1 if _can_afford(player, worst_cost) else 0
		else:
			affordable = _max_affordable_multi(player, worst_cost, num_planets)
		spin.max_value = affordable
		if spin.value > affordable:
			spin.value = affordable
		warn.visible = affordable == 0


func _queue_on_selected(building_type: String, count: int) -> void:
	if count <= 0:
		return
	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	var selected := _get_selected_planets()
	if selected.is_empty():
		return

	var construction_science := player.get_science_percent("construction")
	var ticks := BuildingData.get_build_ticks(building_type, construction_science)

	var total_built := 0
	var planets_built := 0

	for planet in selected:
		if planet.owner_id != player.id:
			continue
		# Only 1 portal per planet (built or queued)
		if building_type == "portal" and (planet.has_portal or _has_portal_queued(planet)):
			continue
		var built_on_planet := 0
		var portal_count := count if building_type != "portal" else 1
		for _i in portal_count:
			var cost := BuildingData.get_build_cost(building_type, construction_science, planet)
			if not _can_afford(player, cost):
				break
			for resource: String in cost:
				player.resources[resource] = player.resources.get(resource, 0) - cost[resource]
			var order := BuildOrder.create(building_type, ticks)
			planet.build_queue.append(order)
			built_on_planet += 1
		if built_on_planet > 0:
			total_built += built_on_planet
			planets_built += 1

	if total_built > 0:
		var def := BuildingData.get_def(building_type)
		var bname: String = def.get("name", building_type) if not def.is_empty() else building_type
		EventBus.notification_posted.emit("Queued %d %s across %d planet%s" % [total_built, bname, planets_built, "" if planets_built == 1 else "s"], "build")
		if total_built < count * selected.size():
			EventBus.notification_posted.emit("Ran out of resources for some planets", "warning")
	else:
		EventBus.notification_posted.emit("Can't afford that!", "warning")

	EventBus.resources_changed.emit()
	_update_planet_labels()
	_update_build_affordability()


# --- Helpers ---

func _max_affordable_multi(empire: Empire, cost_per_planet: Dictionary, num_planets: int) -> int:
	if num_planets <= 0:
		return 0
	var max_count := 9999
	for resource: String in cost_per_planet:
		var available: int = empire.resources.get(resource, 0)
		var per_unit: int = cost_per_planet[resource] * num_planets
		if per_unit <= 0:
			continue
		var affordable := available / per_unit
		if affordable < max_count:
			max_count = affordable
	return max_count


func _has_portal_queued(planet: Planet) -> bool:
	for order: BuildOrder in planet.build_queue:
		if order.building_type == "portal":
			return true
	return false


func _can_afford(empire: Empire, cost: Dictionary) -> bool:
	for resource: String in cost:
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


func _clear(container: VBoxContainer) -> void:
	for child in container.get_children():
		child.queue_free()
