shader_type canvas_item;

// Planet type: 0=Mars(iron), 1=Earth(food), 2=Uranus(octarine), 3=Venus(endurium), 4=Neptune, 5=Jupiter, 6=Pluto, 7=Mercury
uniform int planet_type : hint_range(0, 7) = 4;
uniform float seed_val : hint_range(0.0, 100.0) = 0.0;

// Simplex-like noise
float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float val = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 5; i++) {
		val += amp * noise(p);
		p *= 2.0;
		amp *= 0.5;
	}
	return val;
}

vec3 get_planet_color(float n, int ptype) {
	if (ptype == 0) {
		// Mars - iron bonus: reds, oranges, rust
		vec3 c1 = vec3(0.6, 0.2, 0.1);
		vec3 c2 = vec3(0.85, 0.45, 0.2);
		vec3 c3 = vec3(0.7, 0.3, 0.15);
		return mix(mix(c1, c2, smoothstep(0.3, 0.6, n)), c3, smoothstep(0.6, 0.9, n));
	} else if (ptype == 1) {
		// Earth - food bonus: blues, greens, whites
		vec3 ocean = vec3(0.1, 0.3, 0.7);
		vec3 land = vec3(0.2, 0.55, 0.2);
		vec3 snow = vec3(0.9, 0.92, 0.95);
		vec3 col = mix(ocean, land, smoothstep(0.45, 0.55, n));
		col = mix(col, snow, smoothstep(0.75, 0.85, n));
		return col;
	} else if (ptype == 2) {
		// Uranus - octarine bonus: pale cyan/blue, subtle bands
		vec3 c1 = vec3(0.5, 0.8, 0.85);
		vec3 c2 = vec3(0.6, 0.88, 0.9);
		vec3 c3 = vec3(0.4, 0.7, 0.78);
		return mix(mix(c1, c2, smoothstep(0.3, 0.5, n)), c3, smoothstep(0.7, 0.9, n));
	} else if (ptype == 3) {
		// Venus - endurium bonus: yellows, oranges, hazy
		vec3 c1 = vec3(0.85, 0.7, 0.3);
		vec3 c2 = vec3(0.9, 0.8, 0.5);
		vec3 c3 = vec3(0.75, 0.55, 0.25);
		return mix(mix(c1, c2, smoothstep(0.3, 0.6, n)), c3, smoothstep(0.6, 0.85, n));
	} else if (ptype == 4) {
		// Neptune - deep blue with subtle bands
		vec3 c1 = vec3(0.1, 0.15, 0.6);
		vec3 c2 = vec3(0.2, 0.3, 0.8);
		vec3 c3 = vec3(0.15, 0.2, 0.55);
		return mix(mix(c1, c2, smoothstep(0.3, 0.6, n)), c3, smoothstep(0.6, 0.9, n));
	} else if (ptype == 5) {
		// Jupiter - tan/orange bands
		vec3 c1 = vec3(0.7, 0.5, 0.3);
		vec3 c2 = vec3(0.85, 0.7, 0.5);
		vec3 c3 = vec3(0.6, 0.4, 0.25);
		return mix(mix(c1, c2, smoothstep(0.3, 0.5, n)), c3, smoothstep(0.6, 0.85, n));
	} else if (ptype == 6) {
		// Pluto - grey/tan, icy
		vec3 c1 = vec3(0.55, 0.5, 0.45);
		vec3 c2 = vec3(0.7, 0.68, 0.6);
		vec3 c3 = vec3(0.45, 0.42, 0.4);
		return mix(mix(c1, c2, smoothstep(0.3, 0.6, n)), c3, smoothstep(0.6, 0.9, n));
	} else {
		// Mercury - grey, cratered
		vec3 c1 = vec3(0.35, 0.33, 0.3);
		vec3 c2 = vec3(0.55, 0.53, 0.5);
		vec3 c3 = vec3(0.4, 0.38, 0.35);
		return mix(mix(c1, c2, smoothstep(0.25, 0.5, n)), c3, smoothstep(0.6, 0.9, n));
	}
}

void fragment() {
	vec2 uv = UV * 2.0 - 1.0;
	float dist = length(uv);

	// Discard outside circle
	if (dist > 1.0) {
		discard;
	}

	// Sphere mapping - fake 3D by wrapping UVs onto a sphere
	float z = sqrt(1.0 - dist * dist);
	vec2 sphere_uv = vec2(atan(uv.x, z) / PI, asin(uv.y) / PI) + 0.5;

	// Generate surface noise
	vec2 noise_coord = sphere_uv * 6.0 + vec2(seed_val, seed_val * 0.7);
	float n;

	if (planet_type == 5) {
		// Jupiter: horizontal bands
		float bands = sin(sphere_uv.y * 20.0 + fbm(noise_coord * 0.5) * 2.0) * 0.5 + 0.5;
		n = mix(bands, fbm(noise_coord), 0.3);
	} else if (planet_type == 2) {
		// Uranus: very subtle bands
		float bands = sin(sphere_uv.y * 12.0) * 0.5 + 0.5;
		n = mix(bands, fbm(noise_coord * 0.8), 0.4);
	} else if (planet_type == 3) {
		// Venus: swirly clouds
		float swirl = fbm(noise_coord + vec2(fbm(noise_coord * 1.5), fbm(noise_coord * 1.2)));
		n = swirl;
	} else if (planet_type == 7) {
		// Mercury: cratered look
		float base = fbm(noise_coord * 1.5);
		float craters = 1.0 - smoothstep(0.0, 0.15, abs(noise(noise_coord * 8.0) - 0.5));
		n = mix(base, base - craters * 0.3, 0.5);
	} else {
		n = fbm(noise_coord);
	}

	vec3 col = get_planet_color(n, planet_type);

	// Lighting: simple directional light from top-left
	vec3 normal = vec3(uv, z);
	vec3 light_dir = normalize(vec3(-0.5, -0.5, 1.0));
	float diffuse = max(dot(normal, light_dir), 0.0);
	float ambient = 0.3;
	float lit = ambient + diffuse * 0.7;

	col *= lit;

	// Atmosphere rim glow
	float rim = 1.0 - z;
	rim = pow(rim, 3.0);
	vec3 rim_color;
	if (planet_type == 1) rim_color = vec3(0.3, 0.5, 1.0);
	else if (planet_type == 3) rim_color = vec3(0.9, 0.7, 0.3);
	else if (planet_type == 2) rim_color = vec3(0.4, 0.8, 0.9);
	else if (planet_type == 4) rim_color = vec3(0.2, 0.3, 0.9);
	else rim_color = vec3(0.5, 0.4, 0.3);
	col += rim_color * rim * 0.4;

	COLOR = vec4(col, 1.0);
}
