extends Node2D
## Clickable icon representing a solar system on the galaxy map.

var system: SolarSystem
var _label: Label
var _hover: bool = false

const BASE_RADIUS: float = 8.0
const HOVER_RADIUS: float = 11.0
const UNCOLONIZED_COLOR := Color(0.5, 0.5, 0.5, 0.6)
const HOME_MARKER_COLOR := Color(1.0, 1.0, 1.0, 0.8)


func setup(p_system: SolarSystem) -> void:
	system = p_system


func _ready() -> void:
	# Click detection area
	var area := Area2D.new()
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 14.0
	shape.shape = circle
	area.add_child(shape)
	area.input_event.connect(_on_input_event)
	area.mouse_entered.connect(_on_mouse_entered)
	area.mouse_exited.connect(_on_mouse_exited)
	add_child(area)

	# Name label
	_label = Label.new()
	_label.text = system.system_name if system else "?"
	_label.position = Vector2(12, -8)
	_label.add_theme_font_size_override("font_size", 11)
	_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.85))
	add_child(_label)


func _draw() -> void:
	var owner_id := GalaxyData.get_system_owner(system.id) if system else -1
	var color := UNCOLONIZED_COLOR
	if owner_id >= 0:
		var empire := GalaxyData.get_empire(owner_id)
		if empire:
			color = empire.color

	var radius := HOVER_RADIUS if _hover else BASE_RADIUS
	# Outer glow
	draw_circle(Vector2.ZERO, radius + 3, Color(color, 0.15))
	# Main circle
	draw_circle(Vector2.ZERO, radius, color)
	# Bright center
	draw_circle(Vector2.ZERO, radius * 0.4, Color(1, 1, 1, 0.6))

	# Home system marker (small ring)
	if system and _is_home_system():
		draw_arc(Vector2.ZERO, radius + 5, 0, TAU, 32, HOME_MARKER_COLOR, 1.5)


func update_ownership() -> void:
	queue_redraw()


func _is_home_system() -> bool:
	for empire in GalaxyData.empires:
		if empire.home_system_id == system.id:
			return true
	return false


func _on_input_event(_viewport: Node, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			EventBus.system_selected.emit(system)
			get_viewport().set_input_as_handled()


func _on_mouse_entered() -> void:
	_hover = true
	queue_redraw()
	_label.add_theme_color_override("font_color", Color.WHITE)


func _on_mouse_exited() -> void:
	_hover = false
	queue_redraw()
	_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.85))
