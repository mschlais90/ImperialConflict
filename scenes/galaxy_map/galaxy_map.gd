extends Node2D
## Galaxy map view: shows solar systems as clickable icons on a 2D canvas.
## Supports pan (right-click drag / middle-click drag) and zoom (scroll wheel).

const SCALE_FACTOR: float = 20.0  # Multiplier from galaxy coords to pixel coords
const ZOOM_MIN: float = 0.3
const ZOOM_MAX: float = 3.0
const ZOOM_STEP: float = 0.1

var _camera: Camera2D
var _system_icons: Node2D
var _dragging: bool = false
var _drag_start: Vector2 = Vector2.ZERO

@onready var system_icon_scene: PackedScene = preload("res://scenes/galaxy_map/system_icon.tscn")


func _ready() -> void:
	_camera = Camera2D.new()
	_camera.enabled = true
	_camera.zoom = Vector2(1.0, 1.0)
	add_child(_camera)

	_system_icons = Node2D.new()
	_system_icons.name = "SystemIcons"
	add_child(_system_icons)

	EventBus.game_started.connect(_on_game_started)
	EventBus.tick_processed.connect(_on_tick)


func _on_game_started() -> void:
	# Center camera on player's home system
	var player := GalaxyData.get_player_empire()
	if player:
		var home_sys := GalaxyData.get_system(player.home_system_id)
		if home_sys:
			_camera.position = home_sys.position * SCALE_FACTOR

	_populate_systems()


func _populate_systems() -> void:
	for child in _system_icons.get_children():
		child.queue_free()

	for system in GalaxyData.systems:
		var icon: Node2D = system_icon_scene.instantiate()
		icon.position = system.position * SCALE_FACTOR
		icon.setup(system)
		_system_icons.add_child(icon)


func _on_tick(_tick_number: int) -> void:
	# Update system icon colors based on ownership
	for icon in _system_icons.get_children():
		if icon.has_method("update_ownership"):
			icon.update_ownership()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return

	# Zoom
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom(ZOOM_STEP)
			get_viewport().set_input_as_handled()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom(-ZOOM_STEP)
			get_viewport().set_input_as_handled()
		elif mb.button_index == MOUSE_BUTTON_RIGHT or mb.button_index == MOUSE_BUTTON_MIDDLE:
			if mb.pressed:
				_dragging = true
				_drag_start = mb.position
			else:
				_dragging = false
			get_viewport().set_input_as_handled()

	# Pan
	if event is InputEventMouseMotion and _dragging:
		var motion := event as InputEventMouseMotion
		_camera.position -= motion.relative / _camera.zoom
		get_viewport().set_input_as_handled()


func _zoom(step: float) -> void:
	var new_zoom := clampf(_camera.zoom.x + step, ZOOM_MIN, ZOOM_MAX)
	_camera.zoom = Vector2(new_zoom, new_zoom)


func center_on_system(system: SolarSystem) -> void:
	_camera.position = system.position * SCALE_FACTOR
