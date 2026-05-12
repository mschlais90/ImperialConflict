class_name AIController
extends RefCounted
## Per-empire AI decision maker. Called each tick.
## Uses priority-based decisions: economy -> colonize -> military -> attack.

var empire: Empire

# Tuning constants
const COLONIZE_COST_GC: int = 200
const MIN_ATTACK_TICK: int = 80
const MIN_MILITARY_TICK: int = 40
const BUILD_QUEUE_MAX: int = 3
const MILITARY_THRESHOLD_SOLDIERS: int = 100
const MILITARY_THRESHOLD_TRANSPORTS: int = 2
const ATTACK_STRENGTH_RATIO: float = 1.5  # Attack when we have 1.5x defender's power


static func create(p_empire: Empire) -> AIController:
	var controller := AIController.new()
	controller.empire = p_empire
	return controller


func process_tick(tick_number: int) -> void:
	var planets := GalaxyData.get_planets_for_empire(empire.id)
	if planets.is_empty():
		return

	# 1. Build economy on all planets
	_do_building(planets)

	# 2. Colonize nearby unowned planets
	_do_colonization(planets, tick_number)

	# 3. Build military units
	if tick_number >= MIN_MILITARY_TICK:
		_do_military_production(planets)

	# 4. Attack enemy planets
	if tick_number >= MIN_ATTACK_TICK:
		_do_attack(planets, tick_number)


# --- Building ---

func _do_building(planets: Array[Planet]) -> void:
	for planet in planets:
		if planet.build_queue.size() >= BUILD_QUEUE_MAX:
			continue
		if planet.get_total_buildings() >= planet.size:
			continue

		var building := _choose_building(planet)
		if building.is_empty():
			continue

		var cost: Dictionary = BuildingData.get_def(building)["cost"]
		if _can_afford(cost):
			_deduct_cost(cost)
			var ticks: int = BuildingData.get_def(building)["build_ticks"]
			planet.build_queue.append(BuildOrder.create(building, ticks))


func _choose_building(planet: Planet) -> String:
	# Priority-based building selection
	var total_buildings := planet.get_total_buildings()

	# Early game: need farms for food
	var food_balance := _estimate_food_balance()
	if food_balance < 0:
		return "farm"

	# Need income
	var income := _estimate_income()
	if income < 50:
		return "cash_factory"

	# Need iron for other buildings
	if empire.resources.get("iron", 0) < 50:
		return "mine"

	# Need endurium for everything
	if empire.resources.get("endurium", 0) < 10:
		if empire.resources.get("iron", 0) >= 20:
			return "refinery"
		return "mine"

	# Build up research
	var total_rc := 0
	for p in GalaxyData.get_planets_for_empire(empire.id):
		total_rc += p.get_building_count("research_center")
	if total_rc < 3:
		return "research_center"

	# Living quarters if population is near cap
	if planet.population >= planet.get_max_population() * 0.9:
		return "living_quarter"

	# More cash factories for income
	if planet.get_building_count("cash_factory") < 5:
		return "cash_factory"

	# Defenses on developed planets
	if total_buildings > 15 and planet.get_building_count("laser") < 3:
		return "laser"

	# More farms if food is tight
	if food_balance < 200:
		return "farm"

	# Default: more mines for resources
	return "mine"


# --- Colonization ---

func _do_colonization(planets: Array[Planet], _tick_number: int) -> void:
	# Don't send too many explorers at once
	var exploring_count := 0
	for f in GalaxyData.get_fleets_for_empire(empire.id):
		if f.is_exploration:
			exploring_count += 1
	if exploring_count >= 2:
		return

	# Count explorers being built
	var explorers_building := 0
	for p in planets:
		for order in p.build_queue:
			if order.building_type == "explorer":
				explorers_building += 1

	# Find a planet with an explorer ship
	var source_planet: Planet = null
	for p in planets:
		if p.units.get("explorer", 0) > 0:
			source_planet = p
			break

	# If no explorers available, queue one on strongest planet
	if source_planet == null and explorers_building == 0:
		var explorer_def: Dictionary = UnitData.get_def("explorer")
		var cost: Dictionary = explorer_def["cost"]
		if _can_afford(cost):
			_deduct_cost(cost)
			var best_planet: Planet = planets[0]
			var best_buildings := 0
			for p in planets:
				var b := p.get_total_buildings()
				if b > best_buildings:
					best_buildings = b
					best_planet = p
			var ticks: int = explorer_def["build_ticks"]
			best_planet.build_queue.append(BuildOrder.create("explorer", ticks, "unit"))
		return

	if source_planet == null:
		return

	# Find nearest uncolonized planet
	var best_target: Planet = null
	var best_distance := INF

	for system in GalaxyData.systems:
		for planet_id in system.planet_ids:
			var planet := GalaxyData.get_planet(planet_id)
			if planet == null or planet.owner_id >= 0:
				continue

			var dist := _system_distance(source_planet.system_id, system.id)
			if dist < best_distance:
				best_distance = dist
				best_target = planet

	if best_target == null:
		return

	# Consume the explorer ship and send fleet
	source_planet.units["explorer"] = source_planet.units.get("explorer", 0) - 1
	var ticks := GalaxyData.calc_travel_ticks(source_planet.system_id, best_target.system_id)

	var fleet := Fleet.create(
		GalaxyData.next_fleet_id(),
		empire.id,
		{},
		source_planet.system_id,
		best_target.system_id,
		best_target.id,
		ticks
	)
	fleet.is_exploration = true
	GalaxyData.fleets.append(fleet)


