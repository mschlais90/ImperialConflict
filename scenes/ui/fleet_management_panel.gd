extends PanelContainer
## Fleet Management Panel: overview of all fleets in transit and stationed units,
## with ability to recall fleets to nearest portal.

var _content: VBoxContainer
var _summary_section: VBoxContainer
var _stationed_section: VBoxContainer
var _fleets_section: VBoxContainer


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
	offset_left = -380
	offset_right = 380
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
	title.text = "Fleet Management"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(title)

	# Summary section
	_summary_section = _create_section("Overall Fleet Size")

	# Stationed units section
	_stationed_section = _create_section("Stationed Units by Planet")

	# In-transit fleets section
	_fleets_section = _create_section("Fleets in Transit")

	# Hint
	var hint := Label.new()
	hint.text = "Press F to close"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_font_size_override("font_size", 10)
	hint.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5))
	_content.add_child(hint)

	visible = false
	EventBus.tick_processed.connect(_on_tick)


func show_panel() -> void:
	_refresh()
	visible = true


func hide_panel() -> void:
	visible = false


func _on_tick(_tick_number: int) -> void:
	if visible:
		_refresh()


func _refresh() -> void:
	var player := GalaxyData.get_player_empire()
	if player == null:
		return
	_refresh_summary(player)
	_refresh_stationed(player)
	_refresh_fleets(player)


func _refresh_summary(player: Empire) -> void:
	_clear(_summary_section)

	var player_planets := GalaxyData.get_planets_for_empire(player.id)
	var player_fleets := GalaxyData.get_fleets_for_empire(player.id)

	# Tally all units across planets and fleets
	var totals := {
		"fighter": 0, "bomber": 0, "soldier": 0,
		"droid": 0, "transport": 0,
	}

	for p in player_planets:
		for unit_type: String in totals:
			totals[unit_type] += p.units.get(unit_type, 0)

	var in_transit_totals := totals.duplicate()
	for unit_type: String in in_transit_totals:
		in_transit_totals[unit_type] = 0

	for fleet in player_fleets:
		if fleet.is_exploration:
			continue
		for unit_type: String in totals:
			totals[unit_type] += fleet.units.get(unit_type, 0)
			in_transit_totals[unit_type] += fleet.units.get(unit_type, 0)

	# Header row
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 4)
	_summary_section.add_child(header)
	_add_sized_label(header, "Unit", 90, Color(0.45, 0.5, 0.6), 9)
	_add_sized_label(header, "Stationed", 70, Color(0.45, 0.5, 0.6), 9)
	_add_sized_label(header, "In Transit", 70, Color(0.45, 0.5, 0.6), 9)
	_add_sized_label(header, "Total", 60, Color(0.45, 0.5, 0.6), 9)

	for unit_type: String in totals:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		_summary_section.add_child(row)

		var stationed: int = totals[unit_type] - in_transit_totals[unit_type]
		_add_sized_label(row, unit_type.capitalize(), 90, Color(0.75, 0.75, 0.8), 11)
		_add_sized_label(row, str(stationed), 70, Color(0.6, 0.8, 0.6), 11)
		_add_sized_label(row, str(in_transit_totals[unit_type]), 70, Color(0.8, 0.7, 0.5) if in_transit_totals[unit_type] > 0 else Color(0.5, 0.5, 0.5), 11)
		_add_sized_label(row, str(totals[unit_type]), 60, Color(0.9, 0.9, 1.0), 11)

	# Exploration fleets count
	var explore_count := 0
	for fleet in player_fleets:
		if fleet.is_exploration:
			explore_count += 1
	if explore_count > 0:
		var explore_lbl := Label.new()
		explore_lbl.text = "Exploration fleets en route: %d" % explore_count
		explore_lbl.add_theme_font_size_override("font_size", 10)
		explore_lbl.add_theme_color_override("font_color", Color(0.5, 0.7, 0.9))
		_summary_section.add_child(explore_lbl)


func _refresh_stationed(player: Empire) -> void:
	_clear(_stationed_section)

	var player_planets := GalaxyData.get_planets_for_empire(player.id)

	# Only show planets that have military units
	var planets_with_units: Array[Planet] = []
	for p in player_planets:
		for unit_type: String in ["fighter", "bomber", "soldier", "droid", "transport"]:
			if p.units.get(unit_type, 0) > 0:
				planets_with_units.append(p)
				break

	if planets_with_units.is_empty():
		var lbl := Label.new()
		lbl.text = "No units stationed on any planet"
		lbl.add_theme_font_size_override("font_size", 11)
		lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))
		_stationed_section.add_child(lbl)
		return

	# Sort by system then planet name
	planets_with_units.sort_custom(func(a: Planet, b: Planet) -> bool:
		if a.system_id != b.system_id:
			var sa := GalaxyData.get_system(a.system_id)
			var sb := GalaxyData.get_system(b.system_id)
			var na: String = sa.system_name if sa else ""
			var nb: String = sb.system_name if sb else ""
			return na < nb
		return a.planet_name < b.planet_name
	)

	for p in planets_with_units:
		var block := VBoxContainer.new()
		block.add_theme_constant_override("separation", 0)
		_stationed_section.add_child(block)

		var sys := GalaxyData.get_system(p.system_id)
		var sys_name: String = sys.system_name if sys else "?"
		var portal_tag := " [P]" if p.has_portal else ""

		var name_lbl := Label.new()
		name_lbl.text = "%s (%s)%s" % [p.planet_name, sys_name, portal_tag]
		name_lbl.add_theme_font_size_override("font_size", 11)
		name_lbl.add_theme_color_override("font_color", Color(0.8, 0.6, 1.0) if p.has_portal else Color(0.7, 0.8, 0.9))
		block.add_child(name_lbl)

		var units_text := _format_units(p.units)
		var units_lbl := Label.new()
		units_lbl.text = units_text
		units_lbl.add_theme_font_size_override("font_size", 10)
		units_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.65))
		block.add_child(units_lbl)


