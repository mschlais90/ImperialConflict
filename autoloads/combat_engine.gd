extends Node
## Resolves battles between an attacking fleet and a defending planet.
## Pure logic - no UI dependencies.

func resolve_battle(attacker_fleet: Fleet, defender_planet: Planet) -> Dictionary:
	## Returns a combat report dictionary with phase results and outcome.
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

	# --- Phase 2: Air vs Air (Fighters) ---
	var phase2 := _phase_air_vs_air(atk, def_units)
	report["phases"].append(phase2)

	# --- Phase 3: Ground vs Ground (with military science bonuses) ---
	var phase3 := _phase_ground_vs_ground(atk, def_units, atk_mil_bonus, def_mil_bonus)
	report["phases"].append(phase3)

	report["attacker_won"] = phase3["attacker_won"]

	# Apply results
	if report["attacker_won"]:
		# Transfer planet to attacker
		defender_planet.owner_id = attacker_fleet.owner_id
		defender_planet.units = {
			"fighter": atk.get("fighter", 0),
			"bomber": atk.get("bomber", 0),
			"soldier": atk.get("soldier", 0),
			"droid": atk.get("droid", 0),
			"transport": atk.get("transport", 0),
		}
	else:
		# Defender keeps planet, update surviving units
		defender_planet.units = {
			"fighter": def_units.get("fighter", 0),
			"bomber": def_units.get("bomber", 0),
			"soldier": def_units.get("soldier", 0),
			"droid": def_units.get("droid", 0),
			"transport": def_units.get("transport", 0),
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

	# Surviving lasers shoot back: each kills 10 units (bombers + transports)
	var units_killed_by_lasers := laser_count * 10
	var bombers_lost := mini(bombers, units_killed_by_lasers)
	units_killed_by_lasers -= bombers_lost
	bombers -= bombers_lost
	var transports_lost := mini(transports, units_killed_by_lasers)
	transports -= transports_lost

	atk["bomber"] = bombers
	atk["transport"] = transports

	return {
		"phase": "Air vs Ground",
		"lasers_destroyed": lasers_destroyed,
		"remaining_lasers": laser_count,
		"bombers_lost": bombers_lost,
		"transports_lost": transports_lost,
	}


func _phase_air_vs_air(atk: Dictionary, def: Dictionary) -> Dictionary:
	## Fighters engage. Max 30% losses on each side.
	var atk_fighters: int = atk.get("fighter", 0)
	var def_fighters: int = def.get("fighter", 0)

	var atk_fighters_lost := 0
	var def_fighters_lost := 0
	var transports_lost := 0

	if atk_fighters > 0 or def_fighters > 0:
		var total := atk_fighters + def_fighters
		if total > 0:
			var atk_ratio := float(atk_fighters) / float(total)
			var def_ratio := 1.0 - atk_ratio

			# Losses proportional to opponent's strength, max 30%
			atk_fighters_lost = mini(int(atk_fighters * def_ratio * 0.3), int(atk_fighters * 0.3))
			def_fighters_lost = mini(int(def_fighters * atk_ratio * 0.3), int(def_fighters * 0.3))

			atk_fighters -= atk_fighters_lost
			def_fighters -= def_fighters_lost

	# Surviving defending fighters attack transports (up to 100%)
	if def_fighters > 0:
		var transport_ratio := minf(float(def_fighters) / maxf(float(atk.get("transport", 0)), 1.0), 1.0)
		transports_lost = int(atk.get("transport", 0) * transport_ratio)
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
