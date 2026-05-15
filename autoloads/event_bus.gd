extends Node
## Central signal hub for decoupled communication between systems.

# Tick system
signal tick_processed(tick_number: int)
signal speed_changed(new_speed: int)

# Selection
signal planet_selected(planet: Resource)
signal system_selected(system: Resource)
signal selection_cleared()

# Fleet events
signal fleet_launched(fleet: Resource)
signal fleet_arrived(fleet: Resource)

# Combat
signal battle_resolved(report: Dictionary)

# Building
signal building_completed(planet: Resource, building_type: String)
signal building_queued(planet: Resource, building_type: String)

# Empire events
signal empire_eliminated(empire: Resource)

# Colonization
signal planet_colonized(planet: Resource, empire: Resource)

# Notifications
signal notification_posted(message: String, type: String)

# Game lifecycle
signal game_started()

# Special operations
signal operation_performed(report: Dictionary)

# Resource updates (for immediate UI refresh after purchases)
signal resources_changed()
