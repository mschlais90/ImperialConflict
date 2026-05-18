import { describe, expect, it } from 'vitest';
import { resolveBattle } from '../../core/engines/combatEngine';
import { createNewGame } from '../../core/engines/gameManager';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';

describe('combat engine', () => {
  it('captures a planet when attacker ground power beats defender ground power', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const attacker = state.empires[0];
    const defender = state.empires[1];
    const target = getPlanetsForEmpire(state, defender.id)[0];
    target.units = { soldier: 10, droid: 0, fighter: 0, bomber: 0, transport: 0 };
    const fleet = {
      id: 99,
      ownerId: attacker.id,
      units: { soldier: 100, droid: 0, fighter: 0, bomber: 0, transport: 1 },
      originSystemId: attacker.homeSystemId,
      targetSystemId: target.systemId,
      targetPlanetId: target.id,
      ticksRemaining: 0,
      isExploration: false,
    };
    state.fleets.push(fleet);

    const report = resolveBattle(state, fleet, target);
    expect(report.attackerWon).toBe(true);
    expect(target.ownerId).toBe(attacker.id);
    expect(state.fleets.some((item) => item.id === fleet.id)).toBe(false);
  });
});
