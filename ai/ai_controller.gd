class_name AIController
extends RefCounted
## Per-empire AI decision maker. Called each tick.
## Uses priority-based decisions: economy -> colonize -> military -> attack.
## Pools forces across all planets before attacking. Remembers failed attacks
## and requires overwhelming force before re-attempting.

var empire: Empire

# Attack memory: planet_id -> {tick: int, power_needed: int}
var _failed_attacks: Dictionary = {}

# Tuning constants
const COLONIZE_COST_GC: int = 200
const MIN_ATTACK_TICK: int = 100
const MIN_MILITARY_TICK: int = 40
const BUILD_QUEUE_MAX: int = 3
const ATTACK_STRENGTH_RATIO: float = 2.0  # Need 2x defender power to commit
const FAILED_ATTACK_COOLDOWN: int = 60  # Ticks to wait before retrying same target
const FAILED_ATTACK_MULTIPLIER: float = 1.5  # Need this much more than last attempt
const GARRISON_FRACTION: float = 0.15  # Keep 15% of forces as garrison
const MIN_GARRISON_PER_PLANET: int = 10  # At least this many soldiers per planet


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

	# 3. Build military units — scales with empire size
	if tick_number >= MIN_MILITARY_TICK:
		_do_military_production(planets)

	# 4. Attack enemy planets — pools forces, uses memory
	if tick_number >= MIN_ATTACK_TICK:
		_do_attack(planets, tick_number)

	# 5. Special operations (agents/wizards)
	if tick_number >= MIN_ATTACK_TICK and tick_number % 5 == 0:
		_do_operations(planets)


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
	var exploring_count := 0
	for f in GalaxyData.get_fleets_for_empire(empire.id):
		if f.is_exploration:
			exploring_count += 1
	if exploring_count >= 2:
		return

	var explorers_building := 0
	for p in planets:
		for order in p.build_queue:
			if order.building_type == "explorer":
				explorers_building += 1

	var source_planet: Planet = null
	for p in planets:
		if p.units.get("explorer", 0) > 0:
			source_planet = p
			break

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
	# Count total military across empire
	var total_soldiers := 0
	var total_fighters := 0
	var total_transports := 0
	var total_droids := 0
	var total_bombers := 0

	var total_agents := 0
	var total_wizards := 0

	for p in planets:
		total_soldiers += p.units.get("soldier", 0)
		total_fighters += p.units.get("fighter", 0)
		total_transports += p.units.get("transport", 0)
		total_droids += p.units.get("droid", 0)
		total_bombers += p.units.get("bomber", 0)
		total_agents += p.units.get("agent", 0)
		total_wizards += p.units.get("wizard", 0)

	# Scale targets with empire size
	var num_planets := planets.size()
	var target_soldiers := 50 + num_planets * 40  # e.g. 5 planets = 250 soldiers
	var target_droids := target_soldiers / 3
	var target_fighters := 10 + num_planets * 8
	var target_bombers := num_planets * 3
	var total_ground := total_soldiers + total_droids
	var target_transports := maxi(ceili(float(total_ground) / 80.0), num_planets)
	var target_agents := 5 + num_planets * 3
	var target_wizards := 5 + num_planets * 3

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

	# Build units based on what's most needed — scale production with empire
	var max_per_tick := mini(2 + num_planets, 8)
	var built := 0

	# Priority queue: most critically needed first
	var priorities: Array[Dictionary] = []
	if total_transports < target_transports:
		priorities.append({"type": "transport", "urgency": float(target_transports - total_transports) / maxf(float(target_transports), 1.0)})
	if total_soldiers < target_soldiers:
		priorities.append({"type": "soldier", "urgency": float(target_soldiers - total_soldiers) / maxf(float(target_soldiers), 1.0)})
	if total_droids < target_droids:
		priorities.append({"type": "droid", "urgency": float(target_droids - total_droids) / maxf(float(target_droids), 1.0)})
	if total_fighters < target_fighters:
		priorities.append({"type": "fighter", "urgency": float(target_fighters - total_fighters) / maxf(float(target_fighters), 1.0)})
	if total_bombers < target_bombers:
		priorities.append({"type": "bomber", "urgency": float(target_bombers - total_bombers) / maxf(float(target_bombers), 1.0)})
	if total_agents < target_agents:
		priorities.append({"type": "agent", "urgency": float(target_agents - total_agents) / maxf(float(target_agents), 1.0) * 0.5})
	if total_wizards < target_wizards:
		priorities.append({"type": "wizard", "urgency": float(target_wizards - total_wizards) / maxf(float(target_wizards), 1.0) * 0.5})

	# Sort by urgency descending
	priorities.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a["urgency"] > b["urgency"]
	)

	# Build round-robin through priorities until budget exhausted
	var pass_count := 0
	while built < max_per_tick and not priorities.is_empty() and pass_count < 20:
		pass_count += 1
		for entry in priorities:
			if built >= max_per_tick:
				break
			var unit_type: String = entry["type"]
			var def := UnitData.get_def(unit_type)
			if def.is_empty():
				continue
			var cost: Dictionary = def["cost"]
			if _can_afford(cost):
				_deduct_cost(cost)
				best_planet.units[unit_type] = best_planet.units.get(unit_type, 0) + 1
				built += 1


