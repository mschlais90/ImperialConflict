class_name Planet
extends Resource
## A planet within a solar system. Holds buildings, population, and build queue.

@export var id: int = 0
@export var planet_name: String = ""
@export var system_id: int = 0
@export var size: int = 100  # Building capacity
@export var owner_id: int = -1  # -1 = uncolonized
@export var population: int = 0
@export var buildings: Dictionary = {}  # {"mine": 3, "farm": 5, ...}
@export var build_queue: Array[BuildOrder] = []
@export var has_portal: bool = false
@export var resource_bonuses: Dictionary = {}  # {"food": 1.2, "iron": 1.0, ...}

# Units stationed on this planet
@export var units: Dictionary = {
	"fighter": 0,
	"bomber": 0,
	"soldier": 0,
	"droid": 0,
	"transport": 0,
	"agent": 0,
	"wizard": 0,
}


func get_total_buildings() -> int:
	var total := 0
	for count in buildings.values():
		total += count
	return total


func get_total_buildings_including_queue() -> int:
	var total := get_total_buildings()
	for order: BuildOrder in build_queue:
		if order.category == "building":
			total += 1
	return total


func get_building_count(type: String) -> int:
	return buildings.get(type, 0)


func add_building(type: String) -> void:
	buildings[type] = buildings.get(type, 0) + 1
	if type == "portal":
		has_portal = true


func get_max_population() -> int:
	return 40 * size + 650 * get_building_count("living_quarter")


func get_total_units() -> int:
	var total := 0
	for count in units.values():
		total += count
	return total


func get_total_units_except_droids() -> int:
	## Count units that consume food (excludes droids and wizards).
	var total := 0
	for type in units:
		if type != "droid" and type != "wizard":
			total += units[type]
	return total


static func create(p_id: int, p_name: String, p_system_id: int, p_size: int) -> Planet:
	var planet := Planet.new()
	planet.id = p_id
	planet.planet_name = p_name
	planet.system_id = p_system_id
	planet.size = p_size
	return planet
