extends PanelContainer
## Research panel: shows 5 science categories with allocation sliders and current percentages.

var _content: VBoxContainer
var _sliders: Dictionary = {}  # science_id -> HSlider
var _pct_labels: Dictionary = {}  # science_id -> Label (current science %)
var _rp_labels: Dictionary = {}  # science_id -> Label (total RP)
var _alloc_labels: Dictionary = {}  # science_id -> Label (allocation %)
var _total_label: Label
var _rp_per_tick_label: Label
var _adjusting: bool = false

const SCIENCE_COLORS: Dictionary = {
	"military": Color(1.0, 0.4, 0.4),
	"welfare": Color(0.4, 0.9, 0.4),
	"economy": Color(1.0, 0.85, 0.2),
	"construction": Color(0.5, 0.7, 1.0),
	"resources": Color(0.8, 0.5, 1.0),
}


func _ready() -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.06, 0.12, 0.95)
	style.border_color = Color(0.2, 0.3, 0.5)
	style.border_width_left = 2
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	add_theme_stylebox_override("panel", style)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)

	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 8)
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_content)

	var title := Label.new()
	title.text = "Research"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	_content.add_child(title)

	# RP generation info
	_rp_per_tick_label = Label.new()
	_rp_per_tick_label.add_theme_font_size_override("font_size", 11)
	_rp_per_tick_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	_content.add_child(_rp_per_tick_label)

	# Science categories
	for science_id in ScienceData.SCIENCES:
		_add_science_row(science_id)

	# Allocation total
	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.5))
	_content.add_child(sep)

	_total_label = Label.new()
	_total_label.add_theme_font_size_override("font_size", 12)
	_content.add_child(_total_label)

	EventBus.tick_processed.connect(_on_tick)
	_update_display()


func _add_science_row(science_id: String) -> void:
	var def: Dictionary = ScienceData.SCIENCES[science_id]
	var color: Color = SCIENCE_COLORS.get(science_id, Color.WHITE)

	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color(0.2, 0.3, 0.5, 0.3))
	_content.add_child(sep)

	# Header row: name + current science %
	var header_row := HBoxContainer.new()
	_content.add_child(header_row)

	var name_lbl := Label.new()
	name_lbl.text = def["name"]
	name_lbl.add_theme_font_size_override("font_size", 13)
	name_lbl.add_theme_color_override("font_color", color)
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_child(name_lbl)

	var pct_lbl := Label.new()
	pct_lbl.add_theme_font_size_override("font_size", 13)
	pct_lbl.add_theme_color_override("font_color", color)
	pct_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	pct_lbl.custom_minimum_size = Vector2(60, 0)
	header_row.add_child(pct_lbl)
	_pct_labels[science_id] = pct_lbl

	# Description
	var desc_lbl := Label.new()
	desc_lbl.text = def["description"]
	desc_lbl.add_theme_font_size_override("font_size", 10)
	desc_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))
	desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD
	_content.add_child(desc_lbl)

	# RP total
	var rp_lbl := Label.new()
	rp_lbl.add_theme_font_size_override("font_size", 10)
	rp_lbl.add_theme_color_override("font_color", Color(0.5, 0.55, 0.6))
	_content.add_child(rp_lbl)
	_rp_labels[science_id] = rp_lbl

	# Slider row: slider + allocation %
	var slider_row := HBoxContainer.new()
	slider_row.add_theme_constant_override("separation", 6)
	_content.add_child(slider_row)

	var slider := HSlider.new()
	slider.min_value = 0
	slider.max_value = 100
	slider.step = 5
	slider.value = 20
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.custom_minimum_size = Vector2(150, 0)
	var sid := science_id  # capture
	slider.value_changed.connect(func(val: float) -> void: _on_slider_changed(sid, val))
	slider_row.add_child(slider)
	_sliders[science_id] = slider

	var alloc_lbl := Label.new()
	alloc_lbl.text = "20%"
	alloc_lbl.add_theme_font_size_override("font_size", 12)
	alloc_lbl.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
	alloc_lbl.custom_minimum_size = Vector2(40, 0)
	alloc_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	slider_row.add_child(alloc_lbl)
	_alloc_labels[science_id] = alloc_lbl


func _on_slider_changed(science_id: String, value: float) -> void:
	if _adjusting:
		return

	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	_adjusting = true

	# Set the changed slider value
	player.research_allocation[science_id] = int(value)

	# Calculate total of all sliders
	var total := 0
	for sid in player.research_allocation:
		total += player.research_allocation[sid]

	# If total != 100, redistribute the difference among other sliders
	if total != 100:
		var diff := total - 100
		var others: Array[String] = []
		for sid in player.research_allocation:
			if sid != science_id:
				others.append(sid)

		# Distribute diff proportionally among others
		var remaining_diff := diff
		for i in others.size():
			var sid: String = others[i]
			var current: int = player.research_allocation[sid]
			var share: int
			if i == others.size() - 1:
				share = remaining_diff  # Last one absorbs rounding
			else:
				share = int(float(diff) * float(current) / maxf(float(total - int(value)), 1.0))
			var new_val := maxi(current - share, 0)
			remaining_diff -= (current - new_val)
			player.research_allocation[sid] = new_val

	# Update all slider positions and labels
	for sid in _sliders:
		var slider: HSlider = _sliders[sid]
		slider.set_value_no_signal(float(player.research_allocation[sid]))
		_alloc_labels[sid].text = "%d%%" % player.research_allocation[sid]

	_update_total_label()
	_adjusting = false


func _on_tick(_tick_number: int) -> void:
	_update_display()


func _update_display() -> void:
	var player := GalaxyData.get_player_empire()
	if player == null:
		return

	# RP per tick info
	var total_rc := 0
	for p in GalaxyData.get_planets_for_empire(player.id):
		total_rc += p.get_building_count("research_center")
	var rp_per_tick := total_rc * 20
	_rp_per_tick_label.text = "Research Centers: %d | RP/tick: %d" % [total_rc, rp_per_tick]

	for science_id in ScienceData.SCIENCES:
		var pct := player.get_science_percent(science_id)
		_pct_labels[science_id].text = "%.1f%%" % pct

		var rp: int = player.research_points.get(science_id, 0)
		_rp_labels[science_id].text = "Total RP: %d" % rp

		if not _adjusting:
			var alloc: int = player.research_allocation.get(science_id, 0)
			_sliders[science_id].set_value_no_signal(float(alloc))
			_alloc_labels[science_id].text = "%d%%" % alloc

	_update_total_label()


func _update_total_label() -> void:
	var player := GalaxyData.get_player_empire()
	if player == null:
		return
	var total := 0
	for sid in player.research_allocation:
		total += player.research_allocation[sid]
	_total_label.text = "Total allocation: %d%%" % total
	if total == 100:
		_total_label.add_theme_color_override("font_color", Color(0.5, 0.8, 0.5))
	else:
		_total_label.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4))
