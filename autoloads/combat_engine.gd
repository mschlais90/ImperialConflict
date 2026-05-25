extends Node
## Resolves battles between an attacking fleet and a defending planet.
## Pure logic - no UI dependencies.

func resolve_battle(attacker_fleet: Fleet, defender_planet: Planet) -> Dictionary:
	## Returns a combat report dictionary with phase results and outcome.

	# Portal defense pooling: if the defending planet has a portal,
	# pull all combat units from other portalled planets to reinforce it.
	var portal_donors: Array[Planet] = []
	if defender_planet.has_portal:
		var defender_planets := GalaxyData.get_planets_for_empire(defender_planet.owner_id)
		for p in defender_planets:
			if p.id == defender_planet.id:
				continue
			if not p.has_portal:
				continue
			portal_donors.append(p)
			for unit_type: String in ["fighter", "bomber", "soldier", "droid", "transport"]:
				var count: int = p.units.get(unit_type, 0)
				if count > 0:
					defender_planet.units[unit_type] = defender_planet.units.get(unit_type, 0) + count
					p.units[unit_type] = 0

	var report := {
		"attacker_id": attacker_fleet.owner_id,
		"defender_id": defender_planet.owner_id,
		"planet_id": defender_planet.id,
		"planet_name": defender_planet.planet_name,
		"attacker_won": false,
		"phases": [],
		"attacker_initial": attacker_fleet.units.duplicate(),
		"defender_initial": defender_planet.units.duplicate(),
		"defender_lasers": defender_planet.get_building_count("laser"),
	}

	# Get military science bonuses
	var atk_empire := GalaxyData.get_empire(attacker_fleet.owner_id)
	var def_empire := GalaxyData.get_empire(defender_planet.owner_id)
	var atk_mil_bonus := 1.0 + (atk_empire.get_science_percent("military") / 100.0 if atk_empire else 0.0)
	var def_mil_bonus := 1.0 + (def_empire.get_science_percent("military") / 100.0 if def_empire else 0.0)

	# Copy unit counts so we can modify them
	var atk := attacker_fleet.units.duplicate()
	var def_units := defender_planet.units.duplicate()
	var def_lasers: int = defender_planet.get_building_count("laser")

	# --- Phase 1: Air vs Ground (Bombers vs Lasers) ---
	var phase1 := _phase_air_vs_ground(atk, def_lasers)
	report["phases"].append(phase1)
	def_lasers = phase1["remaining_lasers"]
	# Ground troops in destroyed transports don't survive
	var stranded1 := _kill_stranded_ground(atk)
	phase1["ground_lost_to_transports"] = stranded1

	# --- Phase 2: Air vs Air (Fighters) ---
	var phase2 := _phase_air_vs_air(atk, def_units, atk_mil_bonus, def_mil_bonus)
	report["phases"].append(phase2)
	# Ground troops in destroyed transports don't survive
	var stranded2 := _kill_stranded_ground(atk)
	phase2["ground_lost_to_transports"] = stranded2

	# --- Phase 3: Ground vs Ground (with military science bonuses) ---
	var phase3 := _phase_ground_vs_ground(atk, def_units, atk_mil_bonus, def_mil_bonus)
	report["phases"].append(phase3)

	report["attacker_won"] = phase3["attacker_won"]

	# Apply results
	if report["attacker_won"]:
		# Transfer planet to attacker — defender's agents/wizards are lost
		defender_planet.owner_id = attacker_fleet.owner_id
		defender_planet.units = {
			"fighter": atk.get("fighter", 0),
			"bomber": atk.get("bomber", 0),
			"soldier": atk.get("soldier", 0),
			"droid": atk.get("droid", 0),
			"transport": atk.get("transport", 0),
			"agent": 0,
			"wizard": 0,
		}
	else:
		# Defender keeps planet, update surviving combat units, preserve agents/wizards
		var prev_agents: int = defender_planet.units.get("agent", 0)
		var prev_wizards: int = defender_planet.units.get("wizard", 0)
		defender_planet.units = {
			"fighter": def_units.get("fighter", 0),
			"bomber": def_units.get("bomber", 0),
			"soldier": def_units.get("soldier", 0),
			"droid": def_units.get("droid", 0),
			"transport": def_units.get("transport", 0),
			"agent": prev_agents,
			"wizard": prev_wizards,
		}

	# Remove fleet from galaxy data
	GalaxyData.fleets.erase(attacker_fleet)

	# Post notification
	var atk_empire2 := GalaxyData.get_empire(attacker_fleet.owner_id)
	var def_empire2 := GalaxyData.get_empire(report["defender_id"])
	var atk_name: String = atk_empire2.empire_name if atk_empire2 else "Unknown"
	var def_name: String = def_empire2.empire_name if def_empire2 else "Unknown"
	if report["attacker_won"]:
		EventBus.notification_posted.emit("%s captured %s from %s!" % [atk_name, defender_planet.planet_name, def_name], "combat")
	else:
		EventBus.notification_posted.emit("%s failed to take %s from %s" % [atk_name, defender_planet.planet_name, def_name], "combat")

	EventBus.battle_resolved.emit(report)
	return report


