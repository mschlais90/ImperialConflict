class_name ScienceData
## Static data for the 5 research sciences.

const SCIENCES: Dictionary = {
	"military": {
		"name": "Military",
		"description": "Increases attack and defense strength.",
	},
	"welfare": {
		"name": "Welfare",
		"description": "Increases maximum population.",
	},
	"economy": {
		"name": "Economy",
		"description": "Increases income.",
	},
	"construction": {
		"name": "Construction",
		"description": "Reduces building costs and build times.",
	},
	"resources": {
		"name": "Resources",
		"description": "Increases resource production rates.",
	},
}

static func get_all_ids() -> Array:
	return SCIENCES.keys()
