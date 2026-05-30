import { createEmptyGameState, type GameState } from '../galaxy/galaxyData';
import { appendEvent } from '../events/eventLog';
import {
  createEmpire,
  createPlanet,
  type BonusKey,
  type Empire,
  type Planet,
  type SolarSystem,
} from '../models/types';
import { createSeededRng, type Rng } from '../random/rng';
import { getPlanetsInSystem } from '../selectors/selectors';

export interface NewGameOptions {
  empireName?: string;
  seed?: number;
  /** Total number of empires (human + AI). Defaults to 1 + AI_EMPIRE_COUNT. */
  empireCount?: number;
}

const GALAXY_RADIUS = 50;
const MIN_SYSTEM_DISTANCE = 6;
const SYSTEM_COUNT = 30;
const MIN_PLANETS_PER_SYSTEM = 5;
const MAX_PLANETS_PER_SYSTEM = 15;
const MIN_PLANET_SIZE = 90;
const MAX_PLANET_SIZE = 350;
const AI_EMPIRE_COUNT = 3;

const EMPIRE_COLORS = ['#3380ff', '#ff4d4d', '#4de64d', '#ffcc33', '#cc66ff', '#ff8833'] as const;

const STAR_NAMES = [
  'Sol',
  'Alpha',
  'Vega',
  'Rigel',
  'Antares',
  'Polaris',
  'Sirius',
  'Capella',
  'Deneb',
  'Altair',
  'Betelgeuse',
  'Castor',
  'Pollux',
  'Regulus',
  'Spica',
  'Fomalhaut',
  'Aldebaran',
  'Arcturus',
  'Procyon',
  'Achernar',
  'Canopus',
  'Bellatrix',
  'Alnilam',
  'Mintaka',
  'Saiph',
  'Elnath',
  'Mizar',
  'Dubhe',
  'Alkaid',
  'Merak',
  'Phecda',
  'Megrez',
  'Alioth',
  'Etamin',
  'Rasalhague',
  'Sabik',
  'Kochab',
  'Thuban',
  'Alderamin',
  'Mirfak',
  'Hamal',
  'Diphda',
] as const;

const ALL_BONUS_KEYS: BonusKey[] = ['food', 'iron', 'endurium', 'octarine', 'gc', 'research', 'population_growth', 'defense'];

const EMPIRE_NAMES = ['Crimson Dominion', 'Verdant Collective', 'Golden Accord'] as const;

export function createNewGame(options: NewGameOptions = {}): GameState {
  const state = createEmptyGameState();
  const rng = createSeededRng(options.seed ?? Date.now());
  const playerEmpireName = options.empireName ?? 'Player Empire';
  const empireCount = options.empireCount ?? 1 + AI_EMPIRE_COUNT;
  state.rng = rng;

  state.currentState = 'playing';
  state.currentTick = 0;
  state.currentSpeed = 0;

  generateGalaxy(state, rng, playerEmpireName, empireCount);
  appendEvent(state, { type: 'game_started', tick: state.currentTick, empireName: playerEmpireName });

  return state;
}

function generateGalaxy(state: GameState, rng: Rng, playerEmpireName: string, empireCount: number): void {
  const positions = generateSystemPositions(rng);
  invariant(
    positions.length === SYSTEM_COUNT,
    `Expected ${SYSTEM_COUNT} generated system positions, got ${positions.length}.`,
  );

  for (const [index, position] of positions.entries()) {
    const systemId = state.nextSystemId;
    state.nextSystemId += 1;
    const systemName = STAR_NAMES[index] ?? `System-${systemId}`;
    const system: SolarSystem = { id: systemId, systemName, position, planetIds: [] };
    state.systems.push(system);

    const planetCount = rng.intRange(MIN_PLANETS_PER_SYSTEM, MAX_PLANETS_PER_SYSTEM);
    const systemPlanetsStart = state.planets.length;
    for (let planetIndex = 0; planetIndex < planetCount; planetIndex += 1) {
      const planetId = state.nextPlanetId;
      state.nextPlanetId += 1;
      const planet = createPlanet({
        id: planetId,
        planetName: `${systemName} ${romanNumeral(planetIndex + 1)}`,
        systemId,
        size: rng.intRange(MIN_PLANET_SIZE, MAX_PLANET_SIZE),
      });

      // Every planet gets one random bonus (1–5%)
      const bonusKey = rng.pick(ALL_BONUS_KEYS);
      planet.resourceBonuses[bonusKey] = rng.floatRange(1.01, 1.05);

      state.planets.push(planet);
      system.planetIds.push(planetId);
    }

    // One randomly chosen planet per system gets a second distinct bonus
    const systemPlanets = state.planets.slice(systemPlanetsStart);
    if (systemPlanets.length > 0) {
      const doublePlanet = rng.pick(systemPlanets);
      const existingKey = Object.keys(doublePlanet.resourceBonuses)[0] as BonusKey | undefined;
      const remaining = ALL_BONUS_KEYS.filter((k) => k !== existingKey);
      if (remaining.length > 0) {
        doublePlanet.resourceBonuses[rng.pick(remaining)] = rng.floatRange(1.01, 1.05);
      }
    }
  }

  createEmpires(state, rng, playerEmpireName, empireCount);
}