func _phase_air_vs_ground(atk: Dictionary, laser_count: int) -> Dictionary:
	## Attacking bombers try to destroy lasers. Surviving lasers shoot back.
	var bombers: int = atk.get("bomber", 0)
	var transports: int = atk.get("transport", 0)

	# Each bomber has 10% chance to destroy a laser
	var lasers_destroyed := 0
	for _i in bombers:
		if laser_count <= 0:
			break
		if randf() < 0.1:
			lasers_destroyed += 1
			laser_count -= 1

	# Surviving lasers shoot back: each kills 10 units (transports first, then bombers)
	var units_killed_by_lasers := laser_count * 10
	var transports_lost := mini(transports, units_killed_by_lasers)
	units_killed_by_lasers -= transports_lost
	transports -= transports_lost
	var bombers_lost := mini(bombers, units_killed_by_lasers)
	units_killed_by_lasers -= bombers_lost
	bombers -= bombers_lost

	atk["bomber"] = bombers
	atk["transport"] = transports

	return {
		"phase": "Air vs Ground",
		"lasers_destroyed": lasers_destroyed,
		"remaining_lasers": laser_count,
		"bombers_lost": bombers_lost,
		"transports_lost": transports_lost,
	}


func _phase_air_vs_air(atk: Dictionary, def: Dictionary, atk_mil_bonus: float = 1.0, def_mil_bonus: float = 1.0) -> Dictionary:
	## Fighters engage using IC's formula: defenders fire first, then attackers
	## fire back at reduced strength. Max 30% losses per side.
	var atk_fighters: int = atk.get("fighter", 0)
	var def_fighters: int = def.get("fighter", 0)

	var atk_fighters_lost := 0
	var def_fighters_lost := 0
	var transports_lost := 0

	if atk_fighters > 0 and def_fighters > 0:
		var atk_pwr := 10.0 * atk_mil_bonus
		var def_pwr := 10.0 * def_mil_bonus

		# Defenders fire first — attacker losses
		var var_x := (def_pwr * def_fighters) / (atk_pwr * atk_fighters) / 4.0
		atk_fighters_lost = mini(int(minf(atk_fighters * var_x, atk_fighters) / 2.0), int(atk_fighters * 0.3))
		atk_fighters -= atk_fighters_lost

		# Attackers fire back at reduced strength
		if atk_fighters > 0:
			var var_y := (atk_pwr * atk_fighters) / (def_pwr * def_fighters) / 4.0
			def_fighters_lost = mini(int(minf(def_fighters * var_y, def_fighters) / 2.0), int(def_fighters * 0.3))
			def_fighters -= def_fighters_lost

	# Surviving defending fighters try to break through to attack transports.
	# Attacker fighters shield transports — defenders must outnumber the screen.
	if def_fighters > 0 and atk.get("transport", 0) > 0:
		var loss_rate := float(def_fighters) / (float(def_fighters) + maxf(float(atk_fighters), 1.0))
		transports_lost = int(atk.get("transport", 0) * loss_rate)
		atk["transport"] = atk.get("transport", 0) - transports_lost

	atk["fighter"] = atk_fighters
	def["fighter"] = def_fighters

	return {
		"phase": "Air vs Air",
		"atk_fighters_lost": atk_fighters_lost,
		"def_fighters_lost": def_fighters_lost,
		"transports_lost_to_fighters": transports_lost,
	}


