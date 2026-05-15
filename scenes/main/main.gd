extends Control
## Root scene: orchestrates map views and UI panels.

var _galaxy_map: Node2D
var _system_view: CanvasLayer
var _hud: PanelContainer
var _planet_panel: PanelContainer
var _fleet_panel: PanelContainer
var _research_panel: PanelContainer
var _combat_report: PanelContainer
var _right_panel: TabContainer
var _notification_feed: Control
var _empire_overview: PanelContainer
var _economy_panel: PanelContainer
var _game_over_screen: PanelContainer
var _start_screen: PanelContainer
var _multi_build_panel: PanelContainer
var _ops_panel: PanelContainer
var _settings_panel: PanelContainer
var _battle_history_panel: PanelContainer
var _fleet_management_panel: PanelContainer

const TAB_PLANET := 0
const TAB_FLEET := 1
const TAB_RESEARCH := 2
const TAB_OPS := 3

@onready var galaxy_map_scene: PackedScene = preload("res://scenes/galaxy_map/galaxy_map.tscn")
@onready var system_view_scene: PackedScene = preload("res://scenes/system_view/system_view.tscn")
@onready var hud_scene: PackedScene = preload("res://scenes/ui/hud.tscn")
@onready var planet_panel_scene: PackedScene = preload("res://scenes/ui/planet_panel.tscn")
@onready var fleet_panel_scene: PackedScene = preload("res://scenes/ui/fleet_panel.tscn")
@onready var research_panel_scene: PackedScene = preload("res://scenes/ui/research_panel.tscn")
@onready var combat_report_scene: PackedScene = preload("res://scenes/ui/combat_report.tscn")
@onready var notification_feed_scene: PackedScene = preload("res://scenes/ui/notification_feed.tscn")
@onready var empire_overview_scene: PackedScene = preload("res://scenes/ui/empire_overview.tscn")
@onready var economy_panel_scene: PackedScene = preload("res://scenes/ui/economy_panel.tscn")
@onready var game_over_scene: PackedScene = preload("res://scenes/ui/game_over_screen.tscn")
@onready var start_screen_scene: PackedScene = preload("res://scenes/ui/start_screen.tscn")
@onready var multi_build_scene: PackedScene = preload("res://scenes/ui/multi_build_panel.tscn")
@onready var ops_panel_scene: PackedScene = preload("res://scenes/ui/ops_panel.tscn")
@onready var settings_panel_scene: PackedScene = preload("res://scenes/ui/settings_panel.tscn")
@onready var battle_history_panel_scene: PackedScene = preload("res://scenes/ui/battle_history_panel.tscn")
@onready var fleet_management_scene: PackedScene = preload("res://scenes/ui/fleet_management_panel.tscn")


func _ready() -> void:
	# Set background color
	RenderingServer.set_default_clear_color(Color(0.02, 0.02, 0.06))
	# Let mouse events pass through to the Node2D map layer
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	var map_layer: Node2D = $MapLayer

	# Galaxy map
	_galaxy_map = galaxy_map_scene.instantiate()
	map_layer.add_child(_galaxy_map)

	# System view (own CanvasLayer, starts hidden, shown when a system is clicked)
	_system_view = system_view_scene.instantiate()
	add_child(_system_view)

	# UI Layer
	var ui_layer: CanvasLayer = $UILayer

	_hud = hud_scene.instantiate()
	ui_layer.add_child(_hud)

	# Right side tab container for planet/fleet panels
	_right_panel = TabContainer.new()
	_right_panel.anchors_preset = Control.PRESET_RIGHT_WIDE
	_right_panel.anchor_left = 1.0
	_right_panel.anchor_right = 1.0
	_right_panel.anchor_bottom = 1.0
	_right_panel.offset_left = -310
	_right_panel.offset_top = 40
	_right_panel.tab_alignment = TabBar.ALIGNMENT_CENTER
	_right_panel.visible = false

	# Style the tab container
	var tab_style := StyleBoxFlat.new()
	tab_style.bg_color = Color(0.06, 0.06, 0.12, 0.95)
	_right_panel.add_theme_stylebox_override("panel", tab_style)

	_planet_panel = planet_panel_scene.instantiate()
	_planet_panel.name = "Planet"
	# Override anchors since it's inside a TabContainer now
	_planet_panel.anchors_preset = Control.PRESET_FULL_RECT
	_planet_panel.anchor_left = 0
	_planet_panel.offset_left = 0
	_right_panel.add_child(_planet_panel)

	_fleet_panel = fleet_panel_scene.instantiate()
	_fleet_panel.name = "Fleet"
	_fleet_panel.anchors_preset = Control.PRESET_FULL_RECT
	_fleet_panel.anchor_left = 0
	_fleet_panel.offset_left = 0
	_right_panel.add_child(_fleet_panel)

	_research_panel = research_panel_scene.instantiate()
	_research_panel.name = "Research"
	_research_panel.anchors_preset = Control.PRESET_FULL_RECT
	_research_panel.anchor_left = 0
	_research_panel.offset_left = 0
	_right_panel.add_child(_research_panel)

	_ops_panel = ops_panel_scene.instantiate()
	_ops_panel.name = "Ops"
	_ops_panel.anchors_preset = Control.PRESET_FULL_RECT
	_ops_panel.anchor_left = 0
	_ops_panel.offset_left = 0
	_right_panel.add_child(_ops_panel)

	ui_layer.add_child(_right_panel)

	# Combat report popup (centered, above everything)
	_combat_report = combat_report_scene.instantiate()
	ui_layer.add_child(_combat_report)

	# Notification feed (bottom-left toasts)
	_notification_feed = notification_feed_scene.instantiate()
	ui_layer.add_child(_notification_feed)

	# Empire overview (centered popup, toggled with E)
	_empire_overview = empire_overview_scene.instantiate()
	ui_layer.add_child(_empire_overview)

	# Economy panel (centered popup, toggled with E)
	_economy_panel = economy_panel_scene.instantiate()
	ui_layer.add_child(_economy_panel)

	# Multi-planet build panel (centered popup, toggled with B)
	_multi_build_panel = multi_build_scene.instantiate()
	ui_layer.add_child(_multi_build_panel)

	# Settings panel (centered overlay, toggled with S)
	_settings_panel = settings_panel_scene.instantiate()
	ui_layer.add_child(_settings_panel)

	# Battle history panel (centered overlay, toggled with H)
	_battle_history_panel = battle_history_panel_scene.instantiate()
	ui_layer.add_child(_battle_history_panel)

	# Fleet management panel (centered overlay, toggled with F)
	_fleet_management_panel = fleet_management_scene.instantiate()
	ui_layer.add_child(_fleet_management_panel)

	# Game over screen (full overlay)
	_game_over_screen = game_over_scene.instantiate()
	ui_layer.add_child(_game_over_screen)

	# Start screen (full overlay, shown first)
	_start_screen = start_screen_scene.instantiate()
	_start_screen.game_start_requested.connect(_on_game_start_requested)
	ui_layer.add_child(_start_screen)

	# Connect navigation signals
	EventBus.system_selected.connect(_on_system_selected)
	EventBus.selection_cleared.connect(_on_selection_cleared)
	EventBus.planet_selected.connect(_on_planet_selected)
	EventBus.tick_processed.connect(_on_tick_processed)
	EventBus.empire_eliminated.connect(_on_empire_eliminated)


