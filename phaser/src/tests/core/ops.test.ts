import { describe, expect, it } from 'vitest';
import { performAgentOperation, performSpell } from '../../core/commands/playerCommands';
import { createNewGame } from '../../core/engines/gameManager';
import {
  getAgentOperationCost,
  getSpellCost,
  launchAgentMission,
  launchWizardMission,
  MAX_ACTIVE_MISSIONS,
} from '../../core/engines/opsEngine';
import { advanceTick } from '../../core/engines/tickEngine';
import { applyTickDelta, computeTickDelta, createDeltaSnapshot } from '../../core/protocol/stateDelta';
import type { GameState } from '../../core/galaxy/galaxyData';
import type { Rng } from '../../core/random/rng';
import { calcEmpireNetworth, getPlanet, getPlanetsForEmpire } from '../../core/selectors/selectors';
import { serializeState } from '../../server/stateSerializer';

/** Fresh game with all empires AI-free (so AI turns don't interfere) and the player stocked for ops. */
function setup(): { state: GameState; player: GameState['empires'][number]; target: GameState['empires'][number] } {
  const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
  for (const empire of state.empires) empire.controllerType = 'human';
  const [player, target] = state.empires;
  const home = getPlanet(state, player.homePlanetId);
  if (!home) throw new Error('no home planet');
  home.units.agent = 20;
  home.units.wizard = 20;
  player.resources.gc = 1_000_000;
  player.resources.octarine = 100_000;
  return { state, player, target };
}

function fixedRng(state: GameState, value: number): void {
  const rng: Rng = {
    float: () => value,
    floatRange: (min) => min,
    intRange: (min) => min,
    pick: (items) => items[0],
    getState: () => 0,
  };
  state.rng = rng;
}

