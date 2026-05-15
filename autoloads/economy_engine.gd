extends Node
## Processes all per-tick economic simulation.
## Called by TickEngine each tick.

func process_tick(tick_number: int) -> void:
	# Advance fleets globally (before empire processing)
	_advance_fleets()

	for empire in GalaxyData.empires:
		_process_empire_tick(empire, tick_number)

	# Run AI controllers for non-player empires
	for empire_id in GalaxyData.ai_controllers:
		GalaxyData.ai_controllers[empire_id].process_tick(tick_number)

	# Check for eliminated empires
	_check_eliminations()


func _process_empire_tick(empire: Empire, _tick_number: int) -> void:
	var empire_planets := GalaxyData.get_planets_for_empire(empire.id)
	if empire_planets.is_empty():
		return

	# 1. Advance build queues
	_advance_build_queues(empire, empire_planets)

	# 2. Resource production
	_calculate_production(empire, empire_planets)

	# 3. Resource decay (0.5% for food, iron, endurium, octarine)
	_apply_resource_decay(empire)

	# 4. Food consumption and starvation
	var food_consumed := _calculate_food_consumption(empire_planets)
	var food_before: int = empire.resources.get("food", 0)
	empire.resources["food"] = food_before - food_consumed
	var is_starving: bool = empire.resources["food"] < 0
	var food_deficit := 0
	if is_starving:
		food_deficit = -empire.resources["food"]
		empire.resources["food"] = 0

	# 5. Income (halved if starving)
	var income := _calculate_income(empire, empire_planets)
	if is_starving:
		income = income / 2
	empire.resources["gc"] += income

	# 6. Population growth (or starvation die-off)
	if is_starving:
		_starve_population(empire, empire_planets, food_deficit)
	else:
		_grow_population(empire, empire_planets)

	# 7. Upkeep: 1gc per building + 1gc per unit
	var upkeep := _calculate_upkeep(empire_planets)
	empire.resources["gc"] -= upkeep
	if empire.resources["gc"] < 0:
		empire.resources["gc"] = 0

	# 8. Research generation
	_generate_research(empire, empire_planets)

	# 9. Tick down debuffs and restore portals
	_tick_debuffs(empire)


func _advance_fleets() -> void:
	var arrived: Array[Fleet] = []
	for fleet in GalaxyData.fleets:
		fleet.ticks_remaining -= 1
		if fleet.ticks_remaining <= 0:
			arrived.append(fleet)

	for fleet in arrived:
		_handle_fleet_arrival(fleet)


func _handle_fleet_arrival(fleet: Fleet) -> void:
	var target_planet := GalaxyData.get_planet(fleet.target_planet_id)
	if target_planet == null:
		GalaxyData.fleets.erase(fleet)
		return

	if fleet.is_exploration:
		# Colonize the planet
		if target_planet.owner_id < 0:
			target_planet.owner_id = fleet.owner_id
			target_planet.population = target_planet.size
			var empire := GalaxyData.get_empire(fleet.owner_id)
			EventBus.planet_colonized.emit(target_planet, empire)
			EventBus.notification_posted.emit("Colonized %s!" % target_planet.planet_name, "explore")
		GalaxyData.fleets.erase(fleet)
		return

	if target_planet.owner_id == fleet.owner_id:
		# Friendly planet: merge units
		for unit_type in fleet.units:
			target_planet.units[unit_type] = target_planet.units.get(unit_type, 0) + fleet.units[unit_type]
		GalaxyData.fleets.erase(fleet)
		EventBus.fleet_arrived.emit(fleet)
	elif target_planet.owner_id >= 0:
		# Enemy planet: combat
		CombatEngine.resolve_battle(fleet, target_planet)
	else:
		# Uncolonized: just land units
		target_planet.owner_id = fleet.owner_id
		target_planet.population = target_planet.size
		for unit_type in fleet.units:
			target_planet.units[unit_type] = target_planet.units.get(unit_type, 0) + fleet.units[unit_type]
		GalaxyData.fleets.erase(fleet)
		EventBus.fleet_arrived.emit(fleet)


func _advance_build_queues(_empire: Empire, empire_planets: Array[Planet]) -> void:
	for planet in empire_planets:
		if planet.build_queue.is_empty():
			continue
		# Advance ALL items in the queue simultaneously
		var completed: Array[int] = []
		for i in planet.build_queue.size():
			var order: BuildOrder = planet.build_queue[i]
			order.ticks_remaining -= 1
			if order.ticks_remaining <= 0:
				completed.append(i)
		# Process completions in reverse order to preserve indices
		for i in range(completed.size() - 1, -1, -1):
			var idx: int = completed[i]
			var order: BuildOrder = planet.build_queue[idx]
			if order.category == "unit":
				planet.units[order.building_type] = planet.units.get(order.building_type, 0) + 1
			else:
				planet.add_building(order.building_type)
			planet.build_queue.remove_at(idx)
			EventBus.building_completed.emit(planet, order.building_type)


