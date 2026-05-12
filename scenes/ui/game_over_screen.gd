extends PanelContainer
## Full-screen game over overlay showing victory or defeat.

var _title: Label
var _subtitle: Label
var _stats_container: VBoxContainer


func _ready() -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.02, 0.02, 0.05, 0.92)
	style.border_color = Color(0.3, 0.3, 0.5)
	style.set_border_width_all(2)
	style.content_margin_left = 40
	style.content_margin_right = 40
	style.content_margin_top = 40
	style.content_margin_bottom = 40
	add_theme_stylebox_override("panel", style)

	anchors_preset = Control.PRESET_FULL_RECT
	anchor_right = 1.0
	anchor_bottom = 1.0

	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(center)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 16)
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_child(vbox)

	_title = Label.new()
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_font_size_override("font_size", 42)
	vbox.add_child(_title)

	_subtitle = Label.new()
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_subtitle.add_theme_font_size_override("font_size", 16)
	_subtitle.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	vbox.add_child(_subtitle)

	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.3, 0.3, 0.5, 0.5))
	sep.custom_minimum_size = Vector2(300, 0)
	vbox.add_child(sep)

	_stats_container = VBoxContainer.new()
	_stats_container.add_theme_constant_override("separation", 6)
	vbox.add_child(_stats_container)

	var sep2 := HSeparator.new()
	sep2.add_theme_color_override("separator", Color(0.3, 0.3, 0.5, 0.5))
	sep2.custom_minimum_size = Vector2(300, 0)
	vbox.add_child(sep2)

	var hint := Label.new()
	hint.text = "Game Over"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_font_size_override("font_size", 12)
	hint.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5))
	vbox.add_child(hint)

	visible = false


func show_game_over(player_won: bool) -> void:
	if player_won:
		_title.text = "VICTORY"
		_title.add_theme_color_override("font_color", Color(0.3, 1.0, 0.3))
		_subtitle.text = "You have conquered the galaxy!"
	else:
		_title.text = "DEFEAT"
		_title.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		_subtitle.text = "Your empire has fallen."

	_build_stats()
	visible = true


func _build_stats() -> void:
	for child in _stats_container.get_children():
		child.queue_free()

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	_add_stat("Final Tick", str(TickEngine.current_tick))
	_add_stat("Planets Held", str(GalaxyData.get_planets_for_empire(player.id).size()))
	_add_stat("Networth", _format_number(int(GalaxyData.calc_empire_networth(player.id))))

	# Show surviving empires
	var surviving := 0
	for e in GalaxyData.empires:
		if GalaxyData.get_planets_for_empire(e.id).size() > 0:
			surviving += 1
	_add_stat("Empires Remaining", str(surviving))


func _add_stat(label_text: String, value_text: String) -> void:
	var row := HBoxContainer.new()
	_stats_container.add_child(row)

	var lbl := Label.new()
	lbl.text = label_text
	lbl.add_theme_font_size_override("font_size", 14)
	lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(lbl)

	var val := Label.new()
	val.text = value_text
	val.add_theme_font_size_override("font_size", 14)
	val.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	val.custom_minimum_size = Vector2(80, 0)
	row.add_child(val)


func _format_number(n: int) -> String:
	if n >= 1000000:
		return "%.1fM" % (float(n) / 1000000.0)
	elif n >= 10000:
		return "%.1fK" % (float(n) / 1000.0)
	return str(n)
