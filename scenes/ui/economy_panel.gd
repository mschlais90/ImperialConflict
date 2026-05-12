extends PanelContainer
## Empire-level economy overview showing per-tick resource production
## with expandable breakdowns for each resource.

var _content: VBoxContainer
var _sections: Dictionary = {}  # resource_name -> {summary_label, detail_container, expanded}


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
	offset_left = -280
	offset_right = 280
	offset_top = -250
	offset_bottom = 250

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(scroll)

	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 4)
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_content)

	var title := Label.new()
	title.text = "Economy Overview"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(title)

	var hint := Label.new()
	hint.text = "Click a row to expand details  |  Press E to close"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_font_size_override("font_size", 10)
	hint.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5))
	_content.add_child(hint)

	_add_resource_section("gc", "GC (Income)", Color(1.0, 0.85, 0.2))
	_add_resource_section("food", "Food", Color(0.4, 0.9, 0.4))
	_add_resource_section("iron", "Iron", Color(0.7, 0.7, 0.8))
	_add_resource_section("endurium", "Endurium", Color(0.5, 0.7, 1.0))
	_add_resource_section("octarine", "Octarine", Color(0.8, 0.5, 1.0))
	_add_resource_section("rp", "Research Points", Color(0.9, 0.7, 0.3))

	visible = false
	EventBus.tick_processed.connect(_on_tick)


func _add_resource_section(res_id: String, res_name: String, color: Color) -> void:
	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep)

	# Clickable summary row
	var btn := Button.new()
	btn.flat = true
	btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
	btn.add_theme_font_size_override("font_size", 13)
	btn.add_theme_color_override("font_color", color)
	_content.add_child(btn)

	# Detail container (hidden by default)
	var details := VBoxContainer.new()
	details.add_theme_constant_override("separation", 1)
	details.visible = false
	_content.add_child(details)

	_sections[res_id] = {
		"button": btn,
		"details": details,
		"color": color,
		"name": res_name,
		"expanded": false,
	}

	var rid := res_id
	btn.pressed.connect(func() -> void: _toggle_section(rid))


func _toggle_section(res_id: String) -> void:
	var section: Dictionary = _sections[res_id]
	section["expanded"] = not section["expanded"]
	section["details"].visible = section["expanded"]


func show_economy() -> void:
	_refresh()
	visible = true


func hide_economy() -> void:
	visible = false


func _on_tick(_tick_number: int) -> void:
	if visible:
		_refresh()


func _refresh() -> void:
	var player := GalaxyData.get_player_empire()
	if player == null:
		return
	var planets := GalaxyData.get_planets_for_empire(player.id)

	_refresh_gc(player, planets)
	_refresh_food(player, planets)
	_refresh_iron(player, planets)
	_refresh_endurium(player, planets)
	_refresh_octarine(player, planets)
	_refresh_rp(player, planets)


func _refresh_gc(player: Empire, planets: Array[Planet]) -> void:
	var total_pop := 0
	var total_cf := 0
	var total_tax := 0
	var total_buildings := 0
	var total_units := 0

	for p in planets:
		total_pop += p.population
		total_cf += p.get_building_count("cash_factory")
		total_tax += p.get_building_count("tax_office")
		total_buildings += p.get_total_buildings()
		total_units += p.get_total_units()

	var base_income := 100 + total_pop / 30 + total_cf * 8
	var tax_bonus := 1.0 + 2.0 * float(total_tax) / float(total_buildings + 1)
	var econ_science := player.get_science_percent("economy")
	var econ_mult := 1.0 + econ_science / 100.0
	var gross_income := int(float(base_income) * tax_bonus * econ_mult)
	var upkeep := total_buildings + total_units
	var net := gross_income - upkeep

	var section: Dictionary = _sections["gc"]
	var arrow := "v " if section["expanded"] else "> "
	section["button"].text = "%s%s: %s%d / tick" % [arrow, section["name"], "+" if net >= 0 else "", net]

	var details: VBoxContainer = section["details"]
	_clear(details)
	_add_detail(details, "Base income", "+100", Color(0.6, 0.6, 0.6))
	_add_detail(details, "Population (%d / 30)" % total_pop, "+%d" % (total_pop / 30), Color(0.6, 0.6, 0.6))
	_add_detail(details, "Cash Factories (%d x 8)" % total_cf, "+%d" % (total_cf * 8), Color(0.6, 0.6, 0.6))
	_add_detail(details, "Tax Office bonus (%d offices)" % total_tax, "x%.2f" % tax_bonus, Color(0.7, 0.7, 0.5))
	_add_detail(details, "Economy Science (%.1f%%)" % econ_science, "x%.2f" % econ_mult, Color(0.7, 0.7, 0.5))
	_add_detail(details, "Gross income", "=%d" % gross_income, Color(0.9, 0.85, 0.4))
	_add_detail(details, "Building upkeep (%d x 1)" % total_buildings, "-%d" % total_buildings, Color(1.0, 0.5, 0.5))
	_add_detail(details, "Unit upkeep (%d x 1)" % total_units, "-%d" % total_units, Color(1.0, 0.5, 0.5))
	_add_detail(details, "Net income", "=%d" % net, Color(1.0, 0.85, 0.2))


