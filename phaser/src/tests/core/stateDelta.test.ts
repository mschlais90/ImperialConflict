import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../core/engines/gameManager';
import { advanceTick } from '../../core/engines/tickEngine';
import { applyTickDelta, computeTickDelta, createDeltaSnapshot } from '../../core/protocol/stateDelta';
import { serializeState } from '../../server/stateSerializer';
import type { SerializedGameState } from '../../core/protocol/messages';

function newServerState(empireCount = 4) {
  const state = createNewGame({ empireName: 'Host', seed: 42, empireCount });
  for (const e of state.empires) e.controllerType = e.id < 2 ? 'human' : 'ai';
  return state;
}

/** A client mirror is a deep, rng-free clone of the server's serialized state. */
function cloneForClient(state: ReturnType<typeof newServerState>): SerializedGameState {
  return structuredClone(serializeState(state));
}

describe('tick delta encoding', () => {
  it('reconstructs the full server state on a client by applying per-tick deltas', () => {
    const server = newServerState();
    const client = cloneForClient(server);
    const snapshot = createDeltaSnapshot(server);

    // Apply a delta every tick, exactly as the live wire protocol does.
    for (let i = 0; i < 10; i++) {
      advanceTick(server);
      const delta = computeTickDelta(server, snapshot);
      applyTickDelta(client, delta);
      expect(client).toEqual(serializeState(server));
    }
  });

  it('reconstructs state even when fleets are added and resolved between ticks', () => {
    // Run far enough that AI launches fleets (fleets get added then consumed),
    // which exercises the full-array fleet replacement path.
    const server = newServerState(6);
    const client = cloneForClient(server);
    const snapshot = createDeltaSnapshot(server);

    let sawFleets = false;
    for (let i = 0; i < 130; i++) {
      advanceTick(server);
      if (server.fleets.length > 0) sawFleets = true;
      const delta = computeTickDelta(server, snapshot);
      applyTickDelta(client, delta);
    }
    expect(sawFleets).toBe(true);
    expect(client).toEqual(serializeState(server));
  });

  it('produces a per-tick delta far smaller than the full serialized state', () => {
    const server = newServerState(6);
    const snapshot = createDeltaSnapshot(server);

    let lastDelta = computeTickDelta(server, snapshot);
    for (let i = 0; i < 200; i++) {
      advanceTick(server);
      lastDelta = computeTickDelta(server, snapshot);
    }
    const lastDeltaBytes = JSON.stringify(lastDelta).length;
    const fullBytes = JSON.stringify(serializeState(server)).length;

    // By tick 200 the full state is well over 100 KB and the event log has grown
    // to its 1000-entry cap (~89 KB). The old protocol re-sent ALL of that every
    // tick; the delta is an order of magnitude smaller and re-sends none of the
    // event history — only the handful of events appended this tick.
    expect(fullBytes).toBeGreaterThan(100_000);
    expect(server.events.length).toBe(1000);
    expect(lastDeltaBytes).toBeLessThan(fullBytes / 8);
    expect(lastDeltaBytes).toBeLessThan(25_000);
    expect(lastDelta.newEvents?.length ?? 0).toBeLessThan(30);
  });

  it('omits collections that did not change', () => {
    const server = newServerState();
    const snapshot = createDeltaSnapshot(server);

    // No tick advanced: nothing changed, so the delta carries only scalars/counters.
    const delta = computeTickDelta(server, snapshot);
    expect(delta.empires).toBeUndefined();
    expect(delta.planets).toBeUndefined();
    expect(delta.systems).toBeUndefined();
    expect(delta.fleets).toBeUndefined();
    expect(delta.newEvents).toBeUndefined();
    expect(delta.tick).toBe(server.currentTick);
  });
});
