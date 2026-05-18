import { describe, expect, it } from 'vitest';
import { queueBuilding, queueExplorer, sendFleet, setResearchAllocation, trainUnits } from '../../core/commands/playerCommands';
import { createNewGame } from '../../core/engines/gameManager';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';

describe('player commands', () => {
  it('queues buildings through the command API', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const home = getPlanetsForEmpire(state, player.id)[0];
    const result = queueBuilding(state, { empireId: player.id, planetId: home.id, buildingType: 'farm', count: 1 });
    expect(result.ok).toBe(true);
    expect(home.buildQueue.some((order) => order.itemType === 'farm')).toBe(true);
  });

  it('trains affordable units immediately like the Godot fleet panel', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const home = getPlanetsForEmpire(state, player.id)[0];
    const result = trainUnits(state, { empireId: player.id, planetId: home.id, unitType: 'soldier', count: 2 });
    expect(result.ok).toBe(true);
    expect(home.units.soldier).toBe(52);
  });

  it('rejects research allocation totals that are not 100', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const result = setResearchAllocation(state, {
      empireId: state.empires[0].id,
      allocation: { military: 100, welfare: 0, economy: 0, construction: 0, resources: 1 },
    });
    expect(result.ok).toBe(false);
  });

  it('queues explorer builds through the command API', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const home = getPlanetsForEmpire(state, player.id)[0];
    player.resources.gc = 20000;
    const result = queueExplorer(state, { empireId: player.id, planetId: home.id, count: 1 });
    expect(result.ok).toBe(true);
    expect(home.buildQueue.some((order) => order.itemType === 'explorer')).toBe(true);
  });

  it('launches attack fleets and removes units from the source planet', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const target = getPlanetsForEmpire(state, state.empires[1].id)[0];
    const home = getPlanetsForEmpire(state, player.id)[0];
    const result = sendFleet(state, {
      empireId: player.id,
      sourcePlanetId: home.id,
      targetPlanetId: target.id,
      units: { soldier: 10, transport: 1 },
    });
    expect(result.ok).toBe(true);
    expect(home.units.soldier).toBe(40);
    expect(state.fleets.some((fleet) => fleet.targetPlanetId === target.id && !fleet.isExploration)).toBe(true);
  });
});
