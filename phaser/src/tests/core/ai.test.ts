import { describe, expect, it } from 'vitest';
import { processAiTurn } from '../../core/ai/aiController';
import { processEconomyTick } from '../../core/engines/economyEngine';
import { createNewGame } from '../../core/engines/gameManager';
import type { Empire, Planet } from '../../core/models/types';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';

describe('AI controller', () => {
  it('queues economic buildings for AI empires', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    processAiTurn(state, ai.id, 1);
    const planets = getPlanetsForEmpire(state, ai.id);
    expect(planets.some((planet) => planet.buildQueue.length > 0)).toBe(true);
  });

  it('does not throw when processing repeated turns', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    for (let tick = 1; tick <= 120; tick += 1) {
      processAiTurn(state, ai.id, tick);
    }
    expect(getPlanetsForEmpire(state, ai.id).length).toBeGreaterThan(0);
  });

  it('stores controller memory by empire id instead of array position', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;

    expect(state.aiControllers[ai.id]?.empireId).toBe(ai.id);

    state.aiControllers[ai.id].recentAttacks[123] = { tick: 100, powerNeeded: 500 };
    processAiTurn(state, ai.id, 101);

    expect(state.aiControllers[ai.id].recentAttacks[123]).toEqual({ tick: 100, powerNeeded: 500 });
  });

  it('launches explorers for unowned planets but respects the active exploration cap', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    const source = getPlanetsForEmpire(state, ai.id)[0];
    source.units.explorer = 1;

    processAiTurn(state, ai.id, 1);

    expect(source.units.explorer).toBe(0);
    expect(state.fleets.filter((fleet) => fleet.ownerId === ai.id && fleet.isExploration)).toHaveLength(1);

    source.units.explorer = 1;
    state.fleets.push(
      {
        id: state.nextFleetId,
        ownerId: ai.id,
        units: {},
        originSystemId: source.systemId,
        targetSystemId: source.systemId,
        targetPlanetId: source.id,
        ticksRemaining: 10,
        isExploration: true,
      },
      {
        id: state.nextFleetId + 1,
        ownerId: ai.id,
        units: {},
        originSystemId: source.systemId,
        targetSystemId: source.systemId,
        targetPlanetId: source.id,
        ticksRemaining: 10,
        isExploration: true,
      },
    );
    state.nextFleetId += 2;

    processAiTurn(state, ai.id, 2);

    expect(source.units.explorer).toBe(1);
    expect(state.fleets.filter((fleet) => fleet.ownerId === ai.id && fleet.isExploration)).toHaveLength(3);
  });

  it('starts military production at tick 40', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    const planet = getPlanetsForEmpire(state, ai.id)[0];
    ai.resources = { gc: 2000, food: 0, iron: 1000, endurium: 1000, octarine: 1000 };
    planet.units = {};
    planet.buildQueue = [
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
    ];

    processAiTurn(state, ai.id, 39);
    const queuedUnitsBefore = planet.buildQueue.filter((o) => o.category === 'unit').length;
    expect(queuedUnitsBefore).toBe(0);

    processAiTurn(state, ai.id, 40);
    const queuedUnitsAfter = planet.buildQueue.filter((o) => o.category === 'unit').length;
    expect(queuedUnitsAfter).toBeGreaterThan(0);
  });

  it('launches pooled attack fleets with garrison, transport capacity, and launch events', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    state.currentTick = 101;
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    const source = getPlanetsForEmpire(state, ai.id)[0];
    const target = state.empires.find((empire) => empire.controllerType === 'human')!;
    const targetPlanet = makeOnlyViableAttackTarget(state, ai, target);
    ai.resources = { gc: 0, food: 0, iron: 0, endurium: 0, octarine: 0 };
    source.units = { soldier: 250, transport: 2 };
    source.buildQueue = [
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
    ];
    const fleetCount = state.fleets.length;
    const eventCount = state.events.length;

    processAiTurn(state, ai.id, 101);

    const attackFleet = state.fleets.find((fleet) => fleet.ownerId === ai.id && !fleet.isExploration);
    expect(state.fleets).toHaveLength(fleetCount + 1);
    expect(attackFleet).toMatchObject({
      ownerId: ai.id,
      targetPlanetId: targetPlanet.id,
      isExploration: false,
    });
    expect(source.units.soldier).toBeGreaterThanOrEqual(10);
    expect((attackFleet?.units.soldier ?? 0) + (attackFleet?.units.droid ?? 0)).toBeLessThanOrEqual(
      (attackFleet?.units.transport ?? 0) * 100,
    );
    expect(state.events.slice(eventCount)).toContainEqual(
      expect.objectContaining({
        type: 'fleet_launched',
        fleetId: attackFleet?.id,
        ownerId: ai.id,
        targetPlanetId: targetPlanet.id,
      }),
    );
  });

  it('records recent attack attempts and uses cooldown before retargeting the same planet', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    const source = getPlanetsForEmpire(state, ai.id)[0];
    const target = state.empires.find((empire) => empire.controllerType === 'human')!;
    const targetPlanet = makeOnlyViableAttackTarget(state, ai, target);
    ai.resources = { gc: 0, food: 0, iron: 0, endurium: 0, octarine: 0 };
    source.units = { soldier: 250, transport: 2 };
    source.buildQueue = [
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
    ];

    processAiTurn(state, ai.id, 101);
    const firstFleet = state.fleets.find((fleet) => fleet.ownerId === ai.id && !fleet.isExploration)!;
    expect(state.aiControllers[ai.id].recentAttacks[targetPlanet.id]).toEqual({
      tick: 101,
      powerNeeded: 502,
    });

    state.fleets = state.fleets.filter((fleet) => fleet.id !== firstFleet.id);
    source.units = { soldier: 250, transport: 2 };
    processAiTurn(state, ai.id, 102);

    expect(state.fleets.filter((fleet) => fleet.ownerId === ai.id && !fleet.isExploration)).toHaveLength(0);
  });

  it('does not mutate planets or memory when pooled attack has no transports', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    const planets = prepareAiAttackPlanets(state, ai);
    const target = state.empires.find((empire) => empire.controllerType === 'human')!;
    const targetPlanet = makeOnlyViableAttackTarget(state, ai, target);
    ai.resources = { gc: 0, food: 0, iron: 0, endurium: 0, octarine: 0 };
    planets[0].units = { soldier: 120 };
    planets[1].units = { soldier: 120 };
    const beforeUnits = planets.map((planet) => ({ ...planet.units }));
    const fleetCount = state.fleets.length;
    const eventCount = state.events.length;

    processAiTurn(state, ai.id, 101);

    expect(state.fleets).toHaveLength(fleetCount);
    expect(state.events).toHaveLength(eventCount);
    expect(state.aiControllers[ai.id].recentAttacks[targetPlanet.id]).toBeUndefined();
    expect(planets.map((planet) => planet.units)).toEqual(beforeUnits);
  });

  it('keeps excess ground units on their original planets when transport capacity is partial', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    const planets = prepareAiAttackPlanets(state, ai);
    const target = state.empires.find((empire) => empire.controllerType === 'human')!;
    makeOnlyViableAttackTarget(state, ai, target);
    ai.resources = { gc: 0, food: 0, iron: 0, endurium: 0, octarine: 0 };
    planets[0].units = { transport: 2 };
    planets[1].units = { soldier: 300 };

    processAiTurn(state, ai.id, 101);

    const attackFleet = state.fleets.find((fleet) => fleet.ownerId === ai.id && !fleet.isExploration);
    expect(attackFleet?.units).toMatchObject({ soldier: 100, transport: 1 });
    expect((attackFleet?.units.soldier ?? 0) + (attackFleet?.units.droid ?? 0)).toBeLessThanOrEqual(
      (attackFleet?.units.transport ?? 0) * 100,
    );
    expect(planets[0].units.soldier ?? 0).toBe(0);
    expect(planets[1].units.soldier).toBe(200);
  });

  it('aborts attack when transport-trimmed power is below the selected target requirement', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    const planets = prepareAiAttackPlanets(state, ai);
    const target = state.empires.find((empire) => empire.controllerType === 'human')!;
    const targetPlanet = makeOnlyViableAttackTarget(state, ai, target);
    targetPlanet.units = { soldier: 60 };
    ai.resources = { gc: 0, food: 0, iron: 0, endurium: 0, octarine: 0 };
    planets[0].units = { transport: 2 };
    planets[1].units = { soldier: 1000 };
    const beforeUnits = planets.map((planet) => ({ ...planet.units }));
    const fleetCount = state.fleets.length;
    const eventCount = state.events.length;

    processAiTurn(state, ai.id, 101);

    expect(state.fleets).toHaveLength(fleetCount);
    expect(state.events).toHaveLength(eventCount);
    expect(state.aiControllers[ai.id].recentAttacks[targetPlanet.id]).toBeUndefined();
    expect(planets.map((planet) => planet.units)).toEqual(beforeUnits);
  });

  it('does not perform operations without enough operation resources', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => empire.controllerType === 'ai')!;
    const target = state.empires.find((empire) => empire.controllerType === 'human')!;
    const planet = getPlanetsForEmpire(state, ai.id)[0];
    ai.resources = { gc: 0, food: 0, iron: 0, endurium: 0, octarine: 0 };
    planet.units = { agent: 5, wizard: 5 };
    state.rng = {
      float: () => 0,
      floatRange: (min) => min,
      intRange: (min) => min,
      pick: (items) => {
        const targetEmpire = items.find((item) => typeof item === 'object' && item !== null && 'id' in item && item.id === target.id);
        if (targetEmpire !== undefined) {
          return targetEmpire;
        }
        const op = items.find((item) => item === 'destroy_cash' || item === 'reduce_food');
        return op ?? items[0];
      },
      getState: () => 0,
    };

    processAiTurn(state, ai.id, 100);

    expect(target.debuffs).toHaveLength(0);
    expect(state.events.some((event) => event.type === 'notification' && event.category === 'ops')).toBe(false);
  });

  it('runs AI turns after all empires finish economy production', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    state.currentTick = 100;

    const [attacker, target] = state.empires.filter((empire) => empire.controllerType === 'ai');
    const targetPlanet = getPlanetsForEmpire(state, target.id)[0];
    const attackerPlanet = getPlanetsForEmpire(state, attacker.id)[0];

    attacker.resources.octarine = 1000;
    attackerPlanet.units = { wizard: 5 };
    target.resources.food = 1000;
    target.resources.gc = 0;
    target.resources.iron = 0;
    target.resources.endurium = 0;
    target.resources.octarine = 0;
    targetPlanet.population = 0;
    targetPlanet.units = {};
    targetPlanet.buildings = { farm: 1 };
    targetPlanet.buildQueue = [
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
      { category: 'building', itemType: 'farm', ticksRemaining: 999 },
    ];
    state.rng = {
      float: () => 0,
      floatRange: (min) => min,
      intRange: (min) => min,
      pick: (items) => {
        const targetEmpire = items.find((item) => typeof item === 'object' && item !== null && 'id' in item && item.id === target.id);
        if (targetEmpire !== undefined) {
          return targetEmpire;
        }
        const reduceFood = items.find((item) => item === 'reduce_food');
        return reduceFood ?? items[0];
      },
      getState: () => 0,
    };

    processEconomyTick(state);

    expect(target.resources.food).toBe(1095);
    expect(target.debuffs.some((debuff) => debuff.type === 'reduced_food')).toBe(true);
  });
});

