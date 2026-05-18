import { describe, expect, it } from 'vitest';
import { processAiTurn } from '../../core/ai/aiController';
import { processEconomyTick } from '../../core/engines/economyEngine';
import { createNewGame } from '../../core/engines/gameManager';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';

describe('AI controller', () => {
  it('queues economic buildings for AI empires', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => !empire.isPlayer)!;
    processAiTurn(state, ai.id, 1);
    const planets = getPlanetsForEmpire(state, ai.id);
    expect(planets.some((planet) => planet.buildQueue.length > 0)).toBe(true);
  });

  it('does not throw when processing repeated turns', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => !empire.isPlayer)!;
    for (let tick = 1; tick <= 120; tick += 1) {
      processAiTurn(state, ai.id, tick);
    }
    expect(getPlanetsForEmpire(state, ai.id).length).toBeGreaterThan(0);
  });

  it('stores controller memory by empire id instead of array position', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const ai = state.empires.find((empire) => !empire.isPlayer)!;

    expect(state.aiControllers[ai.id]?.empireId).toBe(ai.id);

    state.aiControllers[ai.id].failedAttacks[123] = { tick: 100, powerNeeded: 500 };
    processAiTurn(state, ai.id, 101);

    expect(state.aiControllers[ai.id].failedAttacks[123]).toEqual({ tick: 100, powerNeeded: 500 });
  });

  it('runs AI turns after all empires finish economy production', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    state.currentTick = 100;

    const [attacker, target] = state.empires.filter((empire) => !empire.isPlayer);
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
    };

    processEconomyTick(state);

    expect(target.resources.food).toBe(1095);
    expect(target.debuffs.some((debuff) => debuff.type === 'reduced_food')).toBe(true);
  });
});
