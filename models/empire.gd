class_name Empire
extends Resource
## An empire (player or AI) with resources, research, and state.

@export var id: int = 0
@export var empire_name: String = ""
@export var is_player: bool = false
@export var color: Color = Color.WHITE
@export var home_system_id: int = -1
@export var home_planet_id: int = -1

@export var resources: Dictionary = {
	"gc": 0,
	"food": 0,
	"iron": 0,
	"endurium": 0,
	"octarine": 0,
}

@export var research_points: Dictionary = {
	"military": 0,
	"welfare": 0,
	"economy": 0,
	"construction": 0,
	"resources": 0,
}

# Percentage allocation for new RP (must sum to 100)
@export var research_allocation: Dictionary = {
	"military": 20,
	"welfare": 20,
	"economy": 20,
	"construction": 20,
	"resources": 20,
}


func get_science_percent(science: String) -> float:
	var rp: int = research_points.get(science, 0)
	# Use full networth from GalaxyData if available, fallback to base
	var nw: float = calc_networth_base()
	if GalaxyData and GalaxyData.has_method("calc_empire_networth"):
		nw = GalaxyData.calc_empire_networth(id)
	nw = maxf(nw, 1.0)
	return 100.0 * (1.0 - exp(-float(rp) / (100.0 * nw)))


func calc_networth_base() -> float:
	## Base networth from empire-level data only (planets/buildings/units added by GalaxyData)
	return 1100.0 + float(research_points.get("military", 0) + research_points.get("welfare", 0) + research_points.get("economy", 0) + research_points.get("construction", 0) + research_points.get("resources", 0)) / 1000.0


static func create(p_id: int, p_name: String, p_is_player: bool, p_color: Color) -> Empire:
	var empire := Empire.new()
	empire.id = p_id
	empire.empire_name = p_name
	empire.is_player = p_is_player
	empire.color = p_color
	return empire
