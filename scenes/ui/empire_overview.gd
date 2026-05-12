extends PanelContainer
## Empire overview panel: shows all empires' comparative stats.

var _content: VBoxContainer
var _empire_rows: VBoxContainer


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

	# Center on screen
	anchors_preset = Control.PRESET_CENTER
	anchor_left = 0.5
	anchor_right = 0.5
	anchor_top = 0.5
	anchor_bottom = 0.5
	offset_left = -260
	offset_right = 260
	offset_top = -200
	offset_bottom = 200

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)

	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 8)
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_content)

	var title := Label.new()
	title.text = "Empire Overview"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(title)

	# Column headers
	var header := _create_row("Empire", "Planets", "NW", "Military", Color(0.5, 0.6, 0.8))
	_content.add_child(header)

	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.3, 0.4, 0.6, 0.5))
	_content.add_child(sep)

	_empire_rows = VBoxContainer.new()
	_empire_rows.add_theme_constant_override("separation", 4)
	_content.add_child(_empire_rows)

	# Close hint
	var hint := Label.new()
	hint.text = "Press A to close"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_font_size_override("font_size", 10)
	hint.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5))
	_content.add_child(hint)

	visible = false
	EventBus.tick_processed.connect(_on_tick)


func show_overview() -> void:
	_refresh()
	visible = true


func hide_overview() -> void:
	visible = false


func _on_tick(_tick_number: int) -> void:
	if visible:
		_refresh()


func _refresh() -> void:
	for child in _empire_rows.get_children():
		child.queue_free()

	# Sort empires by networth descending
	var sorted_empires: Array[Empire] = []
	for e in GalaxyData.empires:
		sorted_empires.append(e)
	sorted_empires.sort_custom(func(a: Empire, b: Empire) -> bool:
		return GalaxyData.calc_empire_networth(a.id) > GalaxyData.calc_empire_networth(b.id)
	)

	for empire in sorted_empires:
		var planets := GalaxyData.get_planets_for_empire(empire.id)
		var planet_count := planets.size()
		var nw := GalaxyData.calc_empire_networth(empire.id)
		var military := _calc_total_military(empire.id, planets)

		var status_suffix := ""
		if planet_count == 0:
			status_suffix = " [DEAD]"

		var name_text := empire.empire_name + status_suffix
		if empire.is_player:
			name_text += " (You)"

		var color := empire.color if planet_count > 0 else Color(0.4, 0.4, 0.4)
		var row := _create_row(name_text, str(planet_count), _format_number(int(nw)), str(military), color)
		_empire_rows.add_child(row)


func _create_row(col1: String, col2: String, col3: String, col4: String, color: Color) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var lbl1 := Label.new()
	lbl1.text = col1
	lbl1.add_theme_font_size_override("font_size", 12)
	lbl1.add_theme_color_override("font_color", color)
	lbl1.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lbl1.clip_text = true
	row.add_child(lbl1)

	var lbl2 := Label.new()
	lbl2.text = col2
	lbl2.add_theme_font_size_override("font_size", 12)
	lbl2.add_theme_color_override("font_color", color)
	lbl2.custom_minimum_size = Vector2(55, 0)
	lbl2.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(lbl2)

	var lbl3 := Label.new()
	lbl3.text = col3
	lbl3.add_theme_font_size_override("font_size", 12)
	lbl3.add_theme_color_override("font_color", color)
	lbl3.custom_minimum_size = Vector2(65, 0)
	lbl3.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(lbl3)

	var lbl4 := Label.new()
	lbl4.text = col4
	lbl4.add_theme_font_size_override("font_size", 12)
	lbl4.add_theme_color_override("font_color", color)
	lbl4.custom_minimum_size = Vector2(55, 0)
	lbl4.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(lbl4)

	return row


func _calc_total_military(empire_id: int, planets: Array[Planet]) -> int:
	var total := 0
	for p in planets:
		total += p.units.get("soldier", 0)
		total += p.units.get("fighter", 0)
		total += p.units.get("bomber", 0)
		total += p.units.get("droid", 0)
		total += p.units.get("transport", 0)
	for f in GalaxyData.get_fleets_for_empire(empire_id):
		for unit_type in f.units:
			total += f.units[unit_type]
	return total


func _format_number(n: int) -> String:
	if n >= 1000000:
		return "%.1fM" % (float(n) / 1000000.0)
	elif n >= 10000:
		return "%.1fK" % (float(n) / 1000.0)
	return str(n)