# --- Attack ---

func _do_attack(planets: Array[Planet], tick_number: int) -> void:
	# Don't attack if we already have attack fleets in transit
	var active_attack_fleets := 0
	for f in GalaxyData.get_fleets_for_empire(empire.id):
		if not f.is_exploration:
			active_attack_fleets += 1
	if active_attack_fleets >= 2:
		return

	# Calculate total empire military power (across ALL planets)
	var total_power := _calc_empire_attack_power()

	# Calculate garrison needed
	var garrison_power := int(total_power * GARRISON_FRACTION)
	var deployable_power := total_power - garrison_power

	if deployable_power < 200:
		return  # Not enough force to attack anything

	# Find best target considering all enemies, laser defenses, and failed attacks
	var best_target: Planet = null
	var best_score := -INF

	# Find our empire center (average position of our planets)
	var avg_x := 0.0
	var avg_y := 0.0
	var count := 0
	for p in planets:
		var sys := GalaxyData.get_system(p.system_id)
		if sys:
			avg_x += sys.position.x
			avg_y += sys.position.y
			count += 1
	if count > 0:
		avg_x /= count
		avg_y /= count

	for p in GalaxyData.planets:
		if p.owner_id < 0 or p.owner_id == empire.id:
			continue

		var def_power := _estimate_defense_power(p)

		# Check if we have enough power
		var required_power := int(def_power * ATTACK_STRENGTH_RATIO)

		# Check attack memory — increase requirement for previously failed targets
		if _failed_attacks.has(p.id):
			var memory: Dictionary = _failed_attacks[p.id]
			var ticks_since: int = tick_number - memory["tick"]
			if ticks_since < FAILED_ATTACK_COOLDOWN:
				continue  # Still on cooldown
			# Require more power than what failed last time
			var min_from_memory := int(memory["power_needed"] * FAILED_ATTACK_MULTIPLIER)
			required_power = maxi(required_power, min_from_memory)

		if deployable_power < required_power:
			continue

		# Score: prefer targets we can overwhelm, that are nearby
		var sys := GalaxyData.get_system(p.system_id)
		var distance := 100.0
		if sys:
			distance = Vector2(avg_x, avg_y).distance_to(sys.position)

		# Higher surplus = more confidence; closer = better
		var surplus := deployable_power - required_power
		var score := float(surplus) / maxf(distance, 10.0)

		# Prefer less defended planets
		score += 100.0 / maxf(float(def_power), 1.0)

		if score > best_score:
			best_score = score
			best_target = p

	if best_target == null:
		return

	# Pool forces from ALL planets, leaving a garrison on each
	var units_to_send := {"fighter": 0, "bomber": 0, "soldier": 0, "droid": 0, "transport": 0}
	var nearest_system_id := -1
	var nearest_dist := INF

	for p in planets:
		# Find nearest planet to target for fleet origin
		var dist := _system_distance(p.system_id, best_target.system_id)
		if dist < nearest_dist:
			nearest_dist = dist
			nearest_system_id = p.system_id

		# Calculate garrison for this planet
		var planet_garrison := maxi(MIN_GARRISON_PER_PLANET, int(p.units.get("soldier", 0) * GARRISON_FRACTION))

		for unit_type in ["fighter", "bomber", "soldier", "droid", "transport"]:
			var available: int = p.units.get(unit_type, 0)
			var keep := 0
			if unit_type == "soldier":
				keep = mini(planet_garrison, available)
			elif unit_type == "transport":
				# Keep enough transports for garrison soldiers
				keep = mini(ceili(float(planet_garrison) / 100.0), available)
			var to_send := maxi(available - keep, 0)
			if to_send > 0:
				units_to_send[unit_type] += to_send
				p.units[unit_type] = available - to_send

	if nearest_system_id < 0:
		return

	# Enforce transport capacity
	var ground_count: int = units_to_send["soldier"] + units_to_send["droid"]
	var transport_capacity: int = units_to_send["transport"] * 100
	if ground_count > 0 and transport_capacity < ground_count:
		if units_to_send["transport"] == 0:
			# Return ground troops to first planet
			planets[0].units["soldier"] += units_to_send["soldier"]
			planets[0].units["droid"] += units_to_send["droid"]
			units_to_send["soldier"] = 0
			units_to_send["droid"] = 0
		else:
			var ratio := float(transport_capacity) / float(ground_count)
			var send_soldiers := int(units_to_send["soldier"] * ratio)
			var send_droids := int(units_to_send["droid"] * ratio)
			# Return excess to first planet
			planets[0].units["soldier"] += units_to_send["soldier"] - send_soldiers
			planets[0].units["droid"] += units_to_send["droid"] - send_droids
			units_to_send["soldier"] = send_soldiers
			units_to_send["droid"] = send_droids

	# Remove zero entries
	var final_send := {}
	for unit_type in units_to_send:
		if units_to_send[unit_type] > 0:
			final_send[unit_type] = units_to_send[unit_type]

	if final_send.is_empty():
		return

	# Record the power we're sending so we can learn from failure
	var sent_power := _calc_dict_attack_power(final_send)
	_failed_attacks[best_target.id] = {"tick": tick_number, "power_needed": sent_power}

	var ticks := GalaxyData.calc_travel_ticks(nearest_system_id, best_target.system_id)
	var fleet := Fleet.create(
		GalaxyData.next_fleet_id(),
		empire.id,
		final_send,
		nearest_system_id,
		best_target.system_id,
		best_target.id,
		ticks
	)
	GalaxyData.fleets.append(fleet)


