import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../core/engines/gameManager';
import { UNITS } from '../../core/data/units';
import { createEmptyGameState } from '../../core/galaxy/galaxyData';
import { createEmpire, createPlanet, type Fleet } from '../../core/models/types';
import { calcEmpireNetworth, getPlanetsForEmpire, getPlayerEmpire } from '../../core/selectors/selectors';

describe('galaxy generation', () => {
  it('creates the same MVP galaxy shape as Godot', () => {
    const state = createNewGame({ empireName: 'Aurora League', seed: 42 });
    expect(state.systems).toHaveLength(30);
    expect(state.empires).toHaveLength(4);
    expect(state.planets.length).toBeGreaterThanOrEqual(150);
    expect(state.planets.length).toBeLessThanOrEqual(450);
    expect(state.currentSpeed).toBe(0);
    expect(getPlayerEmpire(state)?.empireName).toBe('Aurora League');
  });

  it('assigns each empire a populated home planet with starting resources', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    for (const empire of state.empires) {
      const planets = getPlanetsForEmpire(state, empire.id);
      expect(planets).toHaveLength(1);
      expect(planets[0].population).toBe(planets[0].size * 10);
      expect(Object.keys(planets[0].buildings)).toHaveLength(0);
      expect(empire.resources.gc).toBe(5000);
    }
  });

  it('calculates networth from empire, planets, buildings, population, and units', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state);
    expect(player).toBeDefined();
    expect(calcEmpireNetworth(state, player!.id)).toBeGreaterThan(1900);
  });

  it('calculates exact networth contributions from canonical unit data', () => {
    const state = createEmptyGameState();
    const empire = createEmpire({ id: 7, empireName: 'Exact Empire', controllerType: 'human', color: '#fff' });
    empire.researchPoints = {
      military: 1000,
      welfare: 500,
      economy: 250,
      construction: 125,
      resources: 125,
    };

    const planet = createPlanet({ id: 11, planetName: 'Exact I', systemId: 3, size: 40 });
    planet.ownerId = empire.id;
    planet.population = 400;
    planet.buildings = { mine: 2, farm: 1, research_center: 1 };
    planet.units = {
      fighter: 2,
      bomber: 3,
      soldier: 5,
      droid: 7,
      transport: 1,
      agent: 4,
      wizard: 6,
    };

    const fleet: Fleet = {
      id: 13,
      ownerId: empire.id,
      units: { fighter: 1, bomber: 2, soldier: 3, droid: 4, transport: 5 },
      originSystemId: 3,
      targetSystemId: 4,
      targetPlanetId: 12,
      ticksRemaining: 9,
      isExploration: false,
    };

    state.empires.push(empire);
    state.planets.push(planet);
    state.fleets.push(fleet);

    const expected =
      1100 +
      2000 / 1000 +
      800 +
      4 * 4 +
      400 / 40 +
      2 * UNITS.fighter.networth +
      3 * UNITS.bomber.networth +
      5 * UNITS.soldier.networth +
      7 * UNITS.droid.networth +
      1 * UNITS.transport.networth +
      4 * UNITS.agent.networth +
      6 * UNITS.wizard.networth +
      1 * UNITS.fighter.networth +
      2 * UNITS.bomber.networth +
      3 * UNITS.soldier.networth +
      4 * UNITS.droid.networth +
      5 * UNITS.transport.networth;

    expect(calcEmpireNetworth(state, empire.id)).toBe(expected);
  });

  it('reads unit networth from canonical unit definitions', () => {
    const state = createEmptyGameState();
    const empire = createEmpire({ id: 1, empireName: 'Mutable Empire', controllerType: 'human', color: '#fff' });
    const planet = createPlanet({ id: 2, planetName: 'Mutable I', systemId: 1, size: 30 });
    planet.ownerId = empire.id;
    planet.units = { fighter: 1 };
    state.empires.push(empire);
    state.planets.push(planet);

    const mutableUnits = UNITS as unknown as { fighter: { networth: number } };
    const originalFighterNetworth = mutableUnits.fighter.networth;
    mutableUnits.fighter.networth = 30;

    try {
      expect(calcEmpireNetworth(state, empire.id)).toBe(1100 + 800 + 30);
    } finally {
      mutableUnits.fighter.networth = originalFighterNetworth;
    }
  });

  it('generates deterministic galaxy output for the same seed and varied output for a different seed', () => {
    const first = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const second = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const different = createNewGame({ empireName: 'Player Empire', seed: 43 });

    expect(snapshotGalaxy(first)).toEqual(snapshotGalaxy(second));
    expect(snapshotGalaxy(first)).not.toEqual(snapshotGalaxy(different));
  });
});

function snapshotGalaxy(state: ReturnType<typeof createNewGame>) {
  return {
    systems: state.systems.map((system) => ({
      name: system.systemName,
      position: system.position,
      planetIds: system.planetIds,
    })),
    planets: state.planets.map((planet) => ({
      size: planet.size,
      ownerId: planet.ownerId,
    })),
    empires: state.empires.map((empire) => ({
      homeSystemId: empire.homeSystemId,
      homePlanetId: empire.homePlanetId,
    })),
  };
}