function totalUnits(planet: Planet): number {
  return Object.values(planet.units).reduce((total, count) => total + (count ?? 0), 0);
}

function makeOnlyViableAttackTarget(state: ReturnType<typeof createNewGame>, attacker: Empire, target: Empire): Planet {
  for (const planet of state.planets) {
    if (planet.ownerId >= 0 && planet.ownerId !== attacker.id) {
      planet.units = { soldier: 10000 };
      planet.buildings = { laser: 100 };
    }
  }

  const targetPlanet = getPlanetsForEmpire(state, target.id)[0];
  targetPlanet.units = { soldier: 1 };
  targetPlanet.buildings = {};
  return targetPlanet;
}

function prepareAiAttackPlanets(state: ReturnType<typeof createNewGame>, ai: Empire): Planet[] {
  const home = getPlanetsForEmpire(state, ai.id)[0];
  const unowned = state.planets.find((planet) => planet.ownerId < 0 && planet.systemId !== home.systemId)!;
  unowned.ownerId = ai.id;
  unowned.population = 100;
  unowned.buildings = {};
  unowned.buildQueue = [
    { category: 'building', itemType: 'farm', ticksRemaining: 999 },
    { category: 'building', itemType: 'farm', ticksRemaining: 999 },
    { category: 'building', itemType: 'farm', ticksRemaining: 999 },
  ];
  home.buildQueue = [
    { category: 'building', itemType: 'farm', ticksRemaining: 999 },
    { category: 'building', itemType: 'farm', ticksRemaining: 999 },
    { category: 'building', itemType: 'farm', ticksRemaining: 999 },
  ];
  return [home, unowned];
}
