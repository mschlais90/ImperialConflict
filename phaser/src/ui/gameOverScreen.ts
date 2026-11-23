import type { GameState } from '../core/galaxy/galaxyData';
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

    const ranked = state.empires
      .map((empire) => {
        const planets = state.planets.filter((p) => p.ownerId === empire.id).length;
        let nw = planets * 100;
        for (const p of state.planets.filter((p) => p.ownerId === empire.id)) {
          for (const key of Object.keys(p.buildings) as Array<keyof typeof p.buildings>) {
            nw += (p.buildings[key] ?? 0) * 50;
          }
        }
        return { empire, planets, nw };
      })
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
      nw.textContent = String(row.nw);
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
