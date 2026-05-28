import type { BattleReport } from '../core/engines/combatEngine';
import { getEmpire } from '../core/selectors/selectors';
import { calcBattleLosses, renderBattleReportContent } from './battleReport';
import { formatNumber } from './dom';
import type { UiContext } from './types';

interface BattleEntry {
  tick: number;
  report: BattleReport;
  attackerName: string;
  defenderName: string;
  isPlayerAttacker: boolean;
}

export function renderBattleHistoryPanel(context: UiContext): HTMLElement {
  const state = context.controller.state!;
  const playerId = context.player.id;

  const battles: BattleEntry[] = [];
  for (const event of state.events) {
    if (event.type !== 'battle_resolved') continue;
    if (event.attackerId !== playerId && event.defenderId !== playerId) continue;
    const attackerEmpire = getEmpire(state, event.attackerId);
    const defenderEmpire = getEmpire(state, event.defenderId);
    battles.push({
      tick: event.tick,
      report: event.report,
      attackerName: attackerEmpire?.empireName ?? 'Unknown',
      defenderName: defenderEmpire?.empireName ?? 'Unknown',
      isPlayerAttacker: event.attackerId === playerId,
    });
  }

  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Battle History';
  panel.append(title);

  if (battles.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-text';
    empty.textContent = 'No battles yet.';
    panel.append(empty);
    return panel;
  }

  // Stats banner
  let wins = 0;
  let totalPlayerLosses = 0;
  let totalEnemyLosses = 0;
  for (const entry of battles) {
    const playerWon = entry.report.attackerWon === entry.isPlayerAttacker;
    if (playerWon) wins++;
    totalPlayerLosses += calcBattleLosses(entry.report, entry.isPlayerAttacker);
    totalEnemyLosses += calcBattleLosses(entry.report, !entry.isPlayerAttacker);
  }
  const losses = battles.length - wins;
  const winRate = battles.length > 0 ? Math.round((wins / battles.length) * 100) : 0;

  const stats = document.createElement('div');
  stats.className = 'battle-history-stats';
  stats.textContent = `${wins}W ${losses}L (${winRate}%) | Your losses: ${formatNumber(totalPlayerLosses)} | Enemy losses: ${formatNumber(totalEnemyLosses)}`;
  panel.append(stats);

  // Container that switches between list and detail view
  const container = document.createElement('div');
  container.className = 'panel-stack';
  panel.append(container);

  renderList(container, battles);

  return panel;
}

function renderList(container: HTMLElement, battles: BattleEntry[]): void {
  container.replaceChildren();

  const hint = document.createElement('p');
  hint.className = 'battle-history-hint';
  hint.textContent = 'Click a battle to view details.';
  container.append(hint);

  const table = document.createElement('div');
  table.className = 'battle-history-table';

  // Header
  table.append(
    hdrCell('Tick'),
    hdrCell('Result'),
    hdrCell('Planet'),
    hdrCell('Opponent'),
    hdrCell('Losses'),
  );

  // Rows in reverse chronological order
  for (const entry of [...battles].reverse()) {
    const { report } = entry;
    const playerWon = report.attackerWon === entry.isPlayerAttacker;
    const opponent = entry.isPlayerAttacker ? entry.defenderName : entry.attackerName;
    const losses = calcBattleLosses(report, entry.isPlayerAttacker);

    const tickCell = textCell(String(entry.tick));
    const resultCell = textCell(playerWon ? 'WON' : 'LOST');
    resultCell.classList.add(playerWon ? 'history-won' : 'history-lost');
    const planetCell = textCell(report.planetName);
    const opponentCell = textCell(opponent);
    const lossesCell = textCell(formatNumber(losses));

    const cells = [tickCell, resultCell, planetCell, opponentCell, lossesCell];
    for (const cell of cells) {
      cell.classList.add('battle-history-row');
      cell.addEventListener('click', () => {
        renderDetail(container, battles, entry);
      });
    }
    table.append(...cells);
  }

  container.append(table);
}

function renderDetail(container: HTMLElement, battles: BattleEntry[], entry: BattleEntry): void {
  container.replaceChildren();

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'ui-button battle-history-back';
  backBtn.textContent = 'Back to list';
  backBtn.addEventListener('click', () => {
    renderList(container, battles);
  });
  container.append(backBtn);

  const content = renderBattleReportContent(
    entry.report,
    entry.attackerName,
    entry.defenderName,
    entry.isPlayerAttacker,
  );
  container.append(content);
}

function hdrCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'battle-history-header';
  cell.textContent = text;
  return cell;
}

function textCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.textContent = text;
  return cell;
}
