class_name BuildOrder
extends Resource
## A queued building or unit under construction on a planet.

@export var building_type: String = ""
@export var ticks_remaining: int = 0
@export var category: String = "building"  # "building" or "unit"


static func create(type: String, ticks: int, p_category: String = "building") -> BuildOrder:
	var order := BuildOrder.new()
	order.building_type = type
	order.ticks_remaining = ticks
	order.category = p_category
	return order