describe('ops missions', () => {
  it('commits agents and spends GC at launch without an immediate effect', () => {
    const { state, player, target } = setup();
    const home = getPlanet(state, player.homePlanetId)!;
    const cost = getAgentOperationCost(state, player);
    const gcBefore = player.resources.gc;
    const targetGcBefore = target.resources.gc;
    const networthBefore = calcEmpireNetworth(state, player.id);

    const result = performAgentOperation(state, { empireId: player.id, targetEmpireId: target.id, operationType: 'destroy_cash', units: 8 });

    expect(result.ok).toBe(true);
    expect(home.units.agent).toBe(12);
    expect(player.resources.gc).toBe(gcBefore - cost);
    expect(target.resources.gc).toBe(targetGcBefore);
    expect(player.missions).toHaveLength(1);
    expect(player.missions[0]).toMatchObject({ kind: 'agent', opType: 'destroy_cash', units: 8 });
    expect(player.missions[0].ticksRemaining).toBeGreaterThanOrEqual(2);
    expect(player.missions[0].ticksRemaining).toBeLessThanOrEqual(6);
    // Committed agents still count toward networth.
    expect(calcEmpireNetworth(state, player.id)).toBe(networthBefore);
  });

  it('rejects invalid commitments without mutating state', () => {
    const { state, player, target } = setup();
    const home = getPlanet(state, player.homePlanetId)!;
    const gcBefore = player.resources.gc;

    for (const units of [0, 21, 2.5]) {
      const result = performAgentOperation(state, { empireId: player.id, targetEmpireId: target.id, operationType: 'spy', units });
      expect(result.ok).toBe(false);
    }

    expect(home.units.agent).toBe(20);
    expect(player.resources.gc).toBe(gcBefore);
    expect(player.missions).toHaveLength(0);
  });

  it(`caps active missions at ${MAX_ACTIVE_MISSIONS} per kind`, () => {
    const { state, player, target } = setup();
    for (let i = 0; i < MAX_ACTIVE_MISSIONS; i += 1) {
      expect(launchAgentMission(state, 'spy', player, target, 2).success).toBe(true);
    }
    const gcBefore = player.resources.gc;
    const blocked = launchAgentMission(state, 'spy', player, target, 2);
    expect(blocked.success).toBe(false);
    expect(player.resources.gc).toBe(gcBefore);
    // Wizards have their own cap.
    expect(launchWizardMission(state, 'vision', player, target, 2).success).toBe(true);
  });

  it('resolves on arrival, applies the effect and returns all agents on success', () => {
    const { state, player, target } = setup();
    const home = getPlanet(state, player.homePlanetId)!;
    target.resources.gc = 10_000;
    launchAgentMission(state, 'destroy_cash', player, target, 10);
    const ticks = player.missions[0].ticksRemaining;
    fixedRng(state, 0); // always succeed

    for (let i = 1; i < ticks; i += 1) advanceTick(state);
    expect(player.missions).toHaveLength(1);
    const gcBeforeArrival = target.resources.gc;

    advanceTick(state);
    expect(player.missions).toHaveLength(0);
    expect(home.units.agent).toBe(20);
    expect(target.resources.gc).toBeLessThan(gcBeforeArrival);
    expect(state.events.some((e) => e.type === 'notification' && e.empireId === player.id && /Destroyed .* GC/.test(e.message))).toBe(true);
  });

  it('loses 10% of committed agents on failure', () => {
    const { state, player, target } = setup();
    const home = getPlanet(state, player.homePlanetId)!;
    launchAgentMission(state, 'destroy_cash', player, target, 20);
    const ticks = player.missions[0].ticksRemaining;
    fixedRng(state, 0.99); // always fail

    for (let i = 0; i < ticks; i += 1) advanceTick(state);
    expect(home.units.agent).toBe(18);
  });

  it('aborts and returns units when the target planet changes owner mid-flight', () => {
    const { state, player, target } = setup();
    const home = getPlanet(state, player.homePlanetId)!;
    const targetPlanet = getPlanetsForEmpire(state, target.id)[0];
    targetPlanet.units.soldier = 100;
    launchAgentMission(state, 'destroy_units', player, target, 10, targetPlanet);
    const ticks = player.missions[0].ticksRemaining;
    targetPlanet.ownerId = -1;
    fixedRng(state, 0);

    for (let i = 0; i < ticks; i += 1) advanceTick(state);
    expect(player.missions).toHaveLength(0);
    expect(home.units.agent).toBe(20);
    expect(targetPlanet.units.soldier).toBe(100);
    expect(state.events.some((e) => e.type === 'notification' && /aborted/.test(e.message))).toBe(true);
  });

  it('warns the defender when the mission is detected', () => {
    const { state, player, target } = setup();
    fixedRng(state, 0); // detection roll succeeds
    launchAgentMission(state, 'spy', player, target, 5);
    expect(
      state.events.some((e) => e.type === 'notification' && e.empireId === target.id && /detected/.test(e.message)),
    ).toBe(true);
  });

  it('spells cost networth/80 octarine and reduce food applies a 20% / 15 tick curse', () => {
    const { state, player, target } = setup();
    expect(getSpellCost(state, player)).toBe(Math.max(Math.trunc(calcEmpireNetworth(state, player.id) / 80), 5));

    const result = performSpell(state, { empireId: player.id, targetEmpireId: target.id, spellType: 'reduce_food', units: 10 });
    expect(result.ok).toBe(true);
    const ticks = player.missions[0].ticksRemaining;
    fixedRng(state, 0);
    for (let i = 0; i < ticks; i += 1) advanceTick(state);

    const debuff = target.debuffs.find((d) => d.type === 'reduced_food');
    expect(debuff?.value).toBe(0.2);
    // Missions resolve before the economy step, which ticks the new debuff once.
    expect(debuff?.ticksRemaining).toBe(14);
  });

  it('syncs in-flight missions to multiplayer clients via tick deltas', () => {
    const { state, player, target } = setup();
    const client = structuredClone(serializeState(state));
    const snapshot = createDeltaSnapshot(state);

    launchAgentMission(state, 'spy', player, target, 5);
    advanceTick(state);
    applyTickDelta(client, computeTickDelta(state, snapshot));

    expect(client).toEqual(serializeState(state));
    expect(client.empires[player.id].missions).toHaveLength(player.missions.length);
  });
});

describe('ops save migration', () => {
  it('upgrades v2 saves to v3 with empty missions', async () => {
    const { deserializeSave } = await import('../../core/persistence/saveLoad');

    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const { rng: _rng, nextMissionId: _next, ...rest } = state;
    const legacy = { ...rest, empires: rest.empires.map(({ missions: _m, ...e }) => e) };

    const loaded = deserializeSave(JSON.stringify({ version: 2, timestamp: 0, rngState: 1, gameState: legacy }));
    expect(loaded?.nextMissionId).toBe(0);
    expect(loaded?.empires.every((e) => Array.isArray(e.missions) && e.missions.length === 0)).toBe(true);
  });
});
