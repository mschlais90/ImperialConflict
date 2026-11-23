import type { GameState } from '../core/galaxy/galaxyData';
import { calcEmpireNetworth, getPlanetsForEmpire } from '../core/selectors/selectors';
import { getDisplayColor } from './displayColor';
import { createHistoryChart } from './historyChart';

export function errorPanel(message: string): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'game-over-panel interactive';
  panel.textContent = message;
  return panel;
}

export function gameOverScreenPanel(playerWon: boolean, state: GameState | null | undefined, localEmpireId: number): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'game-over-screen interactive';
  const panel = document.createElement('div');
  panel.className = 'game-over-panel';

  const xBtn = document.createElement('button');
  xBtn.type = 'button';
  xBtn.className = 'panel-close-btn';
  xBtn.textContent = '×';
  xBtn.title = 'Close';
  xBtn.addEventListener('click', () => shell.remove());
  panel.append(xBtn);

  const title = document.createElement('h2');
  title.textContent = playerWon ? 'Victory' : 'Defeat';
  const message = document.createElement('p');
  message.textContent = playerWon ? 'Your empire controls the galaxy.' : 'Your empire has fallen.';
  panel.append(title, message);

  if (state && state.empires.length > 0) {
    const results = document.createElement('div');
    results.className = 'game-over-results';
    const header = document.createElement('div');
    header.className = 'game-over-results-header';
    header.innerHTML = '<span>Empire</span><span>Planets</span><span>Networth</span>';
    results.append(header);

    // Same networth formula as the HUD, standings and history chart.
    const ranked = state.empires
      .map((empire) => ({
        empire,
        planets: getPlanetsForEmpire(state, empire.id).length,
        nw: Math.round(calcEmpireNetworth(state, empire.id)),
      }))
      .sort((a, b) => b.nw - a.nw);

    for (const row of ranked) {
      const rowEl = document.createElement('div');
      rowEl.className = 'game-over-results-row';
      const name = document.createElement('span');
      name.textContent = row.empire.empireName;
      name.style.color = getDisplayColor(row.empire, localEmpireId);
      const planets = document.createElement('span');
      planets.textContent = String(row.planets);
      const nw = document.createElement('span');
      nw.textContent = row.nw.toLocaleString('en-US');
      rowEl.append(name, planets, nw);
      results.append(rowEl);
    }
    panel.append(results);

    // History chart
    const snaps = state.tickSnapshots ?? [];
    if (snaps.length > 1) {
      const chart = createHistoryChart(snaps, state.empires, localEmpireId);
      panel.append(chart);
    }
  }

  shell.append(panel);
  return shell;
}

/** Multiplayer "you were eliminated" banner: keep watching or leave. */
export function eliminatedOverlayPanel(onWatch: () => void, onLeave: () => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'eliminated-overlay interactive';
  const banner = document.createElement('div');
  banner.className = 'eliminated-banner';
  const title = document.createElement('h2');
  title.textContent = 'Defeated';
  const msg = document.createElement('p');
  msg.textContent = 'Your empire has been eliminated. You can continue watching or leave.';
  const leaveBtn = document.createElement('button');
  leaveBtn.type = 'button';
  leaveBtn.className = 'ui-button';
  leaveBtn.textContent = 'Leave Game';
  leaveBtn.addEventListener('click', onLeave);
  const watchBtn = document.createElement('button');
  watchBtn.type = 'button';
  watchBtn.className = 'ui-button primary';
  watchBtn.textContent = 'Keep Watching';
  watchBtn.addEventListener('click', onWatch);
  banner.append(title, msg, watchBtn, leaveBtn);
  overlay.append(banner);
  return overlay;
}
