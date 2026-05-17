extends Node2D
## Clickable planet icon showing name, size, owner color, and building indicator.
## Uses a shader for procedural planet visuals based on resource bonuses.

var planet: Planet
var _label: Label
var _info_label: Label
var _hover: bool = false
var _planet_sprite: Sprite2D

const SELECTED_COLOR := Color(1.0, 1.0, 1.0, 0.9)

# Planet type mapping:
# 0=Mars(iron), 1=Earth(food), 2=Uranus(octarine), 3=Venus(endurium),
# 4=Neptune, 5=Jupiter, 6=Pluto, 7=Mercury
const NO_BONUS_TYPES := [4, 5, 6, 7]  # Neptune, Jupiter, Pluto, Mercury

static var _shader: Shader = null
static var _white_texture: ImageTexture = null


func setup(p_planet: Planet) -> void:
	planet = p_planet


func _ready() -> void:
	# Ensure shared resources are loaded
	if _shader == null:
		_shader = load("res://assets/shaders/planet.gdshader")
	if _white_texture == null:
		var img := Image.create(64, 64, false, Image.FORMAT_RGBA8)
		img.fill(Color.WHITE)
		_white_texture = ImageTexture.create_from_image(img)

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

	# Planet sprite with shader
	_planet_sprite = Sprite2D.new()
	_planet_sprite.texture = _white_texture
	var mat := ShaderMaterial.new()
	mat.shader = _shader
	mat.set_shader_parameter("planet_type", _get_planet_type())
	mat.set_shader_parameter("seed_val", _get_seed())
	_planet_sprite.material = mat
	add_child(_planet_sprite)

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

	var radius := _get_radius()

	# Owner ring
	if planet.owner_id >= 0:
		var empire := GalaxyData.get_empire(planet.owner_id)
		if empire:
			draw_arc(Vector2.ZERO, radius + 3, 0, TAU, 32, empire.color, 2.0)

	# Building indicator (small dots around planet)
	if planet.get_total_buildings() > 0:
		var dot_count := mini(planet.get_total_buildings() / 2, 8)
		for i in dot_count:
			var angle := float(i) / float(dot_count) * TAU
			var dot_pos := Vector2(cos(angle), sin(angle)) * (radius + 7)
			draw_circle(dot_pos, 2, Color(0.9, 0.9, 0.3, 0.7))

	# Selection ring
	if _hover:
		draw_arc(Vector2.ZERO, radius + 5, 0, TAU, 32, SELECTED_COLOR, 1.5)

	# Portal indicator
	if planet.has_portal:
		_draw_portal_icon(Vector2(-radius - 6, -radius - 6), Color(0.8, 0.5, 1.0, 0.9))
	elif _has_portal_in_queue():
		_draw_portal_icon(Vector2(-radius - 6, -radius - 6), Color(0.8, 0.5, 1.0, 0.35))


func update_display() -> void:
	if planet == null:
		return
	_label.text = planet.planet_name
	if planet.owner_id >= 0:
		_info_label.text = "Size: %d | Pop: %d" % [planet.size, planet.population]
	else:
		_info_label.text = "Size: %d | Uncolonized" % planet.size

	# Scale sprite to match planet radius
	var radius := _get_radius()
	var diameter := radius * 2.0
	# Texture is 64x64, scale to desired diameter
	var scale_factor := diameter / 64.0
	_planet_sprite.scale = Vector2(scale_factor, scale_factor)

	queue_redraw()


func _get_radius() -> float:
	# Scale radius by planet size (30-350 -> 10-22 pixels)
	return lerpf(10.0, 22.0, clampf(float(planet.size - 30) / 320.0, 0.0, 1.0))


func _get_planet_type() -> int:
	if planet.resource_bonuses.has("iron"):
		return 0  # Mars
	elif planet.resource_bonuses.has("food"):
		return 1  # Earth
	elif planet.resource_bonuses.has("octarine"):
		return 2  # Uranus
	elif planet.resource_bonuses.has("endurium"):
		return 3  # Venus
	else:
		# No bonus — pick from Neptune/Jupiter/Pluto/Mercury based on planet id
		return NO_BONUS_TYPES[planet.id % NO_BONUS_TYPES.size()]


func _get_seed() -> float:
	# Deterministic seed based on planet id for consistent look
	return fmod(float(planet.id) * 7.31, 100.0)


func _draw_portal_icon(center: Vector2, color: Color) -> void:
	var s := 5.0
	var points := PackedVector2Array([
		center + Vector2(0, -s),
		center + Vector2(s, 0),
		center + Vector2(0, s),
		center + Vector2(-s, 0),
	])
	draw_colored_polygon(points, color)


func _has_portal_in_queue() -> bool:
	for order: BuildOrder in planet.build_queue:
		if order.building_type == "portal":
			return true
	return false


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