# --- Special Operations ---

func _do_operations(_planets: Array[Planet]) -> void:
	# Find a random enemy empire to target
	var enemies: Array[Empire] = []
	for e in GalaxyData.empires:
		if e.id == empire.id:
			continue
		if GalaxyData.get_planets_for_empire(e.id).is_empty():
			continue
		enemies.append(e)

	if enemies.is_empty():
		return

	var target: Empire = enemies[randi() % enemies.size()]

	# Try agent ops first
	var agent_count := OpsEngine.get_total_agents(empire)
	var agent_cost := OpsEngine.get_agent_op_cost(empire)
	if agent_count >= 5 and empire.resources.get("gc", 0) >= agent_cost:
		# Pick a random agent op
		var ops := ["spy", "destroy_cash", "destroy_units", "sabotage_portal"]
		var chosen_op: String = ops[randi() % ops.size()]
		var target_planet: Planet = null

		var op_def: Dictionary = OpsEngine.AGENT_OPS.get(chosen_op, {})
		if op_def.get("target", "") == "planet":
			var enemy_planets := GalaxyData.get_planets_for_empire(target.id)
			if not enemy_planets.is_empty():
				target_planet = enemy_planets[randi() % enemy_planets.size()]
			else:
				return

		OpsEngine.perform_agent_op(chosen_op, empire, target, target_planet)

	# Try wizard spells
	var wizard_count := OpsEngine.get_total_wizards(empire)
	var spell_cost := OpsEngine.get_spell_cost(empire)
	if wizard_count >= 5 and empire.resources.get("octarine", 0) >= spell_cost:
		var spells := ["vision", "hypnotize", "reduce_food", "destroy_iron"]
		var chosen_spell: String = spells[randi() % spells.size()]
		var target_planet: Planet = null

		var spell_def: Dictionary = OpsEngine.WIZARD_SPELLS.get(chosen_spell, {})
		if spell_def.get("target", "") == "planet":
			var enemy_planets := GalaxyData.get_planets_for_empire(target.id)
			if not enemy_planets.is_empty():
				target_planet = enemy_planets[randi() % enemy_planets.size()]
			else:
				return

		OpsEngine.perform_spell(chosen_spell, empire, target, target_planet)


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


func _estimate_defense_power(planet: Planet) -> int:
	## Estimate a planet's total defensive strength including lasers.
	## Uses defender-side combat values (soldiers=6, droids=7) and accounts
	## for laser damage to attackers (each laser kills ~10 bombers/transports).
	var soldiers: int = planet.units.get("soldier", 0)
	var droids: int = planet.units.get("droid", 0)
	var fighters: int = planet.units.get("fighter", 0)
	var ground_power := soldiers * 6 + droids * 7
	var air_power := fighters * 10
	# Lasers are devastating — each kills 10 air units and threatens transports
	var laser_power := planet.get_building_count("laser") * 80
	return ground_power + air_power + laser_power


func _calc_empire_attack_power() -> int:
	## Total attack power across all owned planets.
	var total := 0
	for p in GalaxyData.get_planets_for_empire(empire.id):
		total += _calc_planet_attack_power(p)
	return total


func _calc_planet_attack_power(planet: Planet) -> int:
	## Attack power of units on a single planet (attacker-side values).
	return (
		planet.units.get("soldier", 0) * 5 +
		planet.units.get("droid", 0) * 6 +
		planet.units.get("fighter", 0) * 10 +
		planet.units.get("bomber", 0) * 8 +
		planet.units.get("transport", 0) * 2
	)


func _calc_dict_attack_power(units: Dictionary) -> int:
	## Attack power from a unit dictionary.
	return (
		units.get("soldier", 0) * 5 +
		units.get("droid", 0) * 6 +
		units.get("fighter", 0) * 10 +
		units.get("bomber", 0) * 8 +
		units.get("transport", 0) * 2
	)


func _system_distance(sys_a_id: int, sys_b_id: int) -> float:
	var sys_a := GalaxyData.get_system(sys_a_id)
	var sys_b := GalaxyData.get_system(sys_b_id)
	if sys_a == null or sys_b == null:
		return INF
	return sys_a.position.distance_to(sys_b.position)