func _calculate_production(empire: Empire, empire_planets: Array[Planet]) -> void:
	var resource_science := empire.get_science_percent("resources")
	var resource_mult := 1.0 + resource_science / 100.0

	# Calculate food debuff from reduced_food debuffs
	var food_reduction := 0.0
	for d in empire.debuffs:
		if d["type"] == "reduced_food":
			food_reduction += d["value"]
	food_reduction = minf(food_reduction, 0.5)  # Cap at 50% reduction

	for planet in empire_planets:
		for building_type in planet.buildings:
			var count: int = planet.buildings[building_type]
			if count <= 0:
				continue
			var def := BuildingData.get_def(building_type)
			if def.is_empty() or not def.has("production"):
				continue
			var production: Dictionary = def["production"]
			for resource in production:
				if resource == "rp":
					continue  # RP handled separately
				var base_amount: int = production[resource] * count
				var bonus: float = planet.resource_bonuses.get(resource, 1.0)
				var amount := int(base_amount * bonus * resource_mult)
				# Apply food debuff
				if resource == "food" and food_reduction > 0.0:
					amount = int(amount * (1.0 - food_reduction))
				empire.resources[resource] = empire.resources.get(resource, 0) + amount


func _apply_resource_decay(empire: Empire) -> void:
	for resource in ["food", "iron", "endurium", "octarine"]:
		var current: int = empire.resources.get(resource, 0)
		var decay := int(current * 0.005)
		empire.resources[resource] = current - decay


func _calculate_income(empire: Empire, empire_planets: Array[Planet]) -> int:
	var total_pop := 0
	var total_cf := 0
	var total_tax := 0
	var total_buildings := 0

	for p in empire_planets:
		total_pop += p.population
		total_cf += p.get_building_count("cash_factory")
		total_tax += p.get_building_count("tax_office")
		total_buildings += p.get_total_buildings()

	var base := 100 + total_pop / 30 + total_cf * 8
	var tax_bonus := 1.0 + 2.0 * float(total_tax) / float(total_buildings + 1)
	var econ_science := empire.get_science_percent("economy")
	return int(float(base) * tax_bonus * (1.0 + econ_science / 100.0))


func _calculate_food_consumption(empire_planets: Array[Planet]) -> int:
	var total := 0
	for p in empire_planets:
		total += p.population / 10
		total += p.get_total_units_except_droids()
	return total


func _starve_population(empire: Empire, empire_planets: Array[Planet], food_deficit: int) -> void:
	## Population dies off proportional to the food deficit relative to total consumption.
	var total_consumption := _calculate_food_consumption(empire_planets)
	if total_consumption <= 0:
		return
	# Death rate = deficit / total consumption (what fraction of food need was unmet)
	var death_rate := float(food_deficit) / float(total_consumption)
	death_rate = clampf(death_rate, 0.0, 1.0)

	var total_deaths := 0
	for p in empire_planets:
		if p.population <= 0:
			continue
		var deaths := int(p.population * death_rate)
		deaths = maxi(deaths, 1)  # At least 1 person dies per starving planet
		p.population = maxi(p.population - deaths, 0)
		total_deaths += deaths

	if empire.is_player and total_deaths > 0:
		EventBus.notification_posted.emit("Starvation! %d population died. Income halved." % total_deaths, "warning")


func _grow_population(empire: Empire, empire_planets: Array[Planet]) -> void:
	var welfare_science := empire.get_science_percent("welfare")
	for p in empire_planets:
		if p.population <= 0:
			continue
		var max_pop := p.get_max_population()
		# Welfare science increases max pop
		max_pop = int(max_pop * (1.0 + welfare_science / 100.0))
		var growth := int(p.population * 0.05)
		p.population = mini(p.population + growth, max_pop)


func _calculate_upkeep(empire_planets: Array[Planet]) -> int:
	var total := 0
	for p in empire_planets:
		total += p.get_total_buildings()  # 1gc per building
		total += p.get_total_units()  # 1gc per unit
	return total


func _check_eliminations() -> void:
	for empire in GalaxyData.empires:
		if empire.id in GameManager._eliminated_empires:
			continue
		var planet_count := GalaxyData.get_planets_for_empire(empire.id).size()
		var fleet_count := GalaxyData.get_fleets_for_empire(empire.id).size()
		if planet_count == 0 and fleet_count == 0:
			EventBus.empire_eliminated.emit(empire)


func _generate_research(empire: Empire, empire_planets: Array[Planet]) -> void:
	var total_rc := 0
	for p in empire_planets:
		total_rc += p.get_building_count("research_center")
	if total_rc <= 0:
		return

	var rp_per_tick := total_rc * 20
	# Distribute RP according to allocation
	for science in empire.research_allocation:
		var pct: int = empire.research_allocation[science]
		var rp := int(rp_per_tick * pct / 100.0)
		empire.research_points[science] = empire.research_points.get(science, 0) + rp


func _tick_debuffs(empire: Empire) -> void:
	## Tick down debuff durations and remove expired ones.
	var expired: Array[int] = []
	for i in empire.debuffs.size():
		var d: Dictionary = empire.debuffs[i]
		d["ticks_remaining"] -= 1
		if d["ticks_remaining"] <= 0:
			expired.append(i)
			# Restore portals when sabotage expires
			if d["type"] == "portal_disabled" and d.has("planet_id"):
				var planet := GalaxyData.get_planet(d["planet_id"])
				if planet and planet.get_building_count("portal") > 0:
					planet.has_portal = true

	# Remove in reverse order
	for i in range(expired.size() - 1, -1, -1):
		empire.debuffs.remove_at(expired[i])
