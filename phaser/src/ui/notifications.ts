import type { EventLogEntry } from '../core/events/eventLog';
import type { GameState } from '../core/galaxy/galaxyData';
import { getEmpire, getPlanet, getSystem } from '../core/selectors/selectors';

export function renderNotifications(state: GameState): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'notifications-panel interactive';
  const title = document.createElement('h2');
  title.textContent = 'Notifications';
  panel.append(title, renderNotificationsContent(state));
  return panel;
}

export function renderNotificationsContent(state: GameState): HTMLElement {
  const frag = document.createElement('div');

  const filtered = state.events.filter((e) => e.type !== 'building_completed' && e.type !== 'speed_changed' && e.type !== 'tick_processed');
  for (const event of [...filtered].reverse().slice(0, 12)) {
    const item = document.createElement('div');
    item.className = 'notice';
    item.textContent = eventText(event, state);
    frag.append(item);
  }

  return frag;
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
    case 'unit_completed':
      return `Tick ${event.tick}: ${event.unitType} completed.`;
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
