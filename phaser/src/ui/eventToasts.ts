import { UNITS } from '../core/data/units';
import type { EventLogEntry } from '../core/events/eventLog';
import type { GameState } from '../core/galaxy/galaxyData';
import { getEmpire, getPlanet, getSystem } from '../core/selectors/selectors';

// Turns newly appended game events into toast messages for the local player.
// Pure (no DOM), so the filtering and grouping rules are unit-testable.

export const MAX_TOASTS_PER_TICK = 4;

export interface ToastMessage {
  message: string;
  isError: boolean;
}

export interface EventToastResult {
  /** Already ordered (errors first) and capped, including any "+N more" line. */
  toasts: ToastMessage[];
  localPlayerEliminated: boolean;
}

export function collectEventToasts(state: GameState, playerId: number, newEvents: readonly EventLogEntry[]): EventToastResult {
  // Group unit completions by type for concise toasts
  const unitCounts = new Map<string, number>();
  const toasts: ToastMessage[] = [];
  let localPlayerEliminated = false;

  for (const event of newEvents) {
    switch (event.type) {
      case 'planet_colonized': {
        if (event.empireId !== playerId) break;
        const planet = getPlanet(state, event.planetId);
        toasts.push({ message: `Colonized ${planet?.planetName ?? 'a planet'}!`, isError: false });
        break;
      }
      case 'empire_eliminated': {
        const empire = getEmpire(state, event.empireId);
        const name = empire?.empireName ?? `Empire ${event.empireId}`;
        const isLocalPlayer = event.empireId === playerId;
        toasts.push({ message: `${name} has been eliminated!`, isError: isLocalPlayer });
        if (isLocalPlayer) localPlayerEliminated = true;
        break;
      }
      case 'battle_resolved': {
        if (event.defenderId !== playerId) break;
        const battlePlanet = getPlanet(state, event.planetId);
        const battleSystem = battlePlanet ? getSystem(state, battlePlanet.systemId) : undefined;
        const planetIdx = battleSystem ? battleSystem.planetIds.indexOf(event.planetId) + 1 : 0;
        const loc = battleSystem ? `${battleSystem.systemName}:${planetIdx}` : (battlePlanet?.planetName ?? 'Unknown');
        toasts.push({ message: `You are under attack at ${loc}!`, isError: true });
        break;
      }
      case 'fleet_launched': {
        // Early warning: another empire's fleet is heading for one of our planets.
        if (event.ownerId === playerId) break;
        const targetPlanet = getPlanet(state, event.targetPlanetId);
        if (!targetPlanet || targetPlanet.ownerId !== playerId) break;
        const attacker = getEmpire(state, event.ownerId);
        const eta = state.fleets.find((f) => f.id === event.fleetId)?.ticksRemaining;
        const etaText = eta !== undefined ? `, ETA ${eta} tick${eta === 1 ? '' : 's'}` : '';
        toasts.push({ message: `Incoming fleet from ${attacker?.empireName ?? 'unknown'} → ${targetPlanet.planetName}${etaText}`, isError: true });
        break;
      }
      case 'fleet_arrived': {
        // Fleet is removed before event is appended, so check if target planet is ours
        const arrivalPlanet = getPlanet(state, event.targetPlanetId);
        if (!arrivalPlanet || arrivalPlanet.ownerId !== playerId) break;
        toasts.push({ message: `Fleet arrived at ${arrivalPlanet.planetName}`, isError: false });
        break;
      }
      case 'unit_completed': {
        if (event.empireId !== playerId) break;
        for (const [unitType, count] of Object.entries(event.counts)) {
          if (!count || count <= 0) continue;
          const name = (UNITS as Record<string, { name: string }>)[unitType]?.name ?? unitType;
          unitCounts.set(name, (unitCounts.get(name) ?? 0) + count);
        }
        break;
      }
      case 'notification':
        if (event.empireId !== undefined && event.empireId !== playerId) break;
        if (event.category === 'combat') break;
        toasts.push({ message: event.message, isError: false });
        break;
    }
  }

  for (const [name, count] of unitCounts) {
    toasts.push({ message: count > 1 ? `${count}x ${name} completed` : `${name} completed`, isError: false });
  }

  // Cap toasts per tick so late-game bursts stay readable; errors first.
  const ordered = [...toasts.filter((t) => t.isError), ...toasts.filter((t) => !t.isError)];
  const capped = ordered.slice(0, MAX_TOASTS_PER_TICK);
  const overflow = ordered.length - MAX_TOASTS_PER_TICK;
  if (overflow > 0) {
    capped.push({ message: `+${overflow} more — press N for Notifications`, isError: false });
  }
  return { toasts: capped, localPlayerEliminated };
}
