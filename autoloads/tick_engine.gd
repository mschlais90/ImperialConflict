extends Node
## Timer-driven tick system with speed control.
## Each tick advances the game simulation by one step.

const BASE_TICK_SECONDS: float = 2.0

enum Speed { PAUSED = 0, NORMAL = 1, FAST = 2, FASTEST = 4 }

var current_tick: int = 0
var current_speed: int = Speed.NORMAL

var _timer: Timer


func _ready() -> void:
	_timer = Timer.new()
	_timer.one_shot = true
	_timer.timeout.connect(_on_timer_timeout)
	add_child(_timer)


func start() -> void:
	if current_speed > 0:
		_timer.start(BASE_TICK_SECONDS / current_speed)


func stop() -> void:
	_timer.stop()


func set_speed(speed: int) -> void:
	current_speed = speed
	EventBus.speed_changed.emit(current_speed)
	if speed == Speed.PAUSED:
		_timer.stop()
	else:
		# Restart timer with new interval
		_timer.stop()
		_timer.start(BASE_TICK_SECONDS / speed)


func _on_timer_timeout() -> void:
	current_tick += 1
	EconomyEngine.process_tick(current_tick)
	EventBus.tick_processed.emit(current_tick)
	# Restart timer for next tick
	if current_speed > 0:
		_timer.start(BASE_TICK_SECONDS / current_speed)
