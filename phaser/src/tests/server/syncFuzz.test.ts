import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../core/data/buildings';
import { createNewGame } from '../../core/engines/gameManager';
import { advanceTick } from '../../core/engines/tickEngine';
import type { GameState } from '../../core/galaxy/galaxyData';
import type { SerializedGameState, TickDelta } from '../../core/protocol/messages';
import { applyTickDelta, computeTickDelta, createDeltaSnapshot } from '../../core/protocol/stateDelta';
import { createSeededRng, type Rng } from '../../core/random/rng';
import { getPlanetsForEmpire } from '../../core/selectors/selectors';
import { executeCommand } from '../../server/commandHandler';
import { validateClientMessage } from '../../server/messageValidation';
import { serializeState } from '../../server/stateSerializer';

// Randomized end-to-end sync check of the server pipeline, without sockets:
//   random (often invalid) client commands -> validateClientMessage ->
//   executeCommand -> advanceTick -> computeTickDelta -> JSON wire round-trip
//   -> applyTickDelta on a client mirror.
// After every tick the client mirror must equal the server's serialized state,
// and no command or tick may throw.

const BUILDING_KEYS = Object.keys(BUILDINGS);
const UNIT_TYPES = ['transport', 'soldier', 'droid', 'fighter', 'bomber', 'agent', 'wizard'];
const COMBAT_UNITS = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];

function randomCommand(state: GameState, rng: Rng, empireId: number): Record<string, unknown> {
  const own = getPlanetsForEmpire(state, empireId);
  const anyPlanetId = rng.intRange(-1, state.planets.length + 2);
  const ownPlanetId = own.length > 0 && rng.float() < 0.85 ? rng.pick(own).id : anyPlanetId;
  const targetPlanetId = rng.float() < 0.9 ? rng.pick(state.planets).id : anyPlanetId;
  const otherEmpire = rng.intRange(-1, state.empires.length);
  const amount = rng.pick([0, 1, 2, 5, 25, 1000, 1e7]);

  switch (rng.intRange(0, 9)) {
    case 0:
      return { type: 'queueBuilding', empireId, planetId: ownPlanetId, buildingType: rng.pick(BUILDING_KEYS), count: amount };
    case 1:
      return { type: 'queueExplorer', empireId, planetId: ownPlanetId, count: amount };
    case 2:
      return { type: 'trainUnits', empireId, planetId: ownPlanetId, unitType: rng.pick(UNIT_TYPES), count: amount };
    case 3:
      return { type: 'sendFleet', empireId, sourcePlanetId: ownPlanetId, targetPlanetId, units: { [rng.pick(COMBAT_UNITS)]: amount, transport: rng.intRange(0, 5) } };
    case 4:
      return { type: 'sendPortalFleet', empireId, targetPlanetId, units: { [rng.pick(COMBAT_UNITS)]: amount } };
    case 5:
      return { type: 'sendExplorer', empireId, sourcePlanetId: ownPlanetId, targetPlanetId };
    case 6:
      return { type: 'recallToPortal', empireId, sourcePlanetId: ownPlanetId };
    case 7: {
      const a = rng.intRange(0, 100);
      return { type: 'setResearchAllocation', empireId, allocation: { military: a, welfare: 100 - a, economy: 0, construction: 0, resources: 0 } };
    }
    case 8:
      return { type: 'performAgentOperation', empireId, targetEmpireId: otherEmpire, operationType: rng.pick(['spy', 'destroy_cash', 'destroy_units', 'sabotage_portal']), targetPlanetId, units: amount };
    default:
      return { type: 'performSpell', empireId, targetEmpireId: otherEmpire, spellType: rng.pick(['vision', 'hypnotize', 'reduce_food', 'destroy_iron']), targetPlanetId, units: amount };
  }
}

function runFuzz(seed: number, ticks: number, commandsPerTick: number): { accepted: number; rejected: number } {
  const server = createNewGame({ empireName: 'Host', seed, empireCount: 4 });
  for (const e of server.empires) e.controllerType = e.id < 2 ? 'human' : 'ai';
  const client: SerializedGameState = structuredClone(serializeState(server));
  const snapshot = createDeltaSnapshot(server);
  const rng = createSeededRng(seed * 7919 + 1);
  let accepted = 0;
  let rejected = 0;

  for (let t = 0; t < ticks; t++) {
    for (let c = 0; c < commandsPerTick; c++) {
      const empireId = rng.intRange(0, 1);
      // Round-trip through JSON like the real socket does.
      const validated = validateClientMessage(JSON.parse(JSON.stringify({ type: 'command', command: randomCommand(server, rng, empireId) })));
      if (!validated.ok || validated.value.type !== 'command') {
        rejected++;
        continue;
      }
      const result = executeCommand(server, validated.value.command);
      if (result.ok) accepted++;
      else rejected++;
    }
    advanceTick(server);
    const delta = JSON.parse(JSON.stringify(computeTickDelta(server, snapshot))) as TickDelta;
    applyTickDelta(client, delta);
    expect(client, `seed ${seed} tick ${server.currentTick}`).toEqual(JSON.parse(JSON.stringify(serializeState(server))));
  }
  return { accepted, rejected };
}

describe('multiplayer sync under random commands', () => {
  it.each([1, 2, 3, 4, 5])('client mirror matches server after every tick (seed %i)', (seed) => {
    const { accepted, rejected } = runFuzz(seed, 120, 6);
    // Sanity: the generator exercises both the success and failure paths.
    expect(accepted).toBeGreaterThan(20);
    expect(rejected).toBeGreaterThan(20);
  }, 30000);
});
