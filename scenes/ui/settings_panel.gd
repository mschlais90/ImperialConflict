extends PanelContainer
## Settings panel: toggle game settings. Centered overlay.

var _content: VBoxContainer


func _ready() -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.06, 0.12, 0.95)
	style.border_color = Color(0.3, 0.4, 0.6)
	style.set_border_width_all(2)
	style.set_corner_radius_all(4)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	add_theme_stylebox_override("panel", style)

	anchors_preset = Control.PRESET_CENTER
	anchor_left = 0.5
	anchor_right = 0.5
	anchor_top = 0.5
	anchor_bottom = 0.5
	offset_left = -200
	offset_right = 200
	offset_top = -120
	offset_bottom = 120

	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 10)
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(_content)

	# Title
	var title := Label.new()
	title.text = "Settings"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(title)

	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep)

	# Combat popup toggle
	var combat_cb := CheckBox.new()
	combat_cb.text = "Show combat report popups"
	combat_cb.add_theme_font_size_override("font_size", 12)
	combat_cb.add_theme_color_override("font_color", Color(0.8, 0.8, 0.85))
	combat_cb.button_pressed = GameSettings.show_combat_popups
	combat_cb.toggled.connect(func(pressed: bool) -> void:
		GameSettings.show_combat_popups = pressed
	)
	_content.add_child(combat_cb)

	var hint := Label.new()
	hint.text = "When disabled, battles are still recorded in history (H)"
	hint.add_theme_font_size_override("font_size", 9)
	hint.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5))
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD
	_content.add_child(hint)

	var sep2 := HSeparator.new()
	sep2.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep2)

	# Close hint
	var close_hint := Label.new()
	close_hint.text = "Press S to close"
	close_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	close_hint.add_theme_font_size_override("font_size", 10)
	close_hint.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5))
	_content.add_child(close_hint)

	visible = false


func show_settings() -> void:
	visible = true


func hide_settings() -> void:
	visible = false
