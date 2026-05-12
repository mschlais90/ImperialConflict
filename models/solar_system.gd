class_name SolarSystem
extends Resource
## A solar system at a position in the galaxy, containing planets.

@export var id: int = 0
@export var system_name: String = ""
@export var position: Vector2 = Vector2.ZERO  # Galaxy map coordinates
@export var planet_ids: Array[int] = []


static func create(p_id: int, p_name: String, pos: Vector2) -> SolarSystem:
	var system := SolarSystem.new()
	system.id = p_id
	system.system_name = p_name
	system.position = pos
	return system