func _phase_ground_vs_ground(atk: Dictionary, def: Dictionary, atk_mil_bonus: float = 1.0, def_mil_bonus: float = 1.0) -> Dictionary:
	## Ground forces clash. Side with more total ground power wins.
	## Each transport deploys up to 100 ground units.
	var transport_capacity: int = atk.get("transport", 0) * 100
	var atk_soldiers: int = mini(atk.get("soldier", 0), transport_capacity)
	transport_capacity -= atk_soldiers
	var atk_droids: int = mini(atk.get("droid", 0), transport_capacity)

	var def_soldiers: int = def.get("soldier", 0)
	var def_droids: int = def.get("droid", 0)

	var atk_power := int((atk_soldiers * 5 + atk_droids * 6) * atk_mil_bonus)
	var def_power := int((def_soldiers * 6 + def_droids * 7) * def_mil_bonus)

	var attacker_won := atk_power > def_power

	# Max 15% losses for the loser, proportional for winner
	var atk_loss_pct: float
	var def_loss_pct: float
	if atk_power + def_power > 0:
		if attacker_won:
			atk_loss_pct = 0.05 * float(def_power) / maxf(float(atk_power), 1.0)
			def_loss_pct = 0.15
		else:
			atk_loss_pct = 0.15
			def_loss_pct = 0.05 * float(atk_power) / maxf(float(def_power), 1.0)
	else:
		atk_loss_pct = 0.0
		def_loss_pct = 0.0

	var atk_soldiers_lost := int(atk_soldiers * atk_loss_pct)
	var atk_droids_lost := int(atk_droids * atk_loss_pct)
	var def_soldiers_lost := int(def_soldiers * def_loss_pct)
	var def_droids_lost := int(def_droids * def_loss_pct)

	atk["soldier"] = atk.get("soldier", 0) - atk_soldiers_lost
	atk["droid"] = atk.get("droid", 0) - atk_droids_lost
	def["soldier"] = def_soldiers - def_soldiers_lost
	def["droid"] = def_droids - def_droids_lost

	return {
		"phase": "Ground vs Ground",
		"attacker_won": attacker_won,
		"atk_power": atk_power,
		"def_power": def_power,
		"atk_soldiers_lost": atk_soldiers_lost,
		"atk_droids_lost": atk_droids_lost,
		"def_soldiers_lost": def_soldiers_lost,
		"def_droids_lost": def_droids_lost,
	}


func _kill_stranded_ground(atk: Dictionary) -> Dictionary:
	## When transports are destroyed, ground troops exceeding remaining
	## transport capacity are killed (they were aboard those transports).
	var transport_capacity: int = atk.get("transport", 0) * 100
	var soldiers: int = atk.get("soldier", 0)
	var droids: int = atk.get("droid", 0)
	var total_ground := soldiers + droids

	var soldiers_killed := 0
	var droids_killed := 0

	if total_ground > transport_capacity:
		var excess := total_ground - transport_capacity
		# Kill proportionally between soldiers and droids
		if total_ground > 0:
			soldiers_killed = mini(int(float(excess) * float(soldiers) / float(total_ground) + 0.5), soldiers)
			droids_killed = mini(excess - soldiers_killed, droids)
		atk["soldier"] = soldiers - soldiers_killed
		atk["droid"] = droids - droids_killed

	return {"soldiers_killed": soldiers_killed, "droids_killed": droids_killed}
