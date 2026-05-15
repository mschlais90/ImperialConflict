extends Node
## Handles special operations (agent ops and wizard spells).
## Called by UI or AI when performing operations against enemy empires.

# Agent operation definitions
const AGENT_OPS: Dictionary = {
	"spy": {
		"name": "Spy",
		"description": "Reveal enemy empire resources and planet count.",
		"target": "empire",
	},
	"destroy_cash": {
		"name": "Destroy Cash",
		"description": "Destroy 3-10% of enemy GC reserves.",
		"target": "empire",
	},
	"destroy_units": {
		"name": "Destroy Units",
		"description": "Destroy 30% of a random unit type on target planet.",
		"target": "planet",
	},
	"sabotage_portal": {
		"name": "Sabotage Portal",
		"description": "Disable portal on target planet for 20 ticks.",
		"target": "planet",
	},
}

# Wizard spell definitions
const WIZARD_SPELLS: Dictionary = {
	"vision": {
		"name": "Vision",
		"description": "Reveal enemy empire resources and planet count.",
		"target": "empire",
	},
	"hypnotize": {
		"name": "Hypnotize",
		"description": "Kill 30% of population on target planet.",
		"target": "planet",
	},
	"reduce_food": {
		"name": "Reduce Food",
		"description": "Reduce enemy food production by 10% for 8 ticks.",
		"target": "empire",
	},
	"destroy_iron": {
		"name": "Destroy Iron",
		"description": "Destroy 3-10% of enemy iron reserves.",
		"target": "empire",
	},
}


func get_agent_op_cost(attacker: Empire) -> int:
	## Agent ops cost NW / 15 in GC.
	var nw := GalaxyData.calc_empire_networth(attacker.id)
	return maxi(int(nw / 15.0), 10)


func get_spell_cost(attacker: Empire) -> int:
	## Wizard spells cost NW / 20 in octarine.
	var nw := GalaxyData.calc_empire_networth(attacker.id)
	return maxi(int(nw / 20.0), 5)


func get_success_chance(atk_count: int, def_count: int, atk_nw: float, def_nw: float) -> float:
	## Calculate success probability for an operation.
	## More agents/wizards = higher chance. Attacking larger empire = harder.
	if atk_count <= 0:
		return 0.0
	var nw_factor := maxf(1.0, def_nw / maxf(atk_nw, 1.0))
	var chance := float(atk_count) / (float(atk_count) + float(def_count) * nw_factor)
	return clampf(chance, 0.1, 0.9)


func get_total_agents(empire: Empire) -> int:
	var total := 0
	for p in GalaxyData.get_planets_for_empire(empire.id):
		total += p.units.get("agent", 0)
	return total


func get_total_wizards(empire: Empire) -> int:
	var total := 0
	for p in GalaxyData.get_planets_for_empire(empire.id):
		total += p.units.get("wizard", 0)
	return total


# --- Agent Operations ---

func perform_agent_op(op_type: String, attacker: Empire, target_empire: Empire, target_planet: Planet = null) -> Dictionary:
	## Perform an agent operation. Returns {success: bool, message: String}.
	var op_def: Dictionary = AGENT_OPS.get(op_type, {})
	if op_def.is_empty():
		return {"success": false, "message": "Unknown operation"}

	# Check cost
	var cost := get_agent_op_cost(attacker)
	if attacker.resources.get("gc", 0) < cost:
		return {"success": false, "message": "Not enough GC (%d needed)" % cost}

	# Check we have agents
	var atk_agents := get_total_agents(attacker)
	if atk_agents <= 0:
		return {"success": false, "message": "No agents available"}

	# Deduct cost
	attacker.resources["gc"] -= cost

	# Roll for success
	var def_agents := get_total_agents(target_empire)
	var atk_nw := GalaxyData.calc_empire_networth(attacker.id)
	var def_nw := GalaxyData.calc_empire_networth(target_empire.id)
	var chance := get_success_chance(atk_agents, def_agents, atk_nw, def_nw)

	if randf() > chance:
		return {"success": false, "message": "%s failed! (%.0f%% chance)" % [op_def["name"], chance * 100]}

	# Apply effect
	match op_type:
		"spy":
			return _op_spy(target_empire)
		"destroy_cash":
			return _op_destroy_cash(target_empire)
		"destroy_units":
			if target_planet == null:
				return {"success": false, "message": "No target planet selected"}
			return _op_destroy_units(target_planet)
		"sabotage_portal":
			if target_planet == null:
				return {"success": false, "message": "No target planet selected"}
			return _op_sabotage_portal(target_empire, target_planet)

	return {"success": false, "message": "Unknown operation"}


