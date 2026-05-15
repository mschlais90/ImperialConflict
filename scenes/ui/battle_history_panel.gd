extends PanelContainer
## Battle history panel: shows all battles involving the player.
## Click a battle to view its detailed report.

var _scroll: ScrollContainer
var _content: VBoxContainer
var _list_section: VBoxContainer
var _detail_section: VBoxContainer
var _viewing_detail: bool = false


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
	offset_left = -280
	offset_right = 280
	offset_top = -280
	offset_bottom = 280

	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_scroll)

	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 4)
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_content)

	visible = false


func show_panel() -> void:
	_viewing_detail = false
	_refresh_list()
	visible = true


func hide_panel() -> void:
	visible = false


func _refresh_list() -> void:
	_clear(_content)
	_viewing_detail = false

	# Title
	var title := Label.new()
	title.text = "Battle History"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(title)

	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep)

	if GameSettings.battle_history.is_empty():
		var lbl := Label.new()
		lbl.text = "No battles yet"
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.add_theme_font_size_override("font_size", 12)
		lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))
		_content.add_child(lbl)
	else:
		# Column headers
		var header := HBoxContainer.new()
		header.add_theme_constant_override("separation", 4)
		_content.add_child(header)

		var h_result := Label.new()
		h_result.text = "Result"
		h_result.add_theme_font_size_override("font_size", 9)
		h_result.add_theme_color_override("font_color", Color(0.45, 0.5, 0.6))
		h_result.custom_minimum_size = Vector2(50, 0)
		header.add_child(h_result)

		var h_planet := Label.new()
		h_planet.text = "Planet"
		h_planet.add_theme_font_size_override("font_size", 9)
		h_planet.add_theme_color_override("font_color", Color(0.45, 0.5, 0.6))
		h_planet.custom_minimum_size = Vector2(80, 0)
		header.add_child(h_planet)

		var h_atk := Label.new()
		h_atk.text = "Atk Lost"
		h_atk.add_theme_font_size_override("font_size", 9)
		h_atk.add_theme_color_override("font_color", Color(0.45, 0.5, 0.6))
		h_atk.custom_minimum_size = Vector2(60, 0)
		header.add_child(h_atk)

		var h_def := Label.new()
		h_def.text = "Def Lost"
		h_def.add_theme_font_size_override("font_size", 9)
		h_def.add_theme_color_override("font_color", Color(0.45, 0.5, 0.6))
		h_def.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		header.add_child(h_def)

		for i in GameSettings.battle_history.size():
			var report: Dictionary = GameSettings.battle_history[i]
			_add_battle_row(report, i)

	# Hint
	var sep2 := HSeparator.new()
	sep2.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep2)

	var hint := Label.new()
	hint.text = "Click a battle to view details. Press H to close."
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_font_size_override("font_size", 10)
	hint.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5))
	_content.add_child(hint)


