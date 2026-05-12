extends Node
## Single source of truth for all mutable game state.
## Holds empires, solar systems, planets, and fleets.
## Responsible for galaxy generation.

var empires: Array[Empire] = []
var systems: Array[SolarSystem] = []
var planets: Array[Planet] = []
var fleets: Array[Fleet] = []
var ai_controllers: Dictionary = {}  # empire_id -> AIController

var _next_planet_id: int = 0
var _next_system_id: int = 0
var _next_fleet_id: int = 0
var _next_empire_id: int = 0

# Galaxy generation parameters
const GALAXY_RADIUS: float = 50.0
const MIN_SYSTEM_DISTANCE: float = 6.0
const SYSTEM_COUNT: int = 30
const MIN_PLANETS_PER_SYSTEM: int = 5
const MAX_PLANETS_PER_SYSTEM: int = 15
const MIN_PLANET_SIZE: int = 30
const MAX_PLANET_SIZE: int = 350
const AI_EMPIRE_COUNT: int = 3

const EMPIRE_COLORS: Array[Color] = [
	Color(0.2, 0.5, 1.0),   # Player: blue
	Color(1.0, 0.3, 0.3),   # AI 1: red
	Color(0.3, 0.9, 0.3),   # AI 2: green
	Color(1.0, 0.8, 0.2),   # AI 3: yellow
]

const STAR_NAMES: Array[String] = [
	"Sol", "Alpha", "Vega", "Rigel", "Antares", "Polaris", "Sirius", "Capella",
	"Deneb", "Altair", "Betelgeuse", "Castor", "Pollux", "Regulus", "Spica",
	"Fomalhaut", "Aldebaran", "Arcturus", "Procyon", "Achernar", "Canopus",
	"Bellatrix", "Alnilam", "Mintaka", "Saiph", "Elnath", "Mizar", "Dubhe",
	"Alkaid", "Merak", "Phecda", "Megrez", "Alioth", "Etamin", "Rasalhague",
	"Sabik", "Kochab", "Thuban", "Alderamin", "Mirfak", "Hamal", "Diphda",
]

const PLANET_PREFIXES: Array[String] = [
	"Nova", "Terra", "Astra", "Cryo", "Ferro", "Aqua", "Pyro", "Nebula",
]


func clear() -> void:
	empires.clear()
	systems.clear()
	planets.clear()
	fleets.clear()
	ai_controllers.clear()
	_next_planet_id = 0
	_next_system_id = 0
	_next_fleet_id = 0
	_next_empire_id = 0


# --- Lookups ---

func get_empire(id: int) -> Empire:
	for e in empires:
		if e.id == id:
			return e
	return null


func get_player_empire() -> Empire:
	for e in empires:
		if e.is_player:
			return e
	return null


func get_system(id: int) -> SolarSystem:
	for s in systems:
		if s.id == id:
			return s
	return null


func get_planet(id: int) -> Planet:
	for p in planets:
		if p.id == id:
			return p
	return null


func get_planets_in_system(system_id: int) -> Array[Planet]:
	var result: Array[Planet] = []
	for p in planets:
		if p.system_id == system_id:
			result.append(p)
	return result


func get_planets_for_empire(empire_id: int) -> Array[Planet]:
	var result: Array[Planet] = []
	for p in planets:
		if p.owner_id == empire_id:
			result.append(p)
	return result


func get_system_owner(system_id: int) -> int:
	## Returns the empire_id that owns the most planets in this system, or -1 if all uncolonized.
	var counts: Dictionary = {}
	for p in get_planets_in_system(system_id):
		if p.owner_id >= 0:
			counts[p.owner_id] = counts.get(p.owner_id, 0) + 1
	if counts.is_empty():
		return -1
	var best_id := -1
	var best_count := 0
	for eid in counts:
		if counts[eid] > best_count:
			best_count = counts[eid]
			best_id = eid
	return best_id