func _op_spy(target: Empire) -> Dictionary:
	var planets := GalaxyData.get_planets_for_empire(target.id)
	var msg := "SPY on %s: %d planets, GC: %d, Food: %d, Iron: %d, End: %d, Oct: %d" % [
		target.empire_name, planets.size(),
		target.resources.get("gc", 0),
		target.resources.get("food", 0),
		target.resources.get("iron", 0),
		target.resources.get("endurium", 0),
		target.resources.get("octarine", 0),
	]
	return {"success": true, "message": msg}


func _op_destroy_cash(target: Empire) -> Dictionary:
	var pct := randf_range(0.03, 0.10)
	var gc: int = target.resources.get("gc", 0)
	var destroyed := int(gc * pct)
	target.resources["gc"] = gc - destroyed
	_notify_defender(target, "Enemy agents destroyed %d of your GC!" % destroyed)
	return {"success": true, "message": "Destroyed %d GC (%.0f%%) from %s" % [destroyed, pct * 100, target.empire_name]}


func _op_destroy_units(target_planet: Planet) -> Dictionary:
	# Pick a random military unit type that exists on the planet
	var candidates: Array[String] = []
	for ut in ["fighter", "bomber", "soldier", "droid", "transport"]:
		if target_planet.units.get(ut, 0) > 0:
			candidates.append(ut)
	if candidates.is_empty():
		return {"success": true, "message": "No units found on %s" % target_planet.planet_name}

	var chosen: String = candidates[randi() % candidates.size()]
	var count: int = target_planet.units.get(chosen, 0)
	var destroyed := int(count * 0.3)
	destroyed = maxi(destroyed, 1)
	target_planet.units[chosen] = count - destroyed
	var udef := UnitData.get_def(chosen)
	var uname: String = udef.get("name", chosen) if not udef.is_empty() else chosen
	var owner := GalaxyData.get_empire(target_planet.owner_id)
	if owner:
		_notify_defender(owner, "Enemy agents destroyed %d %s on %s!" % [destroyed, uname, target_planet.planet_name])
	return {"success": true, "message": "Destroyed %d %s on %s" % [destroyed, uname, target_planet.planet_name]}


func _op_sabotage_portal(target_empire: Empire, target_planet: Planet) -> Dictionary:
	if not target_planet.has_portal:
		return {"success": true, "message": "%s has no portal to sabotage" % target_planet.planet_name}

	# Add portal disabled debuff to the empire with planet reference
	target_empire.debuffs.append({
		"type": "portal_disabled",
		"ticks_remaining": 20,
		"value": 0.0,
		"planet_id": target_planet.id,
	})
	target_planet.has_portal = false
	_notify_defender(target_empire, "Your portal on %s was sabotaged! Disabled for 20 ticks." % target_planet.planet_name)
	return {"success": true, "message": "Sabotaged portal on %s (disabled 20 ticks)" % target_planet.planet_name}


# --- Wizard Spells ---

