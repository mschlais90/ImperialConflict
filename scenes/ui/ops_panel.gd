extends PanelContainer
## Operations panel: perform agent ops and wizard spells against enemy empires.

var _scroll: ScrollContainer
var _content: VBoxContainer
var _info_section: VBoxContainer
var _agent_section: VBoxContainer
var _wizard_section: VBoxContainer
var _debuff_section: VBoxContainer

var _target_empire_btn: OptionButton
var _target_planet_btn: OptionButton
var _target_empires: Array[Empire] = []
var _target_planets: Array[Planet] = []


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
	title.text = "Special Operations"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(title)

	_info_section = _create_section("Forces")
	_debuff_section = _create_section("Active Debuffs")

	# Target selection
	var target_sep := HSeparator.new()
	target_sep.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(target_sep)

	var target_header := Label.new()
	target_header.text = "Target"
	target_header.add_theme_font_size_override("font_size", 13)
	target_header.add_theme_color_override("font_color", Color(0.6, 0.7, 0.9))
	_content.add_child(target_header)

	var empire_row := HBoxContainer.new()
	empire_row.add_theme_constant_override("separation", 4)
	_content.add_child(empire_row)

	var empire_lbl := Label.new()
	empire_lbl.text = "Empire:"
	empire_lbl.add_theme_font_size_override("font_size", 11)
	empire_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	empire_row.add_child(empire_lbl)

	_target_empire_btn = OptionButton.new()
	_target_empire_btn.add_theme_font_size_override("font_size", 11)
	_target_empire_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_target_empire_btn.item_selected.connect(_on_empire_selected)
	empire_row.add_child(_target_empire_btn)

	var planet_row := HBoxContainer.new()
	planet_row.add_theme_constant_override("separation", 4)
	_content.add_child(planet_row)

	var planet_lbl := Label.new()
	planet_lbl.text = "Planet:"
	planet_lbl.add_theme_font_size_override("font_size", 11)
	planet_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	planet_row.add_child(planet_lbl)

	_target_planet_btn = OptionButton.new()
	_target_planet_btn.add_theme_font_size_override("font_size", 11)
	_target_planet_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	planet_row.add_child(_target_planet_btn)

	_agent_section = _create_section("Agent Operations")
	_wizard_section = _create_section("Wizard Spells")

	EventBus.tick_processed.connect(_on_tick)
	EventBus.game_started.connect(_on_game_started)


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
	section.add_theme_constant_override("separation", 2)
	_content.add_child(section)
	return section


func _on_game_started() -> void:
	_refresh()


func _on_tick(_tick_number: int) -> void:
	if visible:
		_refresh()


func _on_empire_selected(_idx: int) -> void:
	_refresh_target_planets()
	_refresh_ops()


func _refresh() -> void:
	_refresh_info()
	_refresh_debuffs()
	_refresh_target_empires()
	_refresh_ops()


func _refresh_info() -> void:
	_clear_section(_info_section)

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	var agents := OpsEngine.get_total_agents(player)
	var wizards := OpsEngine.get_total_wizards(player)
	var agent_cost := OpsEngine.get_agent_op_cost(player)
	var spell_cost := OpsEngine.get_spell_cost(player)

	_add_info_row(_info_section, "Agents", str(agents))
	_add_info_row(_info_section, "Wizards", str(wizards))
	_add_info_row(_info_section, "Agent Op Cost", "%d GC" % agent_cost)
	_add_info_row(_info_section, "Spell Cost", "%d Octarine" % spell_cost)

	# Show success chance if target selected
	var target := _get_selected_empire()
	if target:
		var atk_nw := GalaxyData.calc_empire_networth(player.id)
		var def_nw := GalaxyData.calc_empire_networth(target.id)

		if agents > 0:
			var def_agents := OpsEngine.get_total_agents(target)
			var agent_chance := OpsEngine.get_success_chance(agents, def_agents, atk_nw, def_nw)
			_add_info_row(_info_section, "Agent Success", "%.0f%%" % (agent_chance * 100))

		if wizards > 0:
			var def_wizards := OpsEngine.get_total_wizards(target)
			var spell_chance := OpsEngine.get_success_chance(wizards, def_wizards, atk_nw, def_nw)
			_add_info_row(_info_section, "Spell Success", "%.0f%%" % (spell_chance * 100))


func _refresh_debuffs() -> void:
	_clear_section(_debuff_section)

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	if player.debuffs.is_empty():
		_add_label(_debuff_section, "None", Color(0.5, 0.5, 0.5))
		return

	for d in player.debuffs:
		var dtype: String = d["type"]
		var ticks: int = d["ticks_remaining"]
		var text := ""
		match dtype:
			"reduced_food":
				text = "Food -%.0f%% (%d ticks)" % [d["value"] * 100, ticks]
			"portal_disabled":
				var planet := GalaxyData.get_planet(d.get("planet_id", -1))
				var pname: String = planet.planet_name if planet else "Unknown"
				text = "Portal disabled: %s (%d ticks)" % [pname, ticks]
			_:
				text = "%s (%d ticks)" % [dtype, ticks]
		_add_label(_debuff_section, text, Color(1.0, 0.5, 0.3))


func _refresh_target_empires() -> void:
	var prev_selection := _target_empire_btn.selected
	_target_empire_btn.clear()
	_target_empires.clear()

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	for empire in GalaxyData.empires:
		if empire.id == player.id:
			continue
		if GalaxyData.get_planets_for_empire(empire.id).is_empty():
			continue
		_target_empires.append(empire)
		_target_empire_btn.add_item(empire.empire_name)

	if prev_selection >= 0 and prev_selection < _target_empire_btn.item_count:
		_target_empire_btn.selected = prev_selection
	elif _target_empire_btn.item_count > 0:
		_target_empire_btn.selected = 0

	_refresh_target_planets()


