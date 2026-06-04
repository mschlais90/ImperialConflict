import type { CombatUnitKey } from '../core/models/types';
import { calcEmpireNetworth, getPlanetsForEmpire } from '../core/selectors/selectors';
import { formatNumber } from './dom';
import type { UiContext } from './types';

const COMBAT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];

type StandingsSortColumn = 'name' | 'networth' | 'planets' | 'military' | 'status';
let sortColumn: StandingsSortColumn = 'networth';
let sortAsc = false;

const HEADERS_SP: Array<{ label: string; column: StandingsSortColumn }> = [
  { label: 'Empire', column: 'name' },
  { label: 'Networth', column: 'networth' },
  { label: 'Planets', column: 'planets' },
  { label: 'Military', column: 'military' },
  { label: 'Status', column: 'status' },
];

const HEADERS_MP: Array<{ label: string; column: StandingsSortColumn }> = [
  { label: 'Empire', column: 'name' },
  { label: 'Networth', column: 'networth' },
  { label: 'Planets', column: 'planets' },
  { label: 'Status', column: 'status' },
];

export function renderStandingsPanel(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Standings panel requires game state.');
  }

  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Player Standings';
  const hint = document.createElement('p');
  hint.className = 'empty-text';
  hint.textContent = 'Press A to return';
  panel.append(title, hint);

  const empireData = state.empires.map((empire) => {
    const nw = calcEmpireNetworth(state, empire.id);
    const empirePlanets = getPlanetsForEmpire(state, empire.id);
    const planets = empirePlanets.length;
    let military = 0;
    for (const p of empirePlanets) {
      for (const k of COMBAT_KEYS) military += p.units[k] ?? 0;
    }
    for (const f of state.fleets) {
      if (f.ownerId !== empire.id || f.isExploration) continue;
      for (const k of COMBAT_KEYS) military += f.units[k] ?? 0;
    }
    const eliminated = empire.isEliminated;
    return { empire, nw, planets, military, eliminated };
  });

  const dir = sortAsc ? 1 : -1;
  empireData.sort((a, b) => {
    let cmp = 0;
    switch (sortColumn) {
      case 'name':
        cmp = a.empire.empireName.localeCompare(b.empire.empireName);
        break;
      case 'networth':
        cmp = a.nw - b.nw;
        break;
      case 'planets':
        cmp = a.planets - b.planets;
        break;
      case 'military':
        cmp = a.military - b.military;
        break;
      case 'status':
        cmp = (a.eliminated ? 1 : 0) - (b.eliminated ? 1 : 0);
        break;
    }
    return cmp * dir;
  });

  const isMP = context.controller.isMultiplayer;

  const table = document.createElement('div');
  table.className = isMP ? 'standings-table standings-table-mp' : 'standings-table';

  const headers = isMP ? HEADERS_MP : HEADERS_SP;

  // Reset sort column if it was 'military' and we switched to MP
  if (isMP && sortColumn === 'military') sortColumn = 'networth';

  // Header
  const headerRow = document.createElement('div');
  headerRow.className = 'standings-row standings-header';
  for (const hdr of headers) {
    const cell = document.createElement('span');
    cell.className = 'standings-header-sortable';
    const arrow = sortColumn === hdr.column ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';
    cell.textContent = hdr.label + arrow;
    const col = hdr.column;
    cell.addEventListener('click', () => {
      if (sortColumn === col) {
        sortAsc = !sortAsc;
      } else {
        sortColumn = col;
        sortAsc = col === 'name' || col === 'status';
      }
      context.controller.overlay.render();
    });
    headerRow.append(cell);
  }
  table.append(headerRow);

  for (const row of empireData) {
    const rowEl = document.createElement('div');
    rowEl.className = 'standings-row';
    if (row.empire.controllerType === 'human') {
      rowEl.classList.add('standings-player');
    }
    if (row.eliminated) {
      rowEl.classList.add('standings-eliminated');
    }

    const name = document.createElement('span');
    name.textContent = row.empire.empireName;
    name.style.color = row.empire.color;

    const nw = document.createElement('span');
    nw.textContent = formatNumber(Math.floor(row.nw));

    const planets = document.createElement('span');
    planets.textContent = String(row.planets);

    const status = document.createElement('span');
    const isDisconnected = context.disconnectedPlayers.has(row.empire.id);
    if (row.eliminated) {
      status.textContent = 'Eliminated';
    } else if (isDisconnected) {
      status.textContent = 'Offline';
      status.classList.add('standings-offline');
    } else {
      status.textContent = isMP && row.empire.controllerType === 'human' ? 'Online' : 'Active';
    }

    if (isMP) {
      rowEl.append(name, nw, planets, status);
    } else {
      const military = document.createElement('span');
      military.textContent = formatNumber(row.military);
      rowEl.append(name, nw, planets, military, status);
    }
    table.append(rowEl);
  }

  panel.append(table);
  return panel;
}