func perform_spell(spell_type: String, attacker: Empire, target_empire: Empire, target_planet: Planet = null) -> Dictionary:
	## Perform a wizard spell. Returns {success: bool, message: String}.
	var spell_def: Dictionary = WIZARD_SPELLS.get(spell_type, {})
	if spell_def.is_empty():
		return {"success": false, "message": "Unknown spell"}

	# Check cost
	var cost := get_spell_cost(attacker)
	if attacker.resources.get("octarine", 0) < cost:
		return {"success": false, "message": "Not enough Octarine (%d needed)" % cost}

	# Check we have wizards
	var atk_wizards := get_total_wizards(attacker)
	if atk_wizards <= 0:
		return {"success": false, "message": "No wizards available"}

	# Deduct cost
	attacker.resources["octarine"] -= cost

	# Roll for success
	var def_wizards := get_total_wizards(target_empire)
	var atk_nw := GalaxyData.calc_empire_networth(attacker.id)
	var def_nw := GalaxyData.calc_empire_networth(target_empire.id)
	var chance := get_success_chance(atk_wizards, def_wizards, atk_nw, def_nw)

	if randf() > chance:
		return {"success": false, "message": "%s failed! (%.0f%% chance)" % [spell_def["name"], chance * 100]}

	# Apply effect
	match spell_type:
		"vision":
			return _spell_vision(target_empire)
		"hypnotize":
			if target_planet == null:
				return {"success": false, "message": "No target planet selected"}
			return _spell_hypnotize(target_planet)
		"reduce_food":
			return _spell_reduce_food(target_empire)
		"destroy_iron":
			return _spell_destroy_iron(target_empire)

	return {"success": false, "message": "Unknown spell"}


func _spell_vision(target: Empire) -> Dictionary:
	var planets := GalaxyData.get_planets_for_empire(target.id)
	var msg := "VISION on %s: %d planets, GC: %d, Food: %d, Iron: %d, End: %d, Oct: %d" % [
		target.empire_name, planets.size(),
		target.resources.get("gc", 0),
		target.resources.get("food", 0),
		target.resources.get("iron", 0),
		target.resources.get("endurium", 0),
		target.resources.get("octarine", 0),
	]
	return {"success": true, "message": msg}


func _spell_hypnotize(target_planet: Planet) -> Dictionary:
	var pop: int = target_planet.population
	var killed := int(pop * 0.3)
	killed = maxi(killed, 1)
	target_planet.population = maxi(pop - killed, 0)
	var owner := GalaxyData.get_empire(target_planet.owner_id)
	if owner:
		_notify_defender(owner, "Enemy wizards hypnotized %s! %d population killed!" % [target_planet.planet_name, killed])
	return {"success": true, "message": "Hypnotized %s! %d population killed (30%%)" % [target_planet.planet_name, killed]}


func _spell_reduce_food(target: Empire) -> Dictionary:
	# Stack check: count existing reduced_food debuffs
	var existing := 0
	for d in target.debuffs:
		if d["type"] == "reduced_food":
			existing += 1
	if existing >= 3:
		return {"success": true, "message": "Reduce Food on %s — already at max stacks" % target.empire_name}

	target.debuffs.append({
		"type": "reduced_food",
		"ticks_remaining": 8,
		"value": 0.10,  # 10% reduction
	})
	_notify_defender(target, "Enemy wizards reduced your food production by 10%% for 8 ticks!")
	return {"success": true, "message": "Reduced food production on %s by 10%% for 8 ticks" % target.empire_name}


func _spell_destroy_iron(target: Empire) -> Dictionary:
	var pct := randf_range(0.03, 0.10)
	var iron: int = target.resources.get("iron", 0)
	var destroyed := int(iron * pct)
	target.resources["iron"] = iron - destroyed
	_notify_defender(target, "Enemy wizards destroyed %d of your iron!" % destroyed)
	return {"success": true, "message": "Destroyed %d iron (%.0f%%) from %s" % [destroyed, pct * 100, target.empire_name]}


func _notify_defender(defender: Empire, message: String) -> void:
	## Only notify the player about enemy operations against them.
	if defender.is_player:
		EventBus.notification_posted.emit(message, "ops")
