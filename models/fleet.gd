class_name Fleet
extends Resource
## A fleet in transit between systems/planets.

@export var id: int = 0
@export var owner_id: int = 0
@export var units: Dictionary = {
	"fighter": 0,
	"bomber": 0,
	"soldier": 0,
	"droid": 0,
	"transport": 0,
}
@export var origin_system_id: int = 0
@export var target_system_id: int = 0
@export var target_planet_id: int = 0
@export var ticks_remaining: int = 0
@export var is_exploration: bool = false  # True if this is an explorer ship colonizing


func get_total_units() -> int:
	var total := 0
	for count in units.values():
		total += count
	return total


static func create(p_id: int, p_owner: int, p_units: Dictionary, p_origin: int, p_target_sys: int, p_target_planet: int, p_ticks: int) -> Fleet:
	var fleet := Fleet.new()
	fleet.id = p_id
	fleet.owner_id = p_owner
	fleet.units = p_units.duplicate()
	fleet.origin_system_id = p_origin
	fleet.target_system_id = p_target_sys
	fleet.target_planet_id = p_target_planet
	fleet.ticks_remaining = p_ticks
	return fleet