func _refresh_fleets(player: Empire) -> void:
	_clear(_fleets_section)

	var player_fleets := GalaxyData.get_fleets_for_empire(player.id)

	if player_fleets.is_empty():
		var lbl := Label.new()
		lbl.text = "No fleets in transit"
		lbl.add_theme_font_size_override("font_size", 11)
		lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))
		_fleets_section.add_child(lbl)
		return

	# Sort by ticks remaining
	var sorted_fleets := player_fleets.duplicate()
	sorted_fleets.sort_custom(func(a: Fleet, b: Fleet) -> bool:
		return a.ticks_remaining < b.ticks_remaining
	)

	# Find portal planets for recall
	var portal_planets: Array[Planet] = []
	for p in GalaxyData.get_planets_for_empire(player.id):
		if p.has_portal:
			portal_planets.append(p)

	for fleet in sorted_fleets:
		var f: Fleet = fleet
		var block := VBoxContainer.new()
		block.add_theme_constant_override("separation", 0)
		_fleets_section.add_child(block)

		var target_planet := GalaxyData.get_planet(f.target_planet_id)
		var target_name: String = target_planet.planet_name if target_planet else "Unknown"
		var target_sys := GalaxyData.get_system(f.target_system_id)
		var target_sys_name: String = target_sys.system_name if target_sys else "?"
		var origin_sys := GalaxyData.get_system(f.origin_system_id)
		var origin_name: String = origin_sys.system_name if origin_sys else "?"

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		block.add_child(row)

		var info_col := VBoxContainer.new()
		info_col.add_theme_constant_override("separation", 0)
		info_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(info_col)

		if f.is_exploration:
			var dest_lbl := Label.new()
			dest_lbl.text = "Exploring -> %s (%s)" % [target_name, target_sys_name]
			dest_lbl.add_theme_font_size_override("font_size", 11)
			dest_lbl.add_theme_color_override("font_color", Color(0.5, 0.7, 0.9))
			info_col.add_child(dest_lbl)
		else:
			var dest_lbl := Label.new()
			dest_lbl.text = "%s -> %s (%s)" % [origin_name, target_name, target_sys_name]
			dest_lbl.add_theme_font_size_override("font_size", 11)
			dest_lbl.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
			info_col.add_child(dest_lbl)

			var units_lbl := Label.new()
			units_lbl.text = _format_units(f.units)
			units_lbl.add_theme_font_size_override("font_size", 10)
			units_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.65))
			info_col.add_child(units_lbl)

		var ticks_lbl := Label.new()
		ticks_lbl.text = "%d tick%s" % [f.ticks_remaining, "" if f.ticks_remaining == 1 else "s"]
		ticks_lbl.add_theme_font_size_override("font_size", 11)
		ticks_lbl.add_theme_color_override("font_color", Color(0.9, 0.8, 0.4))
		ticks_lbl.custom_minimum_size = Vector2(60, 0)
		ticks_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		ticks_lbl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(ticks_lbl)

		# Recall button — only for non-exploration fleets when portals exist
		if not f.is_exploration and not portal_planets.is_empty():
			var nearest_portal: Planet = null
			var nearest_ticks := INF
			for p in portal_planets:
				var ticks := GalaxyData.calc_travel_ticks(f.target_system_id, p.system_id)
				if ticks < nearest_ticks:
					nearest_ticks = ticks
					nearest_portal = p
			if nearest_portal != null:
				var btn := Button.new()
				btn.text = "Recall (%dt)" % int(nearest_ticks + f.ticks_remaining)
				btn.add_theme_font_size_override("font_size", 10)
				btn.custom_minimum_size = Vector2(80, 0)
				btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
				var fleet_ref: Fleet = f
				var portal_ref: Planet = nearest_portal
				btn.pressed.connect(func() -> void: _recall_fleet(fleet_ref, portal_ref))
				row.add_child(btn)


func _recall_fleet(fleet: Fleet, portal: Planet) -> void:
	# Redirect this fleet to the nearest portal planet
	fleet.target_system_id = portal.system_id
	fleet.target_planet_id = portal.id
	fleet.ticks_remaining = GalaxyData.calc_travel_ticks(fleet.origin_system_id, portal.system_id)
	EventBus.notification_posted.emit("Fleet recalled to %s" % portal.planet_name, "fleet")
	_refresh()


func _format_units(units: Dictionary) -> String:
	var parts: Array[String] = []
	var order := ["fighter", "bomber", "soldier", "droid", "transport"]
	var abbrev := {"fighter": "F", "bomber": "B", "soldier": "S", "droid": "D", "transport": "T"}
	for unit_type in order:
		var count: int = units.get(unit_type, 0)
		if count > 0:
			parts.append("%d%s" % [count, abbrev[unit_type]])
	if parts.is_empty():
		return "empty"
	return ", ".join(parts)


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


func _add_sized_label(parent: HBoxContainer, text: String, min_width: float, color: Color, font_size: int) -> void:
	var lbl := Label.new()
	lbl.text = text
	lbl.custom_minimum_size = Vector2(min_width, 0)
	lbl.add_theme_font_size_override("font_size", font_size)
	lbl.add_theme_color_override("font_color", color)
	parent.add_child(lbl)


func _clear(container: VBoxContainer) -> void:
	for child in container.get_children():
		child.queue_free()
