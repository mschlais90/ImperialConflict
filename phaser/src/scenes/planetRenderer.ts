/**
 * Procedural planet renderer using Canvas2D.
 * Mirrors the Godot planet shader: resource bonus determines planet style.
 * iron=Mars, food=Earth, octarine=Uranus, endurium=Venus.
 * No bonus cycles through Neptune, Jupiter, Pluto, Mercury.
 */

import type { Planet } from '../core/models/types';

// Planet type: 0=Mars, 1=Earth, 2=Uranus, 3=Venus, 4=Neptune, 5=Jupiter, 6=Pluto, 7=Mercury
const NO_BONUS_TYPES = [4, 5, 6, 7];

type PlanetPalette = {
  colors: [number, number, number][];
  rimColor: [number, number, number];
  noiseStyle: 'default' | 'bands' | 'swirl' | 'cratered' | 'subtle-bands';
};

const PALETTES: PlanetPalette[] = [
  // 0: Mars (iron)
  {
    colors: [[153, 51, 26], [217, 115, 51], [179, 77, 38]],
    rimColor: [128, 102, 77],
    noiseStyle: 'default',
  },
  // 1: Earth (food)
  {
    colors: [[26, 77, 179], [51, 140, 51], [230, 235, 242]],
    rimColor: [77, 128, 255],
    noiseStyle: 'default',
  },
  // 2: Uranus (octarine)
  {
    colors: [[128, 204, 217], [153, 224, 230], [102, 179, 199]],
    rimColor: [102, 204, 230],
    noiseStyle: 'subtle-bands',
  },
  // 3: Venus (endurium)
  {
    colors: [[217, 179, 77], [230, 204, 128], [191, 140, 64]],
    rimColor: [230, 179, 77],
    noiseStyle: 'swirl',
  },
  // 4: Neptune
  {
    colors: [[26, 38, 153], [51, 77, 204], [38, 51, 140]],
    rimColor: [51, 77, 230],
    noiseStyle: 'default',
  },
  // 5: Jupiter
  {
    colors: [[179, 128, 77], [217, 179, 128], [153, 102, 64]],
    rimColor: [128, 102, 77],
    noiseStyle: 'bands',
  },
  // 6: Pluto
  {
    colors: [[140, 128, 115], [179, 173, 153], [115, 107, 102]],
    rimColor: [128, 115, 102],
    noiseStyle: 'cratered',
  },
  // 7: Mercury
  {
    colors: [[89, 84, 77], [140, 135, 128], [102, 97, 89]],
    rimColor: [128, 102, 77],
    noiseStyle: 'cratered',
  },
];

function getPlanetType(planet: Planet): number {
  if (planet.resourceBonuses.iron) return 0;
  if (planet.resourceBonuses.food) return 1;
  if (planet.resourceBonuses.octarine) return 2;
  if (planet.resourceBonuses.endurium) return 3;
  return NO_BONUS_TYPES[planet.id % NO_BONUS_TYPES.length];
}

function seedHash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise2d(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  let fx = px - ix;
  let fy = py - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = seedHash(ix, iy);
  const b = seedHash(ix + 1, iy);
  const c = seedHash(ix, iy + 1);
  const d = seedHash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(px: number, py: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let x = px;
  let y = py;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise2d(x, y);
    x *= 2;
    y *= 2;
    amp *= 0.5;
  }
  return val;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number,
): [number, number, number] {
  return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
}

function getColor(n: number, palette: PlanetPalette): [number, number, number] {
  const [c1, c2, c3] = palette.colors;
  const mid = mixColor(c1, c2, smoothstep(0.3, 0.6, n));
  return mixColor(mid, c3, smoothstep(0.6, 0.9, n));
}

function getSurfaceNoise(
  _sx: number,
  sy: number,
  nx: number,
  ny: number,
  style: PlanetPalette['noiseStyle'],
): number {
  switch (style) {
    case 'bands': {
      const bands = Math.sin(sy * 20 + fbm(nx * 0.5, ny * 0.5) * 2) * 0.5 + 0.5;
      return mix(bands, fbm(nx, ny), 0.3);
    }
    case 'subtle-bands': {
      const bands = Math.sin(sy * 12) * 0.5 + 0.5;
      return mix(bands, fbm(nx * 0.8, ny * 0.8), 0.4);
    }
    case 'swirl': {
      return fbm(nx + fbm(nx * 1.5, ny * 1.5), ny + fbm(nx * 1.2, ny * 1.2));
    }
    case 'cratered': {
      const base = fbm(nx * 1.5, ny * 1.5);
      const craters = 1 - smoothstep(0, 0.15, Math.abs(noise2d(nx * 8, ny * 8) - 0.5));
      return mix(base, base - craters * 0.3, 0.5);
    }
    default:
      return fbm(nx, ny);
  }
}

/** Render a planet to an offscreen canvas and return it. */
export function renderPlanetCanvas(planet: Planet, diameter: number): HTMLCanvasElement {
  const size = Math.max(Math.round(diameter), 4);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  const planetType = getPlanetType(planet);
  const palette = PALETTES[planetType];
  const seedVal = ((planet.id * 7.31) % 100);
  const r = size / 2;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const ux = (px / r) - 1;
      const uy = (py / r) - 1;
      const dist = Math.sqrt(ux * ux + uy * uy);

      if (dist > 1) continue;

      const z = Math.sqrt(1 - dist * dist);

      // Sphere UV mapping
      const su = Math.atan2(ux, z) / Math.PI + 0.5;
      const sv = Math.asin(Math.max(-1, Math.min(1, uy))) / Math.PI + 0.5;

      // Noise coordinates
      const nx = su * 6 + seedVal;
      const ny = sv * 6 + seedVal * 0.7;

      const n = getSurfaceNoise(su, sv, nx, ny, palette.noiseStyle);
      const col = getColor(n, palette);

      // Lighting
      const lx = -0.5, ly = -0.5, lz = 1.0;
      const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const diffuse = Math.max((ux * lx / ll + uy * ly / ll + z * lz / ll), 0);
      const lit = 0.3 + diffuse * 0.7;

      // Atmosphere rim glow
      const rim = Math.pow(1 - z, 3) * 0.4;
      const rc = palette.rimColor;

      const idx = (py * size + px) * 4;
      data[idx] = Math.min(255, Math.round(col[0] * lit + rc[0] * rim));
      data[idx + 1] = Math.min(255, Math.round(col[1] * lit + rc[1] * rim));
      data[idx + 2] = Math.min(255, Math.round(col[2] * lit + rc[2] * rim));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate a unique texture key for a planet. */
export function planetTextureKey(planet: Planet): string {
  return `planet_${planet.id}`;
}

/**
 * Ensure a planet texture exists in the Phaser texture manager.
 * Returns the texture key.
 */
export function ensurePlanetTexture(
  scene: Phaser.Scene,
  planet: Planet,
  diameter: number,
): string {
  const key = planetTextureKey(planet);
  if (scene.textures.exists(key)) {
    return key;
  }
  const canvas = renderPlanetCanvas(planet, diameter);
  scene.textures.addCanvas(key, canvas);
  return key;
}
