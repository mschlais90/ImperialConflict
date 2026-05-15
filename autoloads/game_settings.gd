extends Node
## Global game settings. Persists across the session.

var show_combat_popups: bool = true

# Battle history — stores all reports involving the player
var battle_history: Array[Dictionary] = []
const MAX_HISTORY := 100


func add_battle_report(report: Dictionary) -> void:
	battle_history.push_front(report)
	if battle_history.size() > MAX_HISTORY:
		battle_history.resize(MAX_HISTORY)


func clear_history() -> void:
	battle_history.clear()
