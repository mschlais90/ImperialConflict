extends Node2D
## Clickable planet icon showing name, size, owner color, and building indicator.

var planet: Planet
var _label: Label
var _info_label: Label
var _hover: bool = false

const UNCOLONIZED_COLOR := Color(0.4, 0.4, 0.4, 0.7)
const SELECTED_COLOR := Color(1.0, 1.0, 1.0, 0.9)


func setup(p_planet: Planet) -> void:
	planet = p_planet


func _ready() -> void:
	# Click detection
	var area := Area2D.new()
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 22.0
	shape.shape = circle
	area.add_child(shape)
	area.input_event.connect(_on_input_event)
	area.mouse_entered.connect(_on_mouse_entered)
	area.mouse_exited.connect(_on_mouse_exited)
	add_child(area)

	# Planet name
	_label = Label.new()
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.position = Vector2(-50, 24)
	_label.custom_minimum_size = Vector2(100, 0)
	_label.add_theme_font_size_override("font_size", 11)
	_label.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
	add_child(_label)

	# Size / info label
	_info_label = Label.new()
	_info_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_info_label.position = Vector2(-50, 38)
	_info_label.custom_minimum_size = Vector2(100, 0)
	_info_label.add_theme_font_size_override("font_size", 10)
	_info_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
	add_child(_info_label)

	update_display()


func _draw() -> void:
	if planet == null:
		return

	var color := _get_planet_color()
	var base_radius := _get_radius()
	var radius := base_radius + (2.0 if _hover else 0.0)

	# Planet body
	draw_circle(Vector2.ZERO, radius, color)

	# Inner shading
	draw_circle(Vector2(-radius * 0.2, -radius * 0.2), radius * 0.6, Color(1, 1, 1, 0.15))

	# Building indicator (small dots around planet)
	if planet.get_total_buildings() > 0:
		var dot_count := mini(planet.get_total_buildings() / 2, 8)
		for i in dot_count:
			var angle := float(i) / float(dot_count) * TAU
			var dot_pos := Vector2(cos(angle), sin(angle)) * (radius + 5)
			draw_circle(dot_pos, 2, Color(0.9, 0.9, 0.3, 0.7))

	# Selection ring
	if _hover:
		draw_arc(Vector2.ZERO, radius + 4, 0, TAU, 32, SELECTED_COLOR, 1.5)

	# Resource bonus indicator
	if not planet.resource_bonuses.is_empty():
		draw_circle(Vector2(radius + 3, -radius - 3), 3, Color(0.3, 1.0, 0.5, 0.8))


func update_display() -> void:
	if planet == null:
		return
	_label.text = planet.planet_name
	if planet.owner_id >= 0:
		_info_label.text = "Size: %d | Pop: %d" % [planet.size, planet.population]
	else:
		_info_label.text = "Size: %d | Uncolonized" % planet.size
	queue_redraw()


func _get_planet_color() -> Color:
	if planet.owner_id < 0:
		return UNCOLONIZED_COLOR
	var empire := GalaxyData.get_empire(planet.owner_id)
	if empire:
		return empire.color.darkened(0.2)
	return UNCOLONIZED_COLOR


func _get_radius() -> float:
	# Scale radius by planet size (30-350 -> 10-22 pixels)
	return lerpf(10.0, 22.0, clampf(float(planet.size - 30) / 320.0, 0.0, 1.0))


func _on_input_event(_viewport: Node, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			EventBus.planet_selected.emit(planet)
			get_viewport().set_input_as_handled()


func _on_mouse_entered() -> void:
	_hover = true
	queue_redraw()


func _on_mouse_exited() -> void:
	_hover = false
	queue_redraw()
