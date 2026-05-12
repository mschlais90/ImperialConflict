extends Node
## Top-level game state machine.

enum State { MAIN_MENU, PLAYING, GAME_OVER }

var current_state: int = State.MAIN_MENU


var _eliminated_empires: Array[int] = []


func _ready() -> void:
	EventBus.empire_eliminated.connect(_on_empire_eliminated)
	# For now, auto-start a new game when the scene loads
	call_deferred("new_game")


func new_game() -> void:
	current_state = State.PLAYING
	_eliminated_empires.clear()
	GalaxyData.generate_galaxy()
	TickEngine.current_tick = 0
	TickEngine.set_speed(TickEngine.Speed.NORMAL)
	TickEngine.start()
	EventBus.game_started.emit()
	print("Game started!")


func _on_empire_eliminated(empire: Empire) -> void:
	if empire.id in _eliminated_empires:
		return
	_eliminated_empires.append(empire.id)

	# Remove AI controller
	GalaxyData.ai_controllers.erase(empire.id)

	if empire.is_player:
		EventBus.notification_posted.emit("Your empire has been destroyed!", "combat")
		end_game(false)
	else:
		EventBus.notification_posted.emit("%s has been eliminated!" % empire.empire_name, "combat")
		# Check if player is the last one standing
		var remaining_ai := 0
		for e in GalaxyData.empires:
			if not e.is_player and e.id not in _eliminated_empires:
				remaining_ai += 1
		if remaining_ai == 0:
			EventBus.notification_posted.emit("You have conquered the galaxy!", "combat")
			end_game(true)


func end_game(player_won: bool) -> void:
	current_state = State.GAME_OVER
	TickEngine.set_speed(TickEngine.Speed.PAUSED)
	if player_won:
		print("Victory! You have conquered the galaxy!")
	else:
		print("Defeat! Your empire has fallen.")
