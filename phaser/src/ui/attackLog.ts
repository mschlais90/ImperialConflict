import type { BattleReport } from '../core/engines/combatEngine';
import type { GameState } from '../core/galaxy/galaxyData';
import { getPlanet, getSystem } from '../core/selectors/selectors';
import { calcBattleLosses } from './battleReport';
import { clearElement, formatNumber } from './dom';

export interface AttackLogCallbacks {
  onNavigate(systemId: number, planetId: number): void;
  onViewReport(report: BattleReport): void;
}

export interface AttackLog {
  element: HTMLElement;
  update(state: GameState, playerId: number): void;
}

/**
 * Persistent attack log window (upper-right, below the HUD).
 * The outer element is created once and survives overlay re-renders, so the
 * To/From checkboxes and collapse state are never reset by the tick cycle.
 * Only the row list is rebuilt, and only when its contents actually change.
 */
export function createAttackLog(callbacks: AttackLogCallbacks): AttackLog {
  let collapsed = false;
  let showTo = true;
  let showFrom = true;
  let lastSignature = '';
  let currentState: GameState | null = null;
  let currentPlayerId = -1;

  const element = document.createElement('div');
  element.className = 'attack-log-panel interactive';

  // Header: title + collapse button
  const header = document.createElement('div');
  header.className = 'attack-log-header';
  const title = document.createElement('span');
  title.className = 'attack-log-title';
  title.textContent = 'Attack Log';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'attack-log-collapse';
  collapseBtn.textContent = '\u25BE';
  collapseBtn.title = 'Collapse';
  header.append(title, collapseBtn);
  header.addEventListener('click', () => {
    collapsed = !collapsed;
    collapseBtn.textContent = collapsed ? '\u25B8' : '\u25BE';
    collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
    body.style.display = collapsed ? 'none' : '';
  });

  // Body: filters + list
  const body = document.createElement('div');
  body.className = 'attack-log-body';

  const filters = document.createElement('div');
  filters.className = 'attack-log-filters';
  const toCheckbox = filterCheckbox('To', 'Attacks against your empire', true, (checked) => {
    showTo = checked;
    rebuildList();
  });
  const fromCheckbox = filterCheckbox('From', 'Attacks launched by your empire', true, (checked) => {
    showFrom = checked;
    rebuildList();
  });
  filters.append(toCheckbox, fromCheckbox);

  const list = document.createElement('div');
  list.className = 'attack-log-list';

  body.append(filters, list);
  element.append(header, body);

  function rebuildList(): void {
    const state = currentState;
    if (!state) return;

    const battles = state.events.filter(
      (e) => e.type === 'battle_resolved'
        && ((showFrom && e.attackerId === currentPlayerId) || (showTo && e.defenderId === currentPlayerId)),
    );

    const scrollTop = list.scrollTop;
    clearElement(list);

    if (battles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'attack-log-empty';
      empty.textContent = 'No attacks yet.';
      list.append(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'attack-log-grid';
    grid.append(
      gridHeader('System'),
      gridHeader('Result'),
      gridHeader('Lost'),
    );

    // Newest first
    for (let i = battles.length - 1; i >= 0; i--) {
      const event = battles[i];
      if (event.type !== 'battle_resolved') continue;
      const report = event.report;
      const isPlayerAttacker = event.attackerId === currentPlayerId;
      const playerWon = report.attackerWon === isPlayerAttacker;

      const planet = getPlanet(state, event.planetId);
      const system = planet ? getSystem(state, planet.systemId) : undefined;

      const systemBtn = document.createElement('button');
      systemBtn.type = 'button';
      systemBtn.className = 'attack-log-cell attack-log-link';
      systemBtn.textContent = system?.systemName ?? 'Unknown';
      systemBtn.title = `Go to ${planet?.planetName ?? 'planet'}`;
      if (planet && system) {
        systemBtn.addEventListener('click', () => callbacks.onNavigate(system.id, planet.id));
      }

      const resultBtn = document.createElement('button');
      resultBtn.type = 'button';
      resultBtn.className = playerWon
        ? 'attack-log-cell attack-log-link attack-log-win'
        : 'attack-log-cell attack-log-link attack-log-lost';
      resultBtn.textContent = playerWon ? 'Win' : 'Lost';
      resultBtn.title = 'View battle report';
      resultBtn.addEventListener('click', () => callbacks.onViewReport(report));

      const lost = document.createElement('span');
      lost.className = 'attack-log-cell';
      lost.textContent = formatNumber(calcBattleLosses(report, isPlayerAttacker));

      grid.append(systemBtn, resultBtn, lost);
    }

    list.append(grid);
    list.scrollTop = scrollTop;
  }

  function update(state: GameState, playerId: number): void {
    currentState = state;
    currentPlayerId = playerId;

    const battleEvents = state.events.filter((e) => e.type === 'battle_resolved');
    const lastId = battleEvents.length > 0 ? battleEvents[battleEvents.length - 1].id : -1;
    const signature = `${playerId}:${battleEvents.length}:${lastId}:${showTo}:${showFrom}`;
    if (signature === lastSignature) return;
    lastSignature = signature;
    rebuildList();
  }

  return { element, update };
}

function filterCheckbox(
  label: string,
  tooltip: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'attack-log-filter';
  wrap.title = tooltip;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onChange(checkbox.checked));
  wrap.append(checkbox, document.createTextNode(` ${label}`));
  return wrap;
}

function gridHeader(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'attack-log-grid-header';
  cell.textContent = text;
  return cell;
}
