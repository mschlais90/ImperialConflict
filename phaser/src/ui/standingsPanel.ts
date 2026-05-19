import { calcEmpireNetworth, getPlanetsForEmpire } from '../core/selectors/selectors';
import { formatNumber } from './dom';
import type { UiContext } from './types';

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
    const planets = getPlanetsForEmpire(state, empire.id).length;
    const eliminated = state.events.some((e) => e.type === 'empire_eliminated' && e.empireId === empire.id);
    return { empire, nw, planets, eliminated };
  });

  empireData.sort((a, b) => b.nw - a.nw);

  const table = document.createElement('div');
  table.className = 'standings-table';

  // Header
  const header = document.createElement('div');
  header.className = 'standings-row standings-header';
  header.innerHTML = '<span>Empire</span><span>Networth</span><span>Planets</span><span>Status</span>';
  table.append(header);

  for (const row of empireData) {
    const rowEl = document.createElement('div');
    rowEl.className = 'standings-row';
    if (row.empire.isPlayer) {
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
    status.textContent = row.eliminated ? 'Eliminated' : 'Active';

    rowEl.append(name, nw, planets, status);
    table.append(rowEl);
  }

  panel.append(table);
  return panel;
}