func get_fleets_for_empire(empire_id: int) -> Array[Fleet]:
	var result: Array[Fleet] = []
	for f in fleets:
		if f.owner_id == empire_id:
			result.append(f)
	return result


func calc_travel_ticks(from_system_id: int, to_system_id: int) -> int:
	var from_sys := get_system(from_system_id)
	var to_sys := get_system(to_system_id)
	if from_sys == null or to_sys == null:
		return 1
	if from_system_id == to_system_id:
		return 1
	var dist := from_sys.position.distance_to(to_sys.position)
	return maxi(int(ceil(dist)), 1)


func calc_empire_networth(empire_id: int) -> float:
	var empire := get_empire(empire_id)
	if empire == null:
		return 0.0
	var nw: float = empire.calc_networth_base()
	var empire_planets := get_planets_for_empire(empire_id)
	nw += empire_planets.size() * 800.0
	for p in empire_planets:
		nw += p.get_total_buildings() * 4.0
		nw += p.population / 40.0
		# Units on planets
		nw += p.units.get("fighter", 0) * 3.0
		nw += p.units.get("bomber", 0) * 5.0
		nw += p.units.get("soldier", 0) * 1.0
		nw += p.units.get("droid", 0) * 1.0
		nw += p.units.get("transport", 0) * 6.0
	# Units in fleets
	for f in get_fleets_for_empire(empire_id):
		nw += f.units.get("fighter", 0) * 3.0
		nw += f.units.get("bomber", 0) * 5.0
		nw += f.units.get("soldier", 0) * 1.0
		nw += f.units.get("droid", 0) * 1.0
		nw += f.units.get("transport", 0) * 6.0
	return nw


func next_fleet_id() -> int:
	_next_fleet_id += 1
	return _next_fleet_id - 1


# --- Galaxy Generation ---

func generate_galaxy() -> void:
	clear()
	var rng := RandomNumberGenerator.new()
	rng.randomize()

	# Generate system positions
	var positions: Array[Vector2] = []
	_generate_system_positions(rng, positions)

	# Create systems and their planets
	for i in positions.size():
		var sys_id := _next_system_id
		_next_system_id += 1
		var sys_name: String = STAR_NAMES[i] if i < STAR_NAMES.size() else "System-%d" % sys_id
		var system := SolarSystem.create(sys_id, sys_name, positions[i])
		systems.append(system)

		var planet_count := rng.randi_range(MIN_PLANETS_PER_SYSTEM, MAX_PLANETS_PER_SYSTEM)
		for j in planet_count:
			var planet_id := _next_planet_id
			_next_planet_id += 1
			var planet_size := rng.randi_range(MIN_PLANET_SIZE, MAX_PLANET_SIZE)
			var planet_name := "%s %s" % [sys_name, _roman_numeral(j + 1)]
			var planet := Planet.create(planet_id, planet_name, sys_id, planet_size)

			# Random resource bonuses (~30% of planets)
			if rng.randf() < 0.3:
				var bonus_types := ["food", "iron", "endurium", "octarine"]
				var bonus_type: String = bonus_types[rng.randi_range(0, bonus_types.size() - 1)]
				planet.resource_bonuses[bonus_type] = rng.randf_range(1.1, 1.5)

			planets.append(planet)
			system.planet_ids.append(planet_id)

	# Create empires and assign home systems
	_create_empires(rng)

	print("Galaxy generated: %d systems, %d planets, %d empires" % [systems.size(), planets.size(), empires.size()])


func _generate_system_positions(rng: RandomNumberGenerator, positions: Array[Vector2]) -> void:
	var attempts := 0
	while positions.size() < SYSTEM_COUNT and attempts < 1000:
		var angle := rng.randf() * TAU
		var radius := rng.randf() * GALAXY_RADIUS
		var pos := Vector2(cos(angle) * radius, sin(angle) * radius)

		var too_close := false
		for existing in positions:
			if pos.distance_to(existing) < MIN_SYSTEM_DISTANCE:
				too_close = true
				break

		if not too_close:
			positions.append(pos)
		attempts += 1