func _add_battle_row(report: Dictionary, index: int) -> void:
	var attacker_won: bool = report.get("attacker_won", false)
	var planet_name: String = report.get("planet_name", "???")
	var attacker_id: int = report.get("attacker_id", -1)
	var defender_id: int = report.get("defender_id", -1)

	var player := GalaxyData.get_player_empire()
	var is_player_attacker := (player and player.id == attacker_id)
	var player_won: bool = (attacker_won == is_player_attacker)

	# Calculate total losses from phases
	var atk_losses := _calc_attacker_losses(report)
	var def_losses := _calc_defender_losses(report)

	var atk_empire := GalaxyData.get_empire(attacker_id)
	var def_empire := GalaxyData.get_empire(defender_id)
	var opponent_name: String
	if is_player_attacker:
		opponent_name = def_empire.empire_name if def_empire else "Unknown"
	else:
		opponent_name = atk_empire.empire_name if atk_empire else "Unknown"

	var btn := Button.new()
	btn.flat = true
	btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
	btn.add_theme_font_size_override("font_size", 10)
	var idx := index
	btn.pressed.connect(func() -> void: _show_detail(idx))
	_content.add_child(btn)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	btn.add_child(row)

	# Result
	var result_lbl := Label.new()
	if player_won:
		result_lbl.text = "WON"
		result_lbl.add_theme_color_override("font_color", Color(0.3, 1.0, 0.3))
	else:
		result_lbl.text = "LOST"
		result_lbl.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	result_lbl.add_theme_font_size_override("font_size", 10)
	result_lbl.custom_minimum_size = Vector2(50, 0)
	result_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(result_lbl)

	# Planet + opponent
	var planet_lbl := Label.new()
	planet_lbl.text = "%s vs %s" % [planet_name, opponent_name]
	planet_lbl.add_theme_font_size_override("font_size", 10)
	planet_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.8))
	planet_lbl.custom_minimum_size = Vector2(80, 0)
	planet_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	planet_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(planet_lbl)

	# Atk losses
	var atk_lbl := Label.new()
	atk_lbl.text = _format_losses(atk_losses)
	atk_lbl.add_theme_font_size_override("font_size", 9)
	atk_lbl.add_theme_color_override("font_color", Color(1.0, 0.5, 0.5))
	atk_lbl.custom_minimum_size = Vector2(60, 0)
	atk_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(atk_lbl)

	# Def losses
	var def_lbl := Label.new()
	def_lbl.text = _format_losses(def_losses)
	def_lbl.add_theme_font_size_override("font_size", 9)
	def_lbl.add_theme_color_override("font_color", Color(1.0, 0.5, 0.5))
	def_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(def_lbl)


func _show_detail(index: int) -> void:
	if index < 0 or index >= GameSettings.battle_history.size():
		return
	var report: Dictionary = GameSettings.battle_history[index]
	_viewing_detail = true
	_clear(_content)
	_build_detail(report)


func _build_detail(report: Dictionary) -> void:
	var attacker_won: bool = report.get("attacker_won", false)
	var planet_name: String = report.get("planet_name", "Unknown")
	var attacker_id: int = report.get("attacker_id", -1)
	var defender_id: int = report.get("defender_id", -1)

	var atk_empire := GalaxyData.get_empire(attacker_id)
	var def_empire := GalaxyData.get_empire(defender_id)
	var atk_name: String = atk_empire.empire_name if atk_empire else "Unknown"
	var def_name: String = def_empire.empire_name if def_empire else "Unknown"

	var player := GalaxyData.get_player_empire()
	var is_player_attacker := (player and player.id == attacker_id)

	# Back button
	var back_btn := Button.new()
	back_btn.text = "< Back to History"
	back_btn.add_theme_font_size_override("font_size", 11)
	back_btn.pressed.connect(func() -> void: _refresh_list())
	_content.add_child(back_btn)

	# Title
	var title := Label.new()
	if is_player_attacker:
		title.text = "VICTORY!" if attacker_won else "DEFEAT!"
	else:
		title.text = "DEFENDED!" if not attacker_won else "PLANET LOST!"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 20)
	if (attacker_won == is_player_attacker):
		title.add_theme_color_override("font_color", Color(0.3, 1.0, 0.3))
	else:
		title.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	_content.add_child(title)

	# Subtitle
	var subtitle := Label.new()
	subtitle.text = "%s attacked %s at %s" % [atk_name, def_name, planet_name]
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 11)
	subtitle.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD
	_content.add_child(subtitle)

	# Loss summary
	var atk_losses := _calc_attacker_losses(report)
	var def_losses := _calc_defender_losses(report)

	_add_separator()
	_add_header("Loss Summary")
	for ut in atk_losses:
		if atk_losses[ut] > 0:
			_add_detail("ATK %s lost" % _unit_name(ut), str(atk_losses[ut]), Color(1.0, 0.5, 0.5))
	for ut in def_losses:
		if def_losses[ut] > 0:
			_add_detail("DEF %s lost" % _unit_name(ut), str(def_losses[ut]), Color(1.0, 0.5, 0.5))

	# Initial forces
	var atk_initial: Dictionary = report.get("attacker_initial", {})
	var def_initial: Dictionary = report.get("defender_initial", {})
	var def_lasers: int = report.get("defender_lasers", 0)

	_add_separator()
	_add_header("Initial Forces")
	for ut in ["fighter", "bomber", "transport", "soldier", "droid"]:
		var a: int = atk_initial.get(ut, 0)
		if a > 0:
			_add_detail("ATK %s" % _unit_name(ut), str(a))
	for ut in ["fighter", "soldier", "droid"]:
		var d: int = def_initial.get(ut, 0)
		if d > 0:
			_add_detail("DEF %s" % _unit_name(ut), str(d))
	if def_lasers > 0:
		_add_detail("DEF Lasers", str(def_lasers))

	# Phase details
	var phases: Array = report.get("phases", [])
	for phase_data in phases:
		_add_phase_section(phase_data)

	# Outcome
	_add_separator()
	var outcome := Label.new()
	if attacker_won:
		outcome.text = "%s captured %s!" % [atk_name, planet_name]
	else:
		outcome.text = "%s defended %s!" % [def_name, planet_name]
	outcome.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	outcome.add_theme_font_size_override("font_size", 13)
	outcome.add_theme_color_override("font_color", Color(0.9, 0.9, 0.6))
	outcome.autowrap_mode = TextServer.AUTOWRAP_WORD
	_content.add_child(outcome)


