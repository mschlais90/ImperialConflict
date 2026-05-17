import { UNITS } from '../data/units';
import type { CombatUnitKey, Empire, Fleet, Planet, PlanetUnitKey, SolarSystem } from '../models/types';
import type { GameState } from '../galaxy/galaxyData';

const PLANET_NETWORTH_UNITS: PlanetUnitKey[] = [
  'fighter',
  'bomber',
  'soldier',
  'droid',
  'transport',
  'agent',
  'wizard',
];

const FLEET_NETWORTH_UNITS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];

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

export function getFleetsForEmpire(state: GameState, empireId: number): Fleet[] {
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
    for (const unit of PLANET_NETWORTH_UNITS) {
      networth += (planet.units[unit] ?? 0) * UNITS[unit].networth;
    }
  }

  for (const fleet of getFleetsForEmpire(state, empireId)) {
    for (const unit of FLEET_NETWORTH_UNITS) {
      networth += (fleet.units[unit] ?? 0) * UNITS[unit].networth;
    }
  }

  return networth;
}
