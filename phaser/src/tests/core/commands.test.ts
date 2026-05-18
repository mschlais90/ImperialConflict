import { describe, expect, it } from 'vitest';
import {
  performAgentOperation,
  performSpell,
  queueBuilding,
  queueExplorer,
  sendExplorer,
  sendFleet,
  setResearchAllocation,
  trainUnits,
} from '../../core/commands/playerCommands';
import { createNewGame } from '../../core/engines/gameManager';
import { performAgentOp, performWizardSpell } from '../../core/engines/opsEngine';
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

  it('launches explorer fleets and removes an explorer from the source planet', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const home = getPlanetsForEmpire(state, player.id)[0];
    const target = state.planets.find((planet) => planet.ownerId < 0)!;
    home.units.explorer = 1;

    const result = sendExplorer(state, { empireId: player.id, sourcePlanetId: home.id, targetPlanetId: target.id });

    expect(result.ok).toBe(true);
    expect(home.units.explorer).toBe(0);
    expect(state.fleets).toContainEqual(
      expect.objectContaining({
        ownerId: player.id,
        targetPlanetId: target.id,
        isExploration: true,
      }),
    );
  });

  it('rejects unknown agent operations without spending resources or throwing', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const target = state.empires[1];
    const home = getPlanetsForEmpire(state, player.id)[0];
    home.units.agent = 1;
    const gcBefore = player.resources.gc;

    const result = performAgentOperation(state, {
      empireId: player.id,
      targetEmpireId: target.id,
      operationType: 'invalid_op',
    } as unknown as Parameters<typeof performAgentOperation>[1]);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/unknown operation/i);
    expect(player.resources.gc).toBe(gcBefore);
  });

  it('rejects unknown spells without spending resources or throwing', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const target = state.empires[1];
    const home = getPlanetsForEmpire(state, player.id)[0];
    home.units.wizard = 1;
    player.resources.octarine = 1000;
    const octarineBefore = player.resources.octarine;

    const result = performSpell(state, {
      empireId: player.id,
      targetEmpireId: target.id,
      spellType: 'invalid_spell',
    } as unknown as Parameters<typeof performSpell>[1]);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/unknown spell/i);
    expect(player.resources.octarine).toBe(octarineBefore);
  });

  it('does not spend GC when direct agent operations are missing target planets', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const target = state.empires[1];
    const home = getPlanetsForEmpire(state, player.id)[0];
    home.units.agent = 1;
    const gcBefore = player.resources.gc;

    const result = performAgentOp(state, 'destroy_units', player, target);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/target planet/i);
    expect(player.resources.gc).toBe(gcBefore);
  });

  it('does not spend octarine when direct spells are missing target planets', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = state.empires[0];
    const target = state.empires[1];
    const home = getPlanetsForEmpire(state, player.id)[0];
    home.units.wizard = 1;
    player.resources.octarine = 1000;
    const octarineBefore = player.resources.octarine;

    const result = performWizardSpell(state, 'hypnotize', player, target);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/target planet/i);
    expect(player.resources.octarine).toBe(octarineBefore);
  });
});
