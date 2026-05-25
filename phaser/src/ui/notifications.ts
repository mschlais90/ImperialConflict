import type { EventLogEntry } from '../core/events/eventLog';

export function renderNotifications(events: EventLogEntry[]): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'notifications-panel interactive';
  const title = document.createElement('h2');
  title.textContent = 'Notifications';
  panel.append(title, renderNotificationsContent(events));
  return panel;
}

export function renderNotificationsContent(events: EventLogEntry[]): HTMLElement {
  const frag = document.createElement('div');

  const filtered = events.filter((e) => e.type !== 'building_completed' && e.type !== 'speed_changed');
  for (const event of [...filtered].reverse().slice(0, 6)) {
    const item = document.createElement('div');
    item.className = 'notice';
    item.textContent = eventText(event);
    frag.append(item);
  }

  return frag;
}

function eventText(event: EventLogEntry): string {
  switch (event.type) {
    case 'game_started':
      return `Tick ${event.tick}: ${event.empireName} entered the galaxy.`;
    case 'speed_changed':
      return `Tick ${event.tick}: Speed set to ${event.speed}x.`;
    case 'fleet_launched':
      return `Tick ${event.tick}: Fleet ${event.fleetId} launched.`;
    case 'fleet_arrived':
      return `Tick ${event.tick}: Fleet ${event.fleetId} arrived.`;
    case 'battle_resolved':
      return `Tick ${event.tick}: Battle resolved on planet ${event.planetId}.`;
    case 'building_completed':
      return `Tick ${event.tick}: ${event.buildingType} completed.`;
    case 'unit_completed':
      return `Tick ${event.tick}: ${event.unitType} completed.`;
    case 'planet_colonized':
      return `Tick ${event.tick}: Planet ${event.planetId} colonized.`;
    case 'empire_eliminated':
      return `Tick ${event.tick}: Empire ${event.empireId} eliminated.`;
    case 'notification':
      return `Tick ${event.tick}: ${event.message}`;
    case 'game_over':
      return `Tick ${event.tick}: ${event.playerWon ? 'Victory' : 'Defeat'}.`;
    case 'tick_processed':
      return `Tick ${event.tick}: Economy processed.`;
  }
}
