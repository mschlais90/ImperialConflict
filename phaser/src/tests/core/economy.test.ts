import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../core/engines/gameManager';
import { advanceTick, setSpeed } from '../../core/engines/tickEngine';
import { getPlanetsForEmpire, getPlayerEmpire } from '../../core/selectors/selectors';

describe('economy and ticks', () => {
  it('advances current tick and emits a tick event', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    advanceTick(state);
    expect(state.currentTick).toBe(1);
    expect(state.events.some((event) => event.type === 'tick_processed' && event.tick === 1)).toBe(true);
  });

  it('completes build queue items and adds buildings', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state)!;
    const home = getPlanetsForEmpire(state, player.id)[0];
    home.buildQueue.push({ itemType: 'farm', ticksRemaining: 1, category: 'building' });
    advanceTick(state);
    expect(home.buildings.farm).toBe(4);
  });

  it('completes build queue items and adds units', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state)!;
    const home = getPlanetsForEmpire(state, player.id)[0];
    home.buildQueue.push({ itemType: 'explorer', ticksRemaining: 1, category: 'unit' });
    advanceTick(state);
    expect(home.units.explorer).toBe(1);
  });

  it('produces resources, applies food consumption, and generates research', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state)!;
    const foodBefore = player.resources.food;
    const ironBefore = player.resources.iron;
    advanceTick(state);
    expect(player.resources.iron).toBeGreaterThanOrEqual(ironBefore);
    expect(player.resources.food).not.toBe(foodBefore);
    expect(player.researchPoints.military).toBeGreaterThan(0);
  });

  it('updates speed without processing a tick', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    setSpeed(state, 4);
    expect(state.currentSpeed).toBe(4);
    expect(state.currentTick).toBe(0);
  });
});