func _add_phase_section(phase_data: Dictionary) -> void:
	_add_separator()
	var phase_name: String = phase_data.get("phase", "Unknown Phase")
	_add_header(phase_name)

	match phase_name:
		"Air vs Ground":
			_add_detail("Lasers destroyed", str(phase_data.get("lasers_destroyed", 0)))
			_add_detail("Lasers remaining", str(phase_data.get("remaining_lasers", 0)))
			_add_detail("Bombers lost", str(phase_data.get("bombers_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("Transports lost", str(phase_data.get("transports_lost", 0)), Color(1.0, 0.5, 0.5))
			var stranded: Dictionary = phase_data.get("ground_lost_to_transports", {})
			var s_killed: int = stranded.get("soldiers_killed", 0)
			var d_killed: int = stranded.get("droids_killed", 0)
			if s_killed > 0:
				_add_detail("Soldiers lost (stranded)", str(s_killed), Color(1.0, 0.4, 0.4))
			if d_killed > 0:
				_add_detail("Droids lost (stranded)", str(d_killed), Color(1.0, 0.4, 0.4))
		"Air vs Air":
			_add_detail("ATK fighters lost", str(phase_data.get("atk_fighters_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("DEF fighters lost", str(phase_data.get("def_fighters_lost", 0)), Color(1.0, 0.5, 0.5))
			var trans_lost: int = phase_data.get("transports_lost_to_fighters", 0)
			if trans_lost > 0:
				_add_detail("Transports shot down", str(trans_lost), Color(1.0, 0.4, 0.4))
			var stranded: Dictionary = phase_data.get("ground_lost_to_transports", {})
			var s_killed: int = stranded.get("soldiers_killed", 0)
			var d_killed: int = stranded.get("droids_killed", 0)
			if s_killed > 0:
				_add_detail("Soldiers lost (stranded)", str(s_killed), Color(1.0, 0.4, 0.4))
			if d_killed > 0:
				_add_detail("Droids lost (stranded)", str(d_killed), Color(1.0, 0.4, 0.4))
		"Ground vs Ground":
			_add_detail("ATK ground power", str(phase_data.get("atk_power", 0)))
			_add_detail("DEF ground power", str(phase_data.get("def_power", 0)))
			_add_detail("ATK soldiers lost", str(phase_data.get("atk_soldiers_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("ATK droids lost", str(phase_data.get("atk_droids_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("DEF soldiers lost", str(phase_data.get("def_soldiers_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("DEF droids lost", str(phase_data.get("def_droids_lost", 0)), Color(1.0, 0.5, 0.5))

			var won: bool = phase_data.get("attacker_won", false)
			var result_lbl := Label.new()
			result_lbl.text = "Attacker wins!" if won else "Defender holds!"
			result_lbl.add_theme_font_size_override("font_size", 11)
			result_lbl.add_theme_color_override("font_color", Color(0.3, 1.0, 0.3) if won else Color(1.0, 0.6, 0.3))
			_content.add_child(result_lbl)


func _calc_attacker_losses(report: Dictionary) -> Dictionary:
	var losses := {"fighter": 0, "bomber": 0, "transport": 0, "soldier": 0, "droid": 0}
	var phases: Array = report.get("phases", [])
	for p in phases:
		var phase_name: String = p.get("phase", "")
		match phase_name:
			"Air vs Ground":
				losses["bomber"] += p.get("bombers_lost", 0)
				losses["transport"] += p.get("transports_lost", 0)
				var stranded: Dictionary = p.get("ground_lost_to_transports", {})
				losses["soldier"] += stranded.get("soldiers_killed", 0)
				losses["droid"] += stranded.get("droids_killed", 0)
			"Air vs Air":
				losses["fighter"] += p.get("atk_fighters_lost", 0)
				losses["transport"] += p.get("transports_lost_to_fighters", 0)
				var stranded: Dictionary = p.get("ground_lost_to_transports", {})
				losses["soldier"] += stranded.get("soldiers_killed", 0)
				losses["droid"] += stranded.get("droids_killed", 0)
			"Ground vs Ground":
				losses["soldier"] += p.get("atk_soldiers_lost", 0)
				losses["droid"] += p.get("atk_droids_lost", 0)
	return losses


func _calc_defender_losses(report: Dictionary) -> Dictionary:
	var losses := {"fighter": 0, "soldier": 0, "droid": 0}
	var phases: Array = report.get("phases", [])
	for p in phases:
		var phase_name: String = p.get("phase", "")
		match phase_name:
			"Air vs Air":
				losses["fighter"] += p.get("def_fighters_lost", 0)
			"Ground vs Ground":
				losses["soldier"] += p.get("def_soldiers_lost", 0)
				losses["droid"] += p.get("def_droids_lost", 0)
	return losses


func _format_losses(losses: Dictionary) -> String:
	var parts: Array[String] = []
	for ut in losses:
		if losses[ut] > 0:
			parts.append("%d%s" % [losses[ut], ut.substr(0, 1).to_upper()])
	if parts.is_empty():
		return "0"
	return ", ".join(parts)


func _unit_name(ut: String) -> String:
	var def := UnitData.get_def(ut)
	return def.get("name", ut) if not def.is_empty() else ut


func _add_header(text: String) -> void:
	var lbl := Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", 13)
	lbl.add_theme_color_override("font_color", Color(0.6, 0.7, 0.9))
	_content.add_child(lbl)


func _add_detail(label_text: String, value_text: String, value_color: Color = Color(0.9, 0.9, 0.9)) -> void:
	var row := HBoxContainer.new()
	_content.add_child(row)

	var lbl := Label.new()
	lbl.text = label_text
	lbl.add_theme_font_size_override("font_size", 10)
	lbl.add_theme_color_override("font_color", Color(0.65, 0.65, 0.65))
	lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(lbl)

	var val := Label.new()
	val.text = value_text
	val.add_theme_font_size_override("font_size", 10)
	val.add_theme_color_override("font_color", value_color)
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(val)


func _add_separator() -> void:
	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.3, 0.2, 0.4, 0.5))
	_content.add_child(sep)


func _clear(container: Control) -> void:
	for child in container.get_children():
		child.queue_free()