function generateSystemPositions(rng: Rng): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  let attempts = 0;

  while (positions.length < SYSTEM_COUNT && attempts < 1000) {
    const angle = rng.float() * Math.PI * 2;
    const radius = rng.float() * GALAXY_RADIUS;
    const position = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };

    const tooClose = positions.some(
      (existing) => Math.hypot(position.x - existing.x, position.y - existing.y) < MIN_SYSTEM_DISTANCE,
    );
    if (!tooClose) {
      positions.push(position);
    }

    attempts += 1;
  }

  return positions;
}

function createEmpires(state: GameState, rng: Rng, playerEmpireName: string, totalEmpires: number): void {
  const homeSystemIndices: number[] = [];
  const sortedByCenter = state.systems
    .map((_, index) => index)
    .sort((a, b) => systemDistanceFromCenter(state.systems[a]) - systemDistanceFromCenter(state.systems[b]));
  invariant(
    sortedByCenter.length > 2,
    `Expected at least 3 systems to select a player home, got ${sortedByCenter.length}.`,
  );

  const playerHomeIdx = sortedByCenter[rng.intRange(2, Math.min(6, sortedByCenter.length - 1))];
  invariant(playerHomeIdx !== undefined, 'Unable to select a player home system.');
  homeSystemIndices.push(playerHomeIdx);

  for (let i = 0; i < totalEmpires - 1; i += 1) {
    let bestIdx = -1;
    let bestMinDist = 0;

    for (const candidateIdx of sortedByCenter) {
      if (homeSystemIndices.includes(candidateIdx)) {
        continue;
      }

      let minDist = Number.POSITIVE_INFINITY;
      for (const homeIdx of homeSystemIndices) {
        minDist = Math.min(minDist, distanceBetweenSystems(state.systems[candidateIdx], state.systems[homeIdx]));
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestIdx = candidateIdx;
      }
    }

    if (bestIdx >= 0) {
      homeSystemIndices.push(bestIdx);
    }
  }
  invariant(
    homeSystemIndices.length === totalEmpires,
    `Expected ${totalEmpires} home systems, got ${homeSystemIndices.length}.`,
  );

  for (let i = 0; i < totalEmpires; i += 1) {
    const empireId = state.nextEmpireId;
    state.nextEmpireId += 1;
    const isHuman = i === 0;
    const empire = createEmpire({
      id: empireId,
      empireName: isHuman ? playerEmpireName : EMPIRE_NAMES[i - 1] ?? `Empire ${empireId}`,
      controllerType: isHuman ? 'human' : 'ai',
      color: EMPIRE_COLORS[i] ?? '#ffffff',
    });

    assignHomePlanet(state, empire, homeSystemIndices[i]);
    state.empires.push(empire);

    if (!isHuman) {
      state.aiControllers[empireId] = { empireId, recentAttacks: {} };
    }
  }
}

function assignHomePlanet(state: GameState, empire: Empire, homeSystemIndex: number): void {
  const homeSystem = state.systems[homeSystemIndex];
  invariant(homeSystem !== undefined, `Unable to find home system at index ${homeSystemIndex}.`);
  empire.homeSystemId = homeSystem.id;

  const [homePlanet] = [...getPlanetsInSystem(state, homeSystem.id)].sort((a, b) => b.size - a.size);
  invariant(homePlanet !== undefined, `Unable to find a home planet in system ${homeSystem.id}.`);
  setStartingPlanetState(homePlanet, empire.id);
  empire.homePlanetId = homePlanet.id;
  empire.resources = {
    gc: 5000,
    food: 10000,
    iron: 500,
    endurium: 50,
    octarine: 25,
  };
}

function setStartingPlanetState(planet: Planet, empireId: number): void {
  planet.ownerId = empireId;
  planet.size = 250;
  planet.population = planet.size * 10;
  planet.resourceBonuses = {};
  planet.buildings = {};
  planet.units = {};
}

function systemDistanceFromCenter(system: SolarSystem): number {
  return Math.hypot(system.position.x, system.position.y);
}

function distanceBetweenSystems(a: SolarSystem, b: SolarSystem): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function romanNumeral(n: number): string {
  switch (n) {
    case 1:
      return 'I';
    case 2:
      return 'II';
    case 3:
      return 'III';
    case 4:
      return 'IV';
    case 5:
      return 'V';
    case 6:
      return 'VI';
    case 7:
      return 'VII';
    case 8:
      return 'VIII';
    case 9:
      return 'IX';
    case 10:
      return 'X';
    case 11:
      return 'XI';
    case 12:
      return 'XII';
    case 13:
      return 'XIII';
    case 14:
      return 'XIV';
    case 15:
      return 'XV';
    default:
      return String(n);
  }
}