func _on_game_start_requested(empire_name: String) -> void:
	GameManager.new_game(empire_name)


func _on_system_selected(system: Resource) -> void:
	var sys := system as SolarSystem
	if sys == null:
		return
	# Switch to system view
	_galaxy_map.visible = false
	_system_view.show_system(sys)


func _on_selection_cleared() -> void:
	# Return to galaxy map
	_system_view.hide_system()
	_galaxy_map.visible = true
	_right_panel.visible = false


func _on_planet_selected(_planet: Resource) -> void:
	_right_panel.visible = true


func _on_empire_eliminated(empire: Resource) -> void:
	var e := empire as Empire
	if e == null:
		return
	if e.is_player:
		_game_over_screen.show_game_over(false)
	else:
		# Check if all AI eliminated
		var remaining_ai := 0
		for emp in GalaxyData.empires:
			if not emp.is_player and GalaxyData.get_planets_for_empire(emp.id).size() > 0:
				remaining_ai += 1
		if remaining_ai == 0:
			_game_over_screen.show_game_over(true)


func _on_tick_processed(tick_number: int) -> void:
	if tick_number % 50 == 0:
		_print_status(tick_number)


func _print_status(tick_number: int) -> void:
	var player := GalaxyData.get_player_empire()
	if player == null:
		return
	var planet_count := GalaxyData.get_planets_for_empire(player.id).size()
	var nw := GalaxyData.calc_empire_networth(player.id)
	print("[Tick %d] Planets: %d | NW: %.0f | GC: %d | Food: %d | Iron: %d" % [
		tick_number, planet_count, nw,
		player.resources["gc"],
		player.resources["food"],
		player.resources["iron"],
	])


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey:
		var key := event as InputEventKey
		if not key.pressed:
			return
		match key.keycode:
			KEY_ESCAPE:
				if _system_view.visible:
					_on_selection_cleared()
					get_viewport().set_input_as_handled()
			KEY_R:
				# Toggle research panel
				if _right_panel.visible and _right_panel.current_tab == TAB_RESEARCH:
					_right_panel.visible = false
				else:
					_right_panel.visible = true
					_right_panel.current_tab = TAB_RESEARCH
				get_viewport().set_input_as_handled()
			KEY_A:
				# Toggle empire overview
				if _empire_overview.visible:
					_empire_overview.hide_overview()
				else:
					_empire_overview.show_overview()
				get_viewport().set_input_as_handled()
			KEY_E:
				# Toggle economy panel
				if _economy_panel.visible:
					_economy_panel.hide_economy()
				else:
					_economy_panel.show_economy()
				get_viewport().set_input_as_handled()
			KEY_G:
				# Return to galaxy map
				if _system_view.visible:
					_on_selection_cleared()
				get_viewport().set_input_as_handled()
			KEY_B:
				# Toggle multi-planet build panel
				if _multi_build_panel.visible:
					_multi_build_panel.hide_panel()
				else:
					_multi_build_panel.show_panel()
				get_viewport().set_input_as_handled()
			KEY_O:
				# Toggle ops panel
				if _right_panel.visible and _right_panel.current_tab == TAB_OPS:
					_right_panel.visible = false
				else:
					_right_panel.visible = true
					_right_panel.current_tab = TAB_OPS
				get_viewport().set_input_as_handled()
			KEY_S:
				# Toggle settings panel
				if _settings_panel.visible:
					_settings_panel.hide_settings()
				else:
					_settings_panel.show_settings()
				get_viewport().set_input_as_handled()
			KEY_H:
				# Toggle battle history panel
				if _battle_history_panel.visible:
					_battle_history_panel.hide_panel()
				else:
					_battle_history_panel.show_panel()
				get_viewport().set_input_as_handled()
			KEY_F:
				# Toggle fleet management panel
				if _fleet_management_panel.visible:
					_fleet_management_panel.hide_panel()
				else:
					_fleet_management_panel.show_panel()
				get_viewport().set_input_as_handled()