func _refresh_food(player: Empire, planets: Array[Planet]) -> void:
	var resource_science := player.get_science_percent("resources")
	var resource_mult := 1.0 + resource_science / 100.0

	var production := 0
	var consumption := 0
	var farm_count := 0
	var total_pop := 0
	var total_units_no_droids := 0

	for p in planets:
		var farms := p.get_building_count("farm")
		farm_count += farms
		var bonus: float = p.resource_bonuses.get("food", 1.0)
		production += int(farms * 100 * bonus * resource_mult)
		total_pop += p.population
		total_units_no_droids += p.get_total_units_except_droids()

	consumption = total_pop / 10 + total_units_no_droids
	var decay := int(player.resources.get("food", 0) * 0.005)
	var net := production - consumption - decay

	var section: Dictionary = _sections["food"]
	var arrow := "v " if section["expanded"] else "> "
	section["button"].text = "%s%s: %s%d / tick" % [arrow, section["name"], "+" if net >= 0 else "", net]

	var details: VBoxContainer = section["details"]
	_clear(details)
	_add_detail(details, "Farms (%d x 100)" % farm_count, "+%d" % production, Color(0.5, 0.8, 0.5))
	if resource_science > 0:
		_add_detail(details, "  (incl. Resources Science x%.2f)" % resource_mult, "", Color(0.5, 0.6, 0.5))
	_add_detail(details, "Pop consumption (%d / 10)" % total_pop, "-%d" % (total_pop / 10), Color(1.0, 0.5, 0.5))
	_add_detail(details, "Unit consumption (%d units)" % total_units_no_droids, "-%d" % total_units_no_droids, Color(1.0, 0.5, 0.5))
	_add_detail(details, "Decay (0.5%% of %d)" % player.resources.get("food", 0), "-%d" % decay, Color(0.8, 0.5, 0.5))
	_add_detail(details, "Net food", "=%d" % net, Color(0.4, 0.9, 0.4))


func _refresh_resource(player: Empire, planets: Array[Planet], res_id: String, building_type: String, per_building: int) -> void:
	var resource_science := player.get_science_percent("resources")
	var resource_mult := 1.0 + resource_science / 100.0

	var production := 0
	var building_count := 0

	for p in planets:
		var count := p.get_building_count(building_type)
		building_count += count
		var bonus: float = p.resource_bonuses.get(res_id, 1.0)
		production += int(count * per_building * bonus * resource_mult)

	var decay := int(player.resources.get(res_id, 0) * 0.005)
	var net := production - decay

	var section: Dictionary = _sections[res_id]
	var arrow := "v " if section["expanded"] else "> "
	section["button"].text = "%s%s: %s%d / tick" % [arrow, section["name"], "+" if net >= 0 else "", net]

	var details: VBoxContainer = section["details"]
	_clear(details)
	var bdef := BuildingData.get_def(building_type)
	var bname: String = bdef.get("name", building_type) if not bdef.is_empty() else building_type
	_add_detail(details, "%s (%d x %d)" % [bname, building_count, per_building], "+%d" % production, Color(0.5, 0.7, 0.8))
	if resource_science > 0:
		_add_detail(details, "  (incl. Resources Science x%.2f)" % resource_mult, "", Color(0.5, 0.6, 0.5))
	_add_detail(details, "Decay (0.5%% of %d)" % player.resources.get(res_id, 0), "-%d" % decay, Color(0.8, 0.5, 0.5))
	_add_detail(details, "Net %s" % section["name"], "=%d" % net, Color(section["color"]))


func _refresh_iron(player: Empire, planets: Array[Planet]) -> void:
	_refresh_resource(player, planets, "iron", "mine", 1)


func _refresh_endurium(player: Empire, planets: Array[Planet]) -> void:
	_refresh_resource(player, planets, "endurium", "refinery", 1)


func _refresh_octarine(player: Empire, planets: Array[Planet]) -> void:
	_refresh_resource(player, planets, "octarine", "occult_center", 1)


func _refresh_rp(player: Empire, planets: Array[Planet]) -> void:
	var total_rc := 0
	for p in planets:
		total_rc += p.get_building_count("research_center")
	var rp_per_tick := total_rc * 20

	var section: Dictionary = _sections["rp"]
	var arrow := "v " if section["expanded"] else "> "
	section["button"].text = "%s%s: +%d / tick" % [arrow, section["name"], rp_per_tick]

	var details: VBoxContainer = section["details"]
	_clear(details)
	_add_detail(details, "Research Centers (%d x 20)" % total_rc, "+%d" % rp_per_tick, Color(0.6, 0.6, 0.6))
	for science_id in player.research_allocation:
		var pct: int = player.research_allocation[science_id]
		var rp := int(rp_per_tick * pct / 100.0)
		var sdef: Dictionary = ScienceData.SCIENCES.get(science_id, {})
		var sname: String = sdef.get("name", science_id) if not sdef.is_empty() else science_id
		_add_detail(details, "  %s (%d%%)" % [sname, pct], "+%d RP" % rp, Color(0.6, 0.6, 0.5))


func _add_detail(parent: VBoxContainer, label_text: String, value_text: String, color: Color) -> void:
	var row := HBoxContainer.new()
	parent.add_child(row)

	var lbl := Label.new()
	lbl.text = label_text
	lbl.add_theme_font_size_override("font_size", 10)
	lbl.add_theme_color_override("font_color", color.darkened(0.15))
	lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(lbl)

	if not value_text.is_empty():
		var val := Label.new()
		val.text = value_text
		val.add_theme_font_size_override("font_size", 10)
		val.add_theme_color_override("font_color", color)
		val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		val.custom_minimum_size = Vector2(60, 0)
		row.add_child(val)


func _clear(container: VBoxContainer) -> void:
	for child in container.get_children():
		child.queue_free()
