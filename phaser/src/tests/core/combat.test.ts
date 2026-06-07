import { describe, expect, it } from 'vitest';
import { type BattlePhaseReport, resolveBattle } from '../../core/engines/combatEngine';
import { createNewGame } from '../../core/engines/gameManager';
import { createEmptyGameState } from '../../core/galaxy/galaxyData';
import { createPlanet } from '../../core/models/types';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';

describe('combat engine', () => {
  it('initializes empty game states with deterministic RNG', () => {
    const first = createEmptyGameState();
    const second = createEmptyGameState();

    expect(first.rng).toBeDefined();
    expect(second.rng).toBeDefined();
    expect(first.rng?.float()).toBe(second.rng?.float());
    expect(first.rng?.float()).not.toBe(0);
  });

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

  it('resolves bomber attacks against lasers with deterministic RNG', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    state.rng = stubRng([0.05]);
    const { target, fleet } = createBattleFixture(state);
    target.buildings.laser = 1;
    target.units = {};
    fleet.units = { bomber: 1, transport: 1 };

    const report = resolveBattle(state, fleet, target);
    const phase = report.phases[0] as Extract<BattlePhaseReport, { phase: 'Air vs Ground' }>;

    expect(phase.lasersDestroyed).toBe(1);
    expect(phase.remainingLasers).toBe(0);
    expect(phase.bombersLost).toBe(0);
    expect(target.buildings.laser).toBe(0);
    expect(report.attackerWon).toBe(false);
  });

  it('applies fighter-vs-fighter losses deterministically', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const { target, fleet } = createBattleFixture(state);
    target.units = { fighter: 100, soldier: 100 };
    fleet.units = { fighter: 100 };

    const report = resolveBattle(state, fleet, target);
    const phase = report.phases[1] as Extract<BattlePhaseReport, { phase: 'Air vs Air' }>;

    expect(phase.atkFightersLost).toBe(12);
    expect(phase.defFightersLost).toBe(11);
    expect(target.units.fighter).toBe(89);
  });

  it('kills stranded ground when transports are destroyed', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    state.rng = stubRng([0.9]);
    const { target, fleet } = createBattleFixture(state);
    target.buildings.laser = 1;
    target.units = { soldier: 100 };
    fleet.units = { soldier: 150, transport: 1 };

    const report = resolveBattle(state, fleet, target);
    const phase = report.phases[0] as Extract<BattlePhaseReport, { phase: 'Air vs Ground' }>;

    expect(phase.transportsLost).toBe(1);
    expect(phase.groundLostToTransports).toEqual({ soldiersKilled: 150, droidsKilled: 0 });
    expect(report.attackerWon).toBe(false);
  });

  it('preserves defender agents, wizards, and surviving units on failed attacks', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const defender = state.empires[1];
    const { target, fleet } = createBattleFixture(state);
    target.units = { soldier: 100, droid: 10, agent: 3, wizard: 2 };
    fleet.units = { soldier: 10, transport: 1 };

    const report = resolveBattle(state, fleet, target);

    expect(report.attackerWon).toBe(false);
    expect(target.ownerId).toBe(defender.id);
    expect(target.units.agent).toBe(3);
    expect(target.units.wizard).toBe(2);
    // Symmetric ground formula: defender loses a small % even when winning
    expect(target.units.soldier).toBe(99);
    expect(target.units.droid).toBe(10);
  });

  it('pools combat units from defender portal planets', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const defender = state.empires[1];
    const { target, fleet } = createBattleFixture(state);
    const donor = createPlanet({ id: 999, planetName: 'Donor I', systemId: target.systemId, size: 20 });
    donor.ownerId = defender.id;
    state.planets.push(donor);
    target.hasPortal = true;
    donor.hasPortal = true;
    target.units = { soldier: 1 };
    donor.units = { soldier: 20, fighter: 5, agent: 4 };
    fleet.units = { soldier: 1, transport: 1 };

    const report = resolveBattle(state, fleet, target);

    expect(report.defenderInitial.soldier).toBe(21);
    expect(report.defenderInitial.fighter).toBe(5);
    expect(donor.units.soldier).toBe(0);
    expect(donor.units.fighter).toBe(0);
    expect(donor.units.agent).toBe(4);
  });
});

function createBattleFixture(state: ReturnType<typeof createNewGame>) {
  const attacker = state.empires[0];
  const defender = state.empires[1];
  const target = getPlanetsForEmpire(state, defender.id)[0];
  const fleet = {
    id: 99,
    ownerId: attacker.id,
    units: {},
    originSystemId: attacker.homeSystemId,
    targetSystemId: target.systemId,
    targetPlanetId: target.id,
    ticksRemaining: 0,
    isExploration: false,
  };
  state.fleets.push(fleet);
  return { attacker, defender, target, fleet };
}

function stubRng(values: number[]) {
  let index = 0;
  const next = () => values[index++] ?? values[values.length - 1] ?? 0.5;
  return {
    float: next,
    floatRange: (min: number, max: number) => min + next() * (max - min),
    intRange: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T>(items: readonly T[]) => items[Math.min(Math.floor(next() * items.length), items.length - 1)]!,
    getState: () => 0,
  };
}
