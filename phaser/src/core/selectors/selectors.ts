import type { CombatUnitKey, Empire, Planet, PlanetUnitKey, SolarSystem } from '../models/types';
import type { GameState } from '../galaxy/galaxyData';

const PLANET_UNIT_NETWORTH: Record<PlanetUnitKey, number> = {
  fighter: 3,
  bomber: 5,
  soldier: 1,
  droid: 1,
  transport: 6,
  agent: 1,
  wizard: 1,
};

const FLEET_UNIT_NETWORTH: Record<CombatUnitKey, number> = {
  fighter: 3,
  bomber: 5,
  soldier: 1,
  droid: 1,
  transport: 6,
};

export function getEmpire(state: GameState, empireId: number): Empire | undefined {
  return state.empires.find((empire) => empire.id === empireId);
}

export function getPlayerEmpire(state: GameState): Empire | undefined {
  return state.empires.find((empire) => empire.isPlayer);
}

export function getSystem(state: GameState, systemId: number): SolarSystem | undefined {
  return state.systems.find((system) => system.id === systemId);
}

export function getPlanet(state: GameState, planetId: number): Planet | undefined {
  return state.planets.find((planet) => planet.id === planetId);
}

export function getPlanetsInSystem(state: GameState, systemId: number): Planet[] {
  return state.planets.filter((planet) => planet.systemId === systemId);
}

export function getPlanetsForEmpire(state: GameState, empireId: number): Planet[] {
  return state.planets.filter((planet) => planet.ownerId === empireId);
}

export function getSystemOwner(state: GameState, systemId: number): number {
  const counts = new Map<number, number>();
  for (const planet of getPlanetsInSystem(state, systemId)) {
    if (planet.ownerId >= 0) {
      counts.set(planet.ownerId, (counts.get(planet.ownerId) ?? 0) + 1);
    }
  }

  let bestId = -1;
  let bestCount = 0;
  for (const [empireId, count] of counts) {
    if (count > bestCount) {
      bestId = empireId;
      bestCount = count;
    }
  }

  return bestId;
}

export function getFleetsForEmpire(state: GameState, empireId: number) {
  return state.fleets.filter((fleet) => fleet.ownerId === empireId);
}

export function calcTravelTicks(state: GameState, fromSystemId: number, toSystemId: number): number {
  const fromSystem = getSystem(state, fromSystemId);
  const toSystem = getSystem(state, toSystemId);
  if (fromSystem === undefined || toSystem === undefined || fromSystemId === toSystemId) {
    return 1;
  }

  const dx = fromSystem.position.x - toSystem.position.x;
  const dy = fromSystem.position.y - toSystem.position.y;
  return Math.max(Math.ceil(Math.hypot(dx, dy)), 1);
}

export function calcEmpireNetworth(state: GameState, empireId: number): number {
  const empire = getEmpire(state, empireId);
  if (empire === undefined) {
    return 0;
  }

  let networth = 1100;
  networth += Object.values(empire.researchPoints).reduce((total, points) => total + points, 0) / 1000;

  const empirePlanets = getPlanetsForEmpire(state, empireId);
  networth += empirePlanets.length * 800;
  for (const planet of empirePlanets) {
    networth += Object.values(planet.buildings).reduce((total, count) => total + (count ?? 0), 0) * 4;
    networth += planet.population / 40;
    for (const [unit, value] of Object.entries(PLANET_UNIT_NETWORTH) as Array<[PlanetUnitKey, number]>) {
      networth += (planet.units[unit] ?? 0) * value;
    }
  }

  for (const fleet of getFleetsForEmpire(state, empireId)) {
    for (const [unit, value] of Object.entries(FLEET_UNIT_NETWORTH) as Array<[CombatUnitKey, number]>) {
      networth += (fleet.units[unit] ?? 0) * value;
    }
  }

  return networth;
}
