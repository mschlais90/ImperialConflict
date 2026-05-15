extends PanelContainer
## Popup panel showing combat results phase by phase.

var _content: VBoxContainer
var _close_button: Button
var _reports_queue: Array[Dictionary] = []


func _ready() -> void:
	# Style
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.05, 0.1, 0.97)
	style.border_color = Color(0.6, 0.2, 0.2)
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	add_theme_stylebox_override("panel", style)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(420, 0)
	add_child(scroll)

	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 8)
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_content)

	EventBus.battle_resolved.connect(_on_battle_resolved)
	visible = false


func _on_battle_resolved(report: Dictionary) -> void:
	# Check if the player is involved
	var player := GalaxyData.get_player_empire()
	if player == null:
		return
	var player_id := player.id
	var attacker_id: int = report.get("attacker_id", -1)
	var defender_id: int = report.get("defender_id", -1)

	if attacker_id != player_id and defender_id != player_id:
		return  # AI vs AI - skip

	# Always save to history
	GameSettings.add_battle_report(report)

	# Only show popup if setting enabled
	if not GameSettings.show_combat_popups:
		return

	_reports_queue.append(report)
	if not visible:
		_show_next_report()


func _show_next_report() -> void:
	if _reports_queue.is_empty():
		visible = false
		return

	var report: Dictionary = _reports_queue.pop_front()
	_build_report_ui(report)
	visible = true

	# Pause the game while viewing combat report
	TickEngine.set_speed(TickEngine.Speed.PAUSED)


func _build_report_ui(report: Dictionary) -> void:
	_clear_content()

	var attacker_won: bool = report.get("attacker_won", false)
	var planet_name: String = report.get("planet_name", "Unknown")
	var attacker_id: int = report.get("attacker_id", -1)
	var defender_id: int = report.get("defender_id", -1)
	var player := GalaxyData.get_player_empire()
	var is_player_attacker := (player and player.id == attacker_id)

	# Title
	var title := Label.new()
	if is_player_attacker:
		title.text = "VICTORY!" if attacker_won else "DEFEAT!"
	else:
		title.text = "PLANET UNDER ATTACK!"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 22)
	if attacker_won == is_player_attacker:
		title.add_theme_color_override("font_color", Color(0.3, 1.0, 0.3))
	else:
		title.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	_content.add_child(title)

	# Subtitle
	var subtitle := Label.new()
	var atk_empire := GalaxyData.get_empire(attacker_id)
	var def_empire := GalaxyData.get_empire(defender_id)
	var atk_name: String = atk_empire.empire_name if atk_empire else "Unknown"
	var def_name: String = def_empire.empire_name if def_empire else "Unknown"
	subtitle.text = "%s attacked %s at %s" % [atk_name, def_name, planet_name]
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 12)
	subtitle.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD
	_content.add_child(subtitle)

	# Initial forces summary
	var atk_initial: Dictionary = report.get("attacker_initial", {})
	var def_initial: Dictionary = report.get("defender_initial", {})
	var def_lasers_initial: int = report.get("defender_lasers", 0)

	_add_separator()
	var forces_header := Label.new()
	forces_header.text = "Initial Forces"
	forces_header.add_theme_font_size_override("font_size", 14)
	forces_header.add_theme_color_override("font_color", Color(0.6, 0.7, 0.9))
	_content.add_child(forces_header)

	_add_detail("ATK Fighters", str(atk_initial.get("fighter", 0)))
	_add_detail("ATK Bombers", str(atk_initial.get("bomber", 0)))
	_add_detail("ATK Transports", str(atk_initial.get("transport", 0)))
	_add_detail("ATK Soldiers", str(atk_initial.get("soldier", 0)))
	_add_detail("ATK Droids", str(atk_initial.get("droid", 0)))
	_add_detail("DEF Fighters", str(def_initial.get("fighter", 0)))
	_add_detail("DEF Soldiers", str(def_initial.get("soldier", 0)))
	_add_detail("DEF Droids", str(def_initial.get("droid", 0)))
	if def_lasers_initial > 0:
		_add_detail("DEF Lasers", str(def_lasers_initial))

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
		outcome.text = "%s defended %s successfully!" % [def_name, planet_name]
	outcome.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	outcome.add_theme_font_size_override("font_size", 14)
	outcome.add_theme_color_override("font_color", Color(0.9, 0.9, 0.6))
	outcome.autowrap_mode = TextServer.AUTOWRAP_WORD
	_content.add_child(outcome)

	# Close button
	_close_button = Button.new()
	_close_button.text = "Continue"
	_close_button.custom_minimum_size = Vector2(120, 32)
	_close_button.add_theme_font_size_override("font_size", 14)
	_close_button.pressed.connect(_on_close)

	var btn_container := CenterContainer.new()
	btn_container.add_child(_close_button)
	_content.add_child(btn_container)


