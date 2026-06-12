import { UNITS } from '../core/data/units';
import type { BattleReport } from '../core/engines/combatEngine';
import type { EventLogEntry } from '../core/events/eventLog';
import type { GameState } from '../core/galaxy/galaxyData';
import type { UnitKey } from '../core/models/types';
import { getEmpire, getPlanet, getSystem } from '../core/selectors/selectors';

export interface NotificationCallbacks {
  onNavigateToPlanet: (systemId: number, planetId: number) => void;
  onViewBattle: (report: BattleReport, attackerId: number, defenderId: number) => void;
}

export function renderNotificationsContent(
  state: GameState,
  playerId: number,
  callbacks?: NotificationCallbacks,
): HTMLElement {
  const frag = document.createElement('div');

  const filtered = state.events.filter((e) => isRelevantToPlayer(e, state, playerId));
  for (const event of [...filtered].reverse().slice(0, 200)) {
    const item = document.createElement('div');
    item.className = 'notice';
    buildEventContent(item, event, state, callbacks);
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

function planetLink(
  planet: { planetName: string; systemId: number; id: number },
  callbacks?: NotificationCallbacks,
): HTMLElement {
  if (!callbacks) {
    const span = document.createElement('span');
    span.textContent = planet.planetName;
    return span;
  }
  const link = document.createElement('a');
  link.className = 'notice-link';
  link.textContent = planet.planetName;
  link.href = '#';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    callbacks.onNavigateToPlanet(planet.systemId, planet.id);
  });
  return link;
}

function battleLink(
  text: string,
  report: BattleReport,
  attackerId: number,
  defenderId: number,
  callbacks?: NotificationCallbacks,
): HTMLElement {
  if (!callbacks) {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }
  const link = document.createElement('a');
  link.className = 'notice-link';
  link.textContent = text;
  link.href = '#';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    callbacks.onViewBattle(report, attackerId, defenderId);
  });
  return link;
}

function buildEventContent(
  container: HTMLElement,
  event: EventLogEntry,
  state: GameState,
  callbacks?: NotificationCallbacks,
): void {
  switch (event.type) {
    case 'game_started':
      container.textContent = `Tick ${event.tick}: ${event.empireName} entered the galaxy.`;
      return;
    case 'speed_changed':
      container.textContent = `Tick ${event.tick}: Speed set to ${event.speed}x.`;
      return;
    case 'fleet_launched': {
      const target = getPlanet(state, event.targetPlanetId);
      const sys = getSystem(state, event.targetSystemId);
      container.append(`Tick ${event.tick}: Fleet launched to `);
      if (target) {
        container.append(planetLink(target, callbacks));
        container.append(` (${sys?.systemName ?? 'unknown'}).`);
      } else {
        container.append(`planet ${event.targetPlanetId}.`);
      }
      return;
    }
    case 'fleet_arrived': {
      const target = getPlanet(state, event.targetPlanetId);
      container.append(`Tick ${event.tick}: Fleet arrived at `);
      if (target) {
        container.append(planetLink(target, callbacks));
        container.append('.');
      } else {
        container.append(`planet ${event.targetPlanetId}.`);
      }
      return;
    }
    case 'battle_resolved': {
      const planet = getPlanet(state, event.planetId);
      const attacker = getEmpire(state, event.attackerId);
      const defender = getEmpire(state, event.defenderId);
      container.append(`Tick ${event.tick}: Battle at `);
      if (planet) {
        container.append(planetLink(planet, callbacks));
      } else {
        container.append(`planet ${event.planetId}`);
      }
      container.append(
        ` \u2014 ${attacker?.empireName ?? 'Unknown'} vs ${defender?.empireName ?? 'Unknown'}. `,
      );
      container.append(
        battleLink('[Report]', event.report, event.attackerId, event.defenderId, callbacks),
      );
      return;
    }
    case 'building_completed':
      container.textContent = `Tick ${event.tick}: ${event.buildingType} completed.`;
      return;
    case 'unit_completed': {
      const parts = (Object.entries(event.counts) as Array<[UnitKey, number]>)
        .filter(([, count]) => count > 0)
        .map(([unit, count]) => `${count} ${UNITS[unit].name}${count > 1 ? 's' : ''}`);
      container.textContent = `Tick ${event.tick}: Trained ${parts.join(', ')}.`;
      return;
    }
    case 'planet_colonized': {
      const planet = getPlanet(state, event.planetId);
      const empire = getEmpire(state, event.empireId);
      container.append(`Tick ${event.tick}: ${empire?.empireName ?? 'Unknown'} colonized `);
      if (planet) {
        container.append(planetLink(planet, callbacks));
        container.append('.');
      } else {
        container.append(`planet ${event.planetId}.`);
      }
      return;
    }
    case 'empire_eliminated': {
      const empire = getEmpire(state, event.empireId);
      container.textContent = `Tick ${event.tick}: ${empire?.empireName ?? `Empire ${event.empireId}`} eliminated.`;
      return;
    }
    case 'notification':
      container.textContent = `Tick ${event.tick}: ${event.message}`;
      return;
    case 'game_over':
      container.textContent = `Tick ${event.tick}: ${event.playerWon ? 'Victory' : 'Defeat'}.`;
      return;
  }
}
