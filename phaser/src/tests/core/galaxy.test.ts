import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../core/engines/gameManager';
import { calcEmpireNetworth, getPlanetsForEmpire, getPlayerEmpire } from '../../core/selectors/selectors';

describe('galaxy generation', () => {
  it('creates the same MVP galaxy shape as Godot', () => {
    const state = createNewGame({ empireName: 'Aurora League', seed: 42 });
    expect(state.systems).toHaveLength(30);
    expect(state.empires).toHaveLength(4);
    expect(state.planets.length).toBeGreaterThanOrEqual(150);
    expect(state.planets.length).toBeLessThanOrEqual(450);
    expect(getPlayerEmpire(state)?.empireName).toBe('Aurora League');
  });

  it('assigns each empire a populated home planet with starting resources', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    for (const empire of state.empires) {
      const planets = getPlanetsForEmpire(state, empire.id);
      expect(planets).toHaveLength(1);
      expect(planets[0].population).toBe(planets[0].size * 10);
      expect(planets[0].buildings.mine).toBe(3);
      expect(empire.resources.gc).toBe(5000);
    }
  });

  it('calculates networth from empire, planets, buildings, population, and units', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state);
    expect(player).toBeDefined();
    expect(calcEmpireNetworth(state, player!.id)).toBeGreaterThan(1900);
  });
});