func _add_phase_section(phase_data: Dictionary) -> void:
	_add_separator()

	var phase_name: String = phase_data.get("phase", "Unknown Phase")

	var header := Label.new()
	header.text = phase_name
	header.add_theme_font_size_override("font_size", 14)
	header.add_theme_color_override("font_color", Color(0.6, 0.7, 0.9))
	_content.add_child(header)

	match phase_name:
		"Air vs Ground":
			_add_detail("Lasers destroyed", str(phase_data.get("lasers_destroyed", 0)))
			_add_detail("Lasers remaining", str(phase_data.get("remaining_lasers", 0)))
			_add_detail("Bombers lost", str(phase_data.get("bombers_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("Transports lost", str(phase_data.get("transports_lost", 0)), Color(1.0, 0.5, 0.5))
		"Air vs Air":
			_add_detail("Attacker fighters lost", str(phase_data.get("atk_fighters_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("Defender fighters lost", str(phase_data.get("def_fighters_lost", 0)), Color(1.0, 0.5, 0.5))
			var trans_lost: int = phase_data.get("transports_lost_to_fighters", 0)
			if trans_lost > 0:
				_add_detail("Transports shot down", str(trans_lost), Color(1.0, 0.4, 0.4))
		"Ground vs Ground":
			var atk_power: int = phase_data.get("atk_power", 0)
			var def_power: int = phase_data.get("def_power", 0)
			_add_detail("Attacker ground power", str(atk_power))
			_add_detail("Defender ground power", str(def_power))
			_add_detail("Attacker soldiers lost", str(phase_data.get("atk_soldiers_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("Attacker droids lost", str(phase_data.get("atk_droids_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("Defender soldiers lost", str(phase_data.get("def_soldiers_lost", 0)), Color(1.0, 0.5, 0.5))
			_add_detail("Defender droids lost", str(phase_data.get("def_droids_lost", 0)), Color(1.0, 0.5, 0.5))

			var won: bool = phase_data.get("attacker_won", false)
			var result_lbl := Label.new()
			result_lbl.text = "Attacker wins ground battle!" if won else "Defender holds ground!"
			result_lbl.add_theme_font_size_override("font_size", 12)
			result_lbl.add_theme_color_override("font_color", Color(0.3, 1.0, 0.3) if won else Color(1.0, 0.6, 0.3))
			_content.add_child(result_lbl)


func _add_detail(label_text: String, value_text: String, value_color: Color = Color(0.9, 0.9, 0.9)) -> void:
	var row := HBoxContainer.new()
	_content.add_child(row)

	var lbl := Label.new()
	lbl.text = label_text
	lbl.add_theme_font_size_override("font_size", 11)
	lbl.add_theme_color_override("font_color", Color(0.65, 0.65, 0.65))
	lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(lbl)

	var val := Label.new()
	val.text = value_text
	val.add_theme_font_size_override("font_size", 11)
	val.add_theme_color_override("font_color", value_color)
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(val)


func _add_separator() -> void:
	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.3, 0.2, 0.4, 0.5))
	_content.add_child(sep)


func _on_close() -> void:
	visible = false
	TickEngine.set_speed(TickEngine.Speed.NORMAL)
	_show_next_report()


func _clear_content() -> void:
	for child in _content.get_children():
		child.queue_free()
