class_name BuildingData
## Static definitions for all building types.

const DEFS: Dictionary = {
	"mine": {
		"name": "Mining Facility",
		"cost": {"gc": 200, "food": 5, "endurium": 1},
		"build_ticks": 12,
		"production": {"iron": 1},
		"description": "Produces 1 iron per tick.",
	},
	"refinery": {
		"name": "Refinement Station",
		"cost": {"gc": 300, "iron": 20},
		"build_ticks": 12,
		"production": {"endurium": 1},
		"description": "Produces 1 endurium per tick.",
	},
	"occult_center": {
		"name": "Occult Center",
		"cost": {"gc": 400, "iron": 15, "endurium": 4},
		"build_ticks": 12,
		"production": {"octarine": 1},
		"description": "Produces 1 octarine per tick.",
	},
	"farm": {
		"name": "Hydroponic Farm",
		"cost": {"gc": 160, "iron": 3, "endurium": 1},
		"build_ticks": 10,
		"production": {"food": 100},
		"description": "Produces 100 food per tick.",
	},
	"research_center": {
		"name": "Research Center",
		"cost": {"gc": 100, "endurium": 1},
		"build_ticks": 14,
		"production": {"rp": 20},
		"description": "Generates 20 research points per tick.",
	},
	"cash_factory": {
		"name": "Cash Factory",
		"cost": {"gc": 120, "iron": 10, "endurium": 1},
		"build_ticks": 5,
		"production": {},  # Income handled by income formula
		"description": "Adds 8 GC to base income per tick.",
	},
	"tax_office": {
		"name": "Tax Office",
		"cost": {"gc": 200, "iron": 15, "endurium": 1},
		"build_ticks": 14,
		"production": {},  # Income handled by income formula
		"description": "Increases income by 2% per 1% of total buildings.",
	},
	"living_quarter": {
		"name": "Living Quarter",
		"cost": {"gc": 200, "iron": 25, "endurium": 1},
		"build_ticks": 8,
		"production": {},
		"description": "Increases max population by 650.",
	},
	"laser": {
		"name": "Laser Turret",
		"cost": {"gc": 700, "iron": 35, "endurium": 1},
		"build_ticks": 8,
		"production": {},
		"description": "Defense: 10% chance to destroy each attacking bomber, kills 10 units if surviving.",
	},
	"portal": {
		"name": "Portal",
		"cost": {"gc": 2000, "iron": 100, "endurium": 20, "octarine": 10},
		"build_ticks": 40,
		"production": {},
		"description": "Enables instant troop transport between portalled planets.",
	},
}


static func get_def(type: String) -> Dictionary:
	return DEFS.get(type, {})


static func get_build_cost(type: String, construction_science_pct: float = 0.0, planet: Planet = null) -> Dictionary:
	var def := get_def(type)
	if def.is_empty():
		return {}
	var base_cost: Dictionary = def["cost"]
	var result := {}
	var discount := 1.0 / (1.0 + construction_science_pct / 100.0)
	var overbuild := get_overbuild_multiplier(planet)
	for resource in base_cost:
		result[resource] = maxi(int(base_cost[resource] * discount * overbuild), int(base_cost[resource] * 0.5))
	return result


static func get_overbuild_multiplier(planet: Planet = null) -> float:
	if planet == null:
		return 1.0
	var total_buildings := planet.get_total_buildings_including_queue()
	if total_buildings <= planet.size:
		return 1.0
	return float(total_buildings) / float(planet.size)


static func get_build_ticks(type: String, construction_science_pct: float = 0.0) -> int:
	var def := get_def(type)
	if def.is_empty():
		return 0
	var base_ticks: int = def["build_ticks"]
	var discount := 1.0 / (1.0 + construction_science_pct / 100.0)
	return maxi(int(base_ticks * discount), 1)
