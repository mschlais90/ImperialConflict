import { describe, expect, it } from 'vitest';
import { runAiGame } from '../../core/sim/headlessSim';

describe('headless AI simulator', () => {
  const options = {
    seed: 7,
    maxTicks: 250,
    empires: [
      { difficulty: 'hard' as const, strategy: 'adaptive' as const },
      { difficulty: 'hard' as const, strategy: 'classic' as const },
      { difficulty: 'normal' as const },
      { difficulty: 'easy' as const },
    ],
  };

  it('is deterministic for a given seed and config', () => {
    expect(runAiGame(options)).toEqual(runAiGame(options));
  });

  it('reports per-empire results with consistent ranks and configs', () => {
    const result = runAiGame(options);
    expect(result.ticksPlayed).toBeGreaterThan(0);
    expect(result.empires.map((e) => e.rank).sort()).toEqual([1, 2, 3, 4]);
    expect(result.empires.map((e) => e.strategy)).toEqual(['adaptive', 'classic', 'adaptive', 'adaptive']);
    expect(result.empires.map((e) => e.difficulty)).toEqual(['hard', 'hard', 'normal', 'easy']);
    for (const empire of result.empires) {
      expect(empire.attacksWon).toBeLessThanOrEqual(empire.attacksLaunched);
      expect(empire.peakPlanets).toBeGreaterThanOrEqual(empire.finalPlanets);
    }
    if (result.conquestWinnerId !== null) {
      expect(result.empires.find((e) => e.empireId === result.conquestWinnerId)?.rank).toBe(1);
    }
  });
});