func _refresh_target_planets() -> void:
	var prev_selection := _target_planet_btn.selected
	_target_planet_btn.clear()
	_target_planets.clear()

	var target := _get_selected_empire()
	if target == null:
		return

	var planets := GalaxyData.get_planets_for_empire(target.id)
	for p in planets:
		_target_planets.append(p)
		_target_planet_btn.add_item("%s (pop %d)" % [p.planet_name, p.population])

	if prev_selection >= 0 and prev_selection < _target_planet_btn.item_count:
		_target_planet_btn.selected = prev_selection
	elif _target_planet_btn.item_count > 0:
		_target_planet_btn.selected = 0


func _refresh_ops() -> void:
	_clear_section(_agent_section)
	_clear_section(_wizard_section)

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	var target := _get_selected_empire()
	if target == null:
		_add_label(_agent_section, "Select a target empire", Color(0.5, 0.5, 0.5))
		_add_label(_wizard_section, "Select a target empire", Color(0.5, 0.5, 0.5))
		return

	var agent_cost := OpsEngine.get_agent_op_cost(player)
	var can_afford_agent: bool = player.resources.get("gc", 0) >= agent_cost
	var has_agents: bool = OpsEngine.get_total_agents(player) > 0

	# Agent operations
	for op_type: String in OpsEngine.AGENT_OPS:
		var op_def: Dictionary = OpsEngine.AGENT_OPS[op_type]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		_agent_section.add_child(row)

		var btn := Button.new()
		btn.text = op_def["name"]
		btn.add_theme_font_size_override("font_size", 11)
		btn.custom_minimum_size = Vector2(110, 0)
		btn.disabled = not can_afford_agent or not has_agents
		var otype: String = op_type
		btn.pressed.connect(func() -> void: _perform_agent_op(otype))
		row.add_child(btn)

		var desc := Label.new()
		desc.text = op_def["description"]
		desc.add_theme_font_size_override("font_size", 9)
		desc.add_theme_color_override("font_color", Color(0.5, 0.5, 0.55))
		desc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD
		row.add_child(desc)

	if not has_agents:
		_add_label(_agent_section, "Train agents to use operations", Color(0.5, 0.4, 0.4))
	elif not can_afford_agent:
		_add_label(_agent_section, "Need %d GC per operation" % agent_cost, Color(1.0, 0.3, 0.3))

	# Wizard spells
	var spell_cost := OpsEngine.get_spell_cost(player)
	var can_afford_spell: bool = player.resources.get("octarine", 0) >= spell_cost
	var has_wizards: bool = OpsEngine.get_total_wizards(player) > 0

	for spell_type: String in OpsEngine.WIZARD_SPELLS:
		var spell_def: Dictionary = OpsEngine.WIZARD_SPELLS[spell_type]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		_wizard_section.add_child(row)

		var btn := Button.new()
		btn.text = spell_def["name"]
		btn.add_theme_font_size_override("font_size", 11)
		btn.custom_minimum_size = Vector2(110, 0)
		btn.disabled = not can_afford_spell or not has_wizards
		var stype: String = spell_type
		btn.pressed.connect(func() -> void: _perform_spell(stype))
		row.add_child(btn)

		var desc := Label.new()
		desc.text = spell_def["description"]
		desc.add_theme_font_size_override("font_size", 9)
		desc.add_theme_color_override("font_color", Color(0.5, 0.5, 0.55))
		desc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD
		row.add_child(desc)

	if not has_wizards:
		_add_label(_wizard_section, "Train wizards to cast spells", Color(0.5, 0.4, 0.4))
	elif not can_afford_spell:
		_add_label(_wizard_section, "Need %d Octarine per spell" % spell_cost, Color(1.0, 0.3, 0.3))


func _perform_agent_op(op_type: String) -> void:
	var player := GalaxyData.get_player_empire()
	var target := _get_selected_empire()
	if player == null or target == null:
		return

	var target_planet: Planet = null
	var op_def: Dictionary = OpsEngine.AGENT_OPS.get(op_type, {})
	if op_def.get("target", "") == "planet":
		target_planet = _get_selected_planet()
		if target_planet == null:
			EventBus.notification_posted.emit("Select a target planet", "warning")
			return

	var result := OpsEngine.perform_agent_op(op_type, player, target, target_planet)
	var notif_type := "ops" if result["success"] else "warning"
	EventBus.notification_posted.emit(result["message"], notif_type)
	EventBus.operation_performed.emit(result)
	EventBus.resources_changed.emit()
	_refresh()


func _perform_spell(spell_type: String) -> void:
	var player := GalaxyData.get_player_empire()
	var target := _get_selected_empire()
	if player == null or target == null:
		return

	var target_planet: Planet = null
	var spell_def: Dictionary = OpsEngine.WIZARD_SPELLS.get(spell_type, {})
	if spell_def.get("target", "") == "planet":
		target_planet = _get_selected_planet()
		if target_planet == null:
			EventBus.notification_posted.emit("Select a target planet", "warning")
			return

	var result := OpsEngine.perform_spell(spell_type, player, target, target_planet)
	var notif_type := "ops" if result["success"] else "warning"
	EventBus.notification_posted.emit(result["message"], notif_type)
	EventBus.operation_performed.emit(result)
	EventBus.resources_changed.emit()
	_refresh()


func _get_selected_empire() -> Empire:
	var idx := _target_empire_btn.selected
	if idx < 0 or idx >= _target_empires.size():
		return null
	return _target_empires[idx]


func _get_selected_planet() -> Planet:
	var idx := _target_planet_btn.selected
	if idx < 0 or idx >= _target_planets.size():
		return null
	return _target_planets[idx]


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
