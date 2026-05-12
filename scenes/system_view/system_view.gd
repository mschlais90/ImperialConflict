extends CanvasLayer
## Zoomed-in view showing planets within a selected solar system.
## Uses its own CanvasLayer so it's independent of the galaxy map camera.

var current_system: SolarSystem = null
var _planet_icons: Node2D
var _bg: ColorRect
var _title_label: Label
var _back_button: Button

@onready var planet_icon_scene: PackedScene = preload("res://scenes/system_view/planet_icon.tscn")


func _ready() -> void:
	layer = 2

	# Dark background
	_bg = ColorRect.new()
	_bg.color = Color(0.02, 0.02, 0.06, 1.0)
	_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_bg)

	_planet_icons = Node2D.new()
	_planet_icons.name = "PlanetIcons"
	add_child(_planet_icons)

	# Title at top center
	_title_label = Label.new()
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_title_label.offset_top = 50
	_title_label.add_theme_font_size_override("font_size", 20)
	_title_label.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_title_label)

	# Back button
	_back_button = Button.new()
	_back_button.text = "< Galaxy Map"
	_back_button.position = Vector2(10, 50)
	_back_button.pressed.connect(_on_back_pressed)
	_back_button.add_theme_font_size_override("font_size", 14)
	add_child(_back_button)

	EventBus.tick_processed.connect(_on_tick)
	visible = false


func show_system(system: SolarSystem) -> void:
	current_system = system
	visible = true
	_title_label.text = "%s System" % system.system_name
	_populate_planets()


func hide_system() -> void:
	current_system = null
	visible = false
	_clear_planets()


func _populate_planets() -> void:
	_clear_planets()
	if current_system == null:
		return

	var sys_planets := GalaxyData.get_planets_in_system(current_system.id)
	var count := sys_planets.size()

	# Layout planets in a grid centered on screen
	var viewport_size := Vector2(
		ProjectSettings.get_setting("display/window/size/viewport_width"),
		ProjectSettings.get_setting("display/window/size/viewport_height")
	)
	var center := viewport_size / 2.0
	var cols := ceili(sqrt(float(count)))
	var rows := ceili(float(count) / cols)
	var spacing := Vector2(130, 110)

	for i in count:
		var row := i / cols
		var col := i % cols
		var row_count := mini(cols, count - row * cols)
		var x_offset := (col - row_count / 2.0 + 0.5) * spacing.x
		var y_offset := (row - rows / 2.0 + 0.5) * spacing.y

		var icon: Node2D = planet_icon_scene.instantiate()
		icon.position = center + Vector2(x_offset, y_offset)
		icon.setup(sys_planets[i])
		_planet_icons.add_child(icon)


func _clear_planets() -> void:
	for child in _planet_icons.get_children():
		child.queue_free()


func _on_tick(_tick_number: int) -> void:
	if visible:
		for icon in _planet_icons.get_children():
			if icon.has_method("update_display"):
				icon.update_display()


func _on_back_pressed() -> void:
	hide_system()
	EventBus.selection_cleared.emit()