# --- Military Production ---

func _do_military_production(planets: Array[Planet]) -> void:
	# Count total military
	var total_soldiers := 0
	var total_fighters := 0
	var total_transports := 0
	var total_droids := 0

	for p in planets:
		total_soldiers += p.units.get("soldier", 0)
		total_fighters += p.units.get("fighter", 0)
		total_transports += p.units.get("transport", 0)
		total_droids += p.units.get("droid", 0)

	# Pick the planet with most buildings (strongest economy) to produce units
	var best_planet: Planet = null
	var best_buildings := 0
	for p in planets:
		var b := p.get_total_buildings()
		if b > best_buildings:
			best_buildings = b
			best_planet = p

	if best_planet == null:
		return

	# Build units based on what's needed
	var units_to_build: Array[String] = []

	# Need transports to carry ground troops
	if total_transports < (total_soldiers + total_droids) / 80:
		units_to_build.append("transport")

	# Need fighters for air superiority
	if total_fighters < 15:
		units_to_build.append("fighter")

	# Build soldiers (main ground force)
	if total_soldiers < MILITARY_THRESHOLD_SOLDIERS:
		units_to_build.append("soldier")
		units_to_build.append("soldier")  # Double priority

	# Build some droids too
	if total_droids < total_soldiers / 3:
		units_to_build.append("droid")

	# Build up to 3 units per tick
	var built := 0
	for unit_type in units_to_build:
		if built >= 3:
			break
		var def := UnitData.get_def(unit_type)
		if def.is_empty():
			continue
		var cost: Dictionary = def["cost"]
		if _can_afford(cost):
			_deduct_cost(cost)
			best_planet.units[unit_type] = best_planet.units.get(unit_type, 0) + 1
			built += 1


# --- Attack ---

func _do_attack(planets: Array[Planet], _tick_number: int) -> void:
	# Don't attack if we have fleets already in transit
	var active_fleets := 0
	for f in GalaxyData.get_fleets_for_empire(empire.id):
		if not f.is_exploration:
			active_fleets += 1
	if active_fleets >= 1:
		return

	# Gather all units from strongest planet
	var source_planet: Planet = null
	var best_power := 0
	for p in planets:
		var power := _calc_planet_military_power(p)
		if power > best_power:
			best_power = power
			source_planet = p

	if source_planet == null or best_power < 50:
		return

	# Find best target: weakest enemy planet nearby
	var best_target: Planet = null
	var best_score := -INF

	for p in GalaxyData.planets:
		if p.owner_id < 0 or p.owner_id == empire.id:
			continue

		var def_power := _calc_planet_military_power(p)
		var distance := _system_distance(source_planet.system_id, p.system_id)

		# Only attack if we're significantly stronger
		if best_power < def_power * ATTACK_STRENGTH_RATIO:
			continue

		# Score: prefer weak targets that are close
		var score := float(best_power - def_power) / maxf(distance, 1.0)
		if score > best_score:
			best_score = score
			best_target = p

	if best_target == null:
		return

	# Send attack fleet with most of our units from source planet
	var units_to_send := {}
	for unit_type in source_planet.units:
		var count: int = source_planet.units[unit_type]
		# Keep a small garrison
		var to_send := maxi(count - 5, 0)
		if to_send > 0:
			units_to_send[unit_type] = to_send
			source_planet.units[unit_type] -= to_send

	if units_to_send.is_empty():
		return

	var ticks := GalaxyData.calc_travel_ticks(source_planet.system_id, best_target.system_id)
	var fleet := Fleet.create(
		GalaxyData.next_fleet_id(),
		empire.id,
		units_to_send,
		source_planet.system_id,
		best_target.system_id,
		best_target.id,
		ticks
	)
	GalaxyData.fleets.append(fleet)


# --- Helpers ---

func _can_afford(cost: Dictionary) -> bool:
	for resource in cost:
		if empire.resources.get(resource, 0) < cost[resource]:
			return false
	return true


func _deduct_cost(cost: Dictionary) -> void:
	for resource in cost:
		empire.resources[resource] = empire.resources.get(resource, 0) - cost[resource]


func _estimate_food_balance() -> int:
	var production := 0
	var consumption := 0
	for p in GalaxyData.get_planets_for_empire(empire.id):
		production += p.get_building_count("farm") * 100
		consumption += p.population / 10
		consumption += p.get_total_units_except_droids()
	return production - consumption


func _estimate_income() -> int:
	var total_pop := 0
	var total_cf := 0
	for p in GalaxyData.get_planets_for_empire(empire.id):
		total_pop += p.population
		total_cf += p.get_building_count("cash_factory")
	return 100 + total_pop / 30 + total_cf * 8


func _calc_planet_military_power(planet: Planet) -> int:
	return (
		planet.units.get("soldier", 0) * 5 +
		planet.units.get("droid", 0) * 6 +
		planet.units.get("fighter", 0) * 10 +
		planet.units.get("bomber", 0) * 5 +
		planet.units.get("transport", 0) * 5
	)


func _system_distance(sys_a_id: int, sys_b_id: int) -> float:
	var sys_a := GalaxyData.get_system(sys_a_id)
	var sys_b := GalaxyData.get_system(sys_b_id)
	if sys_a == null or sys_b == null:
		return INF
	return sys_a.position.distance_to(sys_b.position)
