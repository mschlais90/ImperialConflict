import { UNITS } from '../core/data/units';
import type { EventLogEntry } from '../core/events/eventLog';
import type { GameState } from '../core/galaxy/galaxyData';
import type { UnitKey } from '../core/models/types';
import { getEmpire, getPlanet, getSystem } from '../core/selectors/selectors';

export function renderNotificationsContent(state: GameState, playerId: number): HTMLElement {
  const frag = document.createElement('div');

  const filtered = state.events.filter((e) => isRelevantToPlayer(e, state, playerId));
  for (const event of [...filtered].reverse().slice(0, 200)) {
    const item = document.createElement('div');
    item.className = 'notice';
    item.textContent = eventText(event, state);
    frag.append(item);
  }

  return frag;
}

/** Returns true if the event is relevant to the given player. */
function isRelevantToPlayer(event: EventLogEntry, state: GameState, playerId: number): boolean {
  switch (event.type) {
    // Always hidden
    case 'building_completed':
    case 'speed_changed':
    case 'tick_processed':
      return false;

    // Always shown
    case 'game_started':
    case 'empire_eliminated':
    case 'game_over':
      return true;

    // Only show the player's own fleets
    case 'fleet_launched':
      return event.ownerId === playerId;
    case 'fleet_arrived': {
      const planet = getPlanet(state, event.targetPlanetId);
      return planet !== undefined && planet.ownerId === playerId;
    }

    // Battles: only if the player is the attacker or defender
    case 'battle_resolved':
      return event.attackerId === playerId || event.defenderId === playerId;

    // Only the player's own units
    case 'unit_completed':
      return event.empireId === playerId;

    // Only the player's own colonizations
    case 'planet_colonized':
      return event.empireId === playerId;

    // Notifications (ops, starvation, combat): already scoped by the emitter
    case 'notification':
      return true;
  }
}

function eventText(event: EventLogEntry, state: GameState): string {
  switch (event.type) {
    case 'game_started':
      return `Tick ${event.tick}: ${event.empireName} entered the galaxy.`;
    case 'speed_changed':
      return `Tick ${event.tick}: Speed set to ${event.speed}x.`;
    case 'fleet_launched': {
      const target = getPlanet(state, event.targetPlanetId);
      const sys = getSystem(state, event.targetSystemId);
      const dest = target ? `${target.planetName} (${sys?.systemName ?? 'unknown'})` : `planet ${event.targetPlanetId}`;
      return `Tick ${event.tick}: Fleet launched to ${dest}.`;
    }
    case 'fleet_arrived': {
      const target = getPlanet(state, event.targetPlanetId);
      return `Tick ${event.tick}: Fleet arrived at ${target?.planetName ?? `planet ${event.targetPlanetId}`}.`;
    }
    case 'battle_resolved': {
      const planet = getPlanet(state, event.planetId);
      const attacker = getEmpire(state, event.attackerId);
      const defender = getEmpire(state, event.defenderId);
      const planetName = planet?.planetName ?? `planet ${event.planetId}`;
      return `Tick ${event.tick}: Battle at ${planetName} — ${attacker?.empireName ?? 'Unknown'} vs ${defender?.empireName ?? 'Unknown'}.`;
    }
    case 'building_completed':
      return `Tick ${event.tick}: ${event.buildingType} completed.`;
    case 'unit_completed': {
      const parts = (Object.entries(event.counts) as Array<[UnitKey, number]>)
        .filter(([, count]) => count > 0)
        .map(([unit, count]) => `${count} ${UNITS[unit].name}${count > 1 ? 's' : ''}`);
      return `Tick ${event.tick}: Trained ${parts.join(', ')}.`;
    }
    case 'planet_colonized': {
      const planet = getPlanet(state, event.planetId);
      const empire = getEmpire(state, event.empireId);
      return `Tick ${event.tick}: ${empire?.empireName ?? 'Unknown'} colonized ${planet?.planetName ?? `planet ${event.planetId}`}.`;
    }
    case 'empire_eliminated': {
      const empire = getEmpire(state, event.empireId);
      return `Tick ${event.tick}: ${empire?.empireName ?? `Empire ${event.empireId}`} eliminated.`;
    }
    case 'notification':
      return `Tick ${event.tick}: ${event.message}`;
    case 'game_over':
      return `Tick ${event.tick}: ${event.playerWon ? 'Victory' : 'Defeat'}.`;
    case 'tick_processed':
      return `Tick ${event.tick}: Economy processed.`;
  }
}