func _create_empires(rng: RandomNumberGenerator) -> void:
	var total_empires := 1 + AI_EMPIRE_COUNT
	var home_system_indices: Array[int] = []

	# Pick home systems spread around the galaxy
	# Player gets a system near center, AI gets systems spread around
	var sorted_by_center: Array[int] = []
	for i in systems.size():
		sorted_by_center.append(i)
	sorted_by_center.sort_custom(func(a: int, b: int) -> bool:
		return systems[a].position.length() < systems[b].position.length()
	)

	# Player home: pick one of the closer systems (not the absolute center)
	var player_home_idx := sorted_by_center[rng.randi_range(2, mini(6, sorted_by_center.size() - 1))]
	home_system_indices.append(player_home_idx)

	# AI homes: spread around, picking systems far from each other and from player
	for _i in AI_EMPIRE_COUNT:
		var best_idx := -1
		var best_min_dist := 0.0
		for candidate_idx in sorted_by_center:
			if candidate_idx in home_system_indices:
				continue
			var min_dist := INF
			for home_idx in home_system_indices:
				var d := systems[candidate_idx].position.distance_to(systems[home_idx].position)
				min_dist = minf(min_dist, d)
			if min_dist > best_min_dist:
				best_min_dist = min_dist
				best_idx = candidate_idx
		if best_idx >= 0:
			home_system_indices.append(best_idx)

	# Create empire objects and set up home planets
	var empire_names := ["Player Empire", "Crimson Dominion", "Verdant Collective", "Golden Accord"]
	for i in total_empires:
		var eid := _next_empire_id
		_next_empire_id += 1
		var is_player := (i == 0)
		var ename: String = empire_names[i] if i < empire_names.size() else "Empire %d" % eid
		var ecolor: Color = EMPIRE_COLORS[i] if i < EMPIRE_COLORS.size() else Color.WHITE
		var empire := Empire.create(eid, ename, is_player, ecolor)

		var home_sys := systems[home_system_indices[i]]
		empire.home_system_id = home_sys.id

		# Pick the largest planet in the home system as home planet
		var sys_planets := get_planets_in_system(home_sys.id)
		sys_planets.sort_custom(func(a: Planet, b: Planet) -> bool: return a.size > b.size)
		var home_planet: Planet = sys_planets[0]
		home_planet.owner_id = eid
		home_planet.population = home_planet.size * 10
		# Starting buildings
		home_planet.buildings = {
			"mine": 3,
			"farm": 3,
			"cash_factory": 2,
			"refinery": 1,
			"research_center": 1,
			"living_quarter": 1,
		}
		empire.home_planet_id = home_planet.id

		# Starting resources
		empire.resources = {
			"gc": 5000,
			"food": 6000,
			"iron": 500,
			"endurium": 50,
			"octarine": 25,
		}

		# Starting military
		home_planet.units = {
			"fighter": 20,
			"bomber": 0,
			"soldier": 50,
			"droid": 0,
			"transport": 1,
		}

		empires.append(empire)

		# Create AI controller for non-player empires
		if not is_player:
			ai_controllers[eid] = AIController.create(empire)

	print("Empires created: %d (Player: %s, AI: %d)" % [empires.size(), empires[0].empire_name, ai_controllers.size()])


func _roman_numeral(n: int) -> String:
	match n:
		1: return "I"
		2: return "II"
		3: return "III"
		4: return "IV"
		5: return "V"
		6: return "VI"
		7: return "VII"
		8: return "VIII"
		9: return "IX"
		10: return "X"
		11: return "XI"
		12: return "XII"
		13: return "XIII"
		14: return "XIV"
		15: return "XV"
		_: return str(n)
