extends Control
## Floating notification toasts in the bottom-left corner.
## Fades out after a few seconds.

var _container: VBoxContainer
const MAX_NOTIFICATIONS: int = 5
const DISPLAY_TIME: float = 4.0
const FADE_TIME: float = 1.0

const TYPE_COLORS: Dictionary = {
	"combat": Color(1.0, 0.4, 0.4),
	"explore": Color(0.4, 0.9, 0.4),
	"fleet": Color(0.5, 0.7, 1.0),
	"build": Color(1.0, 0.85, 0.2),
	"warning": Color(1.0, 0.6, 0.2),
	"info": Color(0.7, 0.7, 0.8),
}


func _ready() -> void:
	anchors_preset = Control.PRESET_BOTTOM_LEFT
	anchor_left = 0
	anchor_right = 0
	anchor_top = 1.0
	anchor_bottom = 1.0
	offset_left = 10
	offset_top = -200
	offset_right = 350
	offset_bottom = -40
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_container = VBoxContainer.new()
	_container.add_theme_constant_override("separation", 4)
	_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_container.alignment = BoxContainer.ALIGNMENT_END
	_container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_container)

	EventBus.notification_posted.connect(_on_notification)


func _on_notification(message: String, type: String) -> void:
	var color: Color = TYPE_COLORS.get(type, Color(0.7, 0.7, 0.8))

	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.05, 0.1, 0.9)
	style.border_color = color.darkened(0.3)
	style.border_width_left = 3
	style.set_corner_radius_all(3)
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	panel.add_theme_stylebox_override("panel", style)

	var lbl := Label.new()
	lbl.text = message
	lbl.add_theme_font_size_override("font_size", 11)
	lbl.add_theme_color_override("font_color", color)
	lbl.autowrap_mode = TextServer.AUTOWRAP_WORD
	lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(lbl)

	_container.add_child(panel)

	# Trim old notifications
	while _container.get_child_count() > MAX_NOTIFICATIONS:
		var old := _container.get_child(0)
		_container.remove_child(old)
		old.queue_free()

	# Start fade timer
	var tween := create_tween()
	tween.tween_interval(DISPLAY_TIME)
	tween.tween_property(panel, "modulate:a", 0.0, FADE_TIME)
	tween.tween_callback(panel.queue_free)
