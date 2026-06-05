import type { GameState } from '../galaxy/galaxyData';
import type { SerializedGameState, TickDelta } from './messages';

/**
 * Per-room snapshot of the last broadcast, used to compute the next delta.
 * Stores the serialized form of each entity so we can detect field-level
 * changes cheaply by string comparison.
 */
export interface DeltaSnapshot {
  empires: Map<number, string>;
  planets: Map<number, string>;
  systems: Map<number, string>;
  fleets: string;
  aiControllers: string;
  lastEventId: number;
}

/** Mirror the event-log cap on the client so its history can't grow unbounded. */
const MAX_CLIENT_EVENTS = 1000;

interface HasId {
  id: number;
}

function snapshotById<T extends HasId>(items: readonly T[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const item of items) map.set(item.id, JSON.stringify(item));
  return map;
}

function highestEventId(state: GameState | SerializedGameState): number {
  const events = state.events;
  return events.length > 0 ? events[events.length - 1].id : -1;
}

export function createDeltaSnapshot(state: GameState): DeltaSnapshot {
  return {
    empires: snapshotById(state.empires),
    planets: snapshotById(state.planets),
    systems: snapshotById(state.systems),
    fleets: JSON.stringify(state.fleets),
    aiControllers: JSON.stringify(state.aiControllers),
    lastEventId: highestEventId(state),
  };
}

/** Collect entities whose serialized form changed, updating the snapshot in place. */
function diffById<T extends HasId>(items: readonly T[], snapshot: Map<number, string>): T[] {
  const changed: T[] = [];
  for (const item of items) {
    const json = JSON.stringify(item);
    if (snapshot.get(item.id) !== json) {
      changed.push(item);
      snapshot.set(item.id, json);
    }
  }
  return changed;
}

/**
 * Compute the delta from `snapshot` (the last broadcast) to the current
 * `state`, mutating `snapshot` to reflect the new state so the next call
 * diffs against it.
 */
export function computeTickDelta(state: GameState, snapshot: DeltaSnapshot): TickDelta {
  const delta: TickDelta = {
    type: 'tick',
    tick: state.currentTick,
    speed: state.currentSpeed,
    lifecycle: state.currentState,
    counters: {
      nextEmpireId: state.nextEmpireId,
      nextSystemId: state.nextSystemId,
      nextPlanetId: state.nextPlanetId,
      nextFleetId: state.nextFleetId,
      nextEventId: state.nextEventId,
    },
  };

  const empires = diffById(state.empires, snapshot.empires);
  if (empires.length > 0) delta.empires = empires;

  const planets = diffById(state.planets, snapshot.planets);
  if (planets.length > 0) delta.planets = planets;

  const systems = diffById(state.systems, snapshot.systems);
  if (systems.length > 0) delta.systems = systems;

  // Fleets are sent as the complete array whenever any fleet changed, so that
  // clients can replace wholesale and discard optimistic phantom fleets.
  const fleetsJson = JSON.stringify(state.fleets);
  if (fleetsJson !== snapshot.fleets) {
    delta.fleets = state.fleets;
    snapshot.fleets = fleetsJson;
  }

  const aiJson = JSON.stringify(state.aiControllers);
  if (aiJson !== snapshot.aiControllers) {
    delta.aiControllers = state.aiControllers;
    snapshot.aiControllers = aiJson;
  }

  const newEvents = state.events.filter((event) => event.id > snapshot.lastEventId);
  if (newEvents.length > 0) {
    delta.newEvents = newEvents;
    snapshot.lastEventId = highestEventId(state);
  }

  return delta;
}

function upsertById<T extends HasId>(target: T[], changed: readonly T[]): void {
  for (const item of changed) {
    const index = target.findIndex((existing) => existing.id === item.id);
    if (index >= 0) target[index] = item;
    else target.push(item);
  }
}

/** Apply a tick delta to a client's mirror state, reconstructing the full state. */
export function applyTickDelta(state: SerializedGameState, delta: TickDelta): void {
  state.currentTick = delta.tick;
  state.currentSpeed = delta.speed;
  state.currentState = delta.lifecycle;
  state.nextEmpireId = delta.counters.nextEmpireId;
  state.nextSystemId = delta.counters.nextSystemId;
  state.nextPlanetId = delta.counters.nextPlanetId;
  state.nextFleetId = delta.counters.nextFleetId;
  state.nextEventId = delta.counters.nextEventId;

  if (delta.empires) upsertById(state.empires, delta.empires);
  if (delta.planets) upsertById(state.planets, delta.planets);
  if (delta.systems) upsertById(state.systems, delta.systems);
  if (delta.fleets) state.fleets = delta.fleets;
  if (delta.aiControllers) state.aiControllers = delta.aiControllers;

  if (delta.newEvents) {
    state.events.push(...delta.newEvents);
    if (state.events.length > MAX_CLIENT_EVENTS) {
      state.events.splice(0, state.events.length - MAX_CLIENT_EVENTS);
    }
  }
}
