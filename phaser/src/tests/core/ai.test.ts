import { describe, expect, it } from 'vitest';
import { processAiTurn } from '../../core/ai/aiController';
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
});
