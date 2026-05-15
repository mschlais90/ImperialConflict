extends PanelContainer
## Start screen: shown on launch. Player names their empire and starts the game.

signal game_start_requested(empire_name: String)

var _name_input: LineEdit


func _ready() -> void:
	# Full-screen dark overlay
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.02, 0.02, 0.06, 1.0)
	add_theme_stylebox_override("panel", style)

	# Center container
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(center)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 16)
	vbox.custom_minimum_size = Vector2(400, 0)
	center.add_child(vbox)

	# Title
	var title := Label.new()
	title.text = "Imperial Conflict"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 32)
	title.add_theme_color_override("font_color", Color(0.8, 0.85, 1.0))
	vbox.add_child(title)

	# Subtitle
	var subtitle := Label.new()
	subtitle.text = "Rule The Galaxy"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 14)
	subtitle.add_theme_color_override("font_color", Color(0.4, 0.5, 0.7))
	vbox.add_child(subtitle)

	# Spacer
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 20)
	vbox.add_child(spacer)

	# Empire name label
	var name_label := Label.new()
	name_label.text = "Empire Name"
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.add_theme_font_size_override("font_size", 14)
	name_label.add_theme_color_override("font_color", Color(0.6, 0.7, 0.9))
	vbox.add_child(name_label)

	# Empire name input
	_name_input = LineEdit.new()
	_name_input.text = "Player Empire"
	_name_input.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_input.add_theme_font_size_override("font_size", 16)
	_name_input.custom_minimum_size = Vector2(300, 36)
	_name_input.select_all_on_focus = true
	vbox.add_child(_name_input)

	# Spacer
	var spacer2 := Control.new()
	spacer2.custom_minimum_size = Vector2(0, 10)
	vbox.add_child(spacer2)

	# Start button
	var btn := Button.new()
	btn.text = "Start Game"
	btn.add_theme_font_size_override("font_size", 18)
	btn.custom_minimum_size = Vector2(200, 44)
	btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	btn.pressed.connect(_on_start_pressed)
	vbox.add_child(btn)

	# Enter key also starts
	_name_input.text_submitted.connect(func(_text: String) -> void: _on_start_pressed())

	# Focus the name input
	_name_input.call_deferred("grab_focus")


func _on_start_pressed() -> void:
	var empire_name := _name_input.text.strip_edges()
	if empire_name.is_empty():
		empire_name = "Player Empire"
	game_start_requested.emit(empire_name)
	visible = false
