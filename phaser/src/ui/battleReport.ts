import type { BattlePhaseReport, BattleReport } from '../core/engines/combatEngine';
import { UNITS } from '../core/data/units';
import type { CombatUnitKey, PlanetUnitKey } from '../core/models/types';

import { formatNumber } from './dom';

const COMBAT_DISPLAY: CombatUnitKey[] = ['fighter', 'bomber', 'transport', 'soldier', 'droid'];

export function renderBattleReport(
  report: BattleReport,
  attackerName: string,
  defenderName: string,
  isPlayerAttacker: boolean,
  onClose: () => void,
): HTMLElement {
  const screen = document.createElement('div');
  screen.className = 'battle-report-screen';

  const panel = document.createElement('div');
  panel.className = 'battle-report-panel';

  panel.append(renderBattleReportContent(report, attackerName, defenderName, isPlayerAttacker));

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ui-button primary battle-report-close';
  closeBtn.textContent = 'Continue';
  closeBtn.addEventListener('click', onClose);
  panel.append(closeBtn);

  screen.append(panel);
  return screen;
}

export function renderBattleReportContent(
  report: BattleReport,
  attackerName: string,
  defenderName: string,
  isPlayerAttacker: boolean,
): HTMLElement {
  const frag = document.createElement('div');

  // Title
  const title = document.createElement('h2');
  title.className = 'battle-report-title';
  if (isPlayerAttacker) {
    title.textContent = report.attackerWon ? 'VICTORY!' : 'DEFEAT!';
  } else {
    title.textContent = 'PLANET UNDER ATTACK!';
  }
  const playerWon = report.attackerWon === isPlayerAttacker;
  title.classList.add(playerWon ? 'victory' : 'defeat');
  frag.append(title);

  // Subtitle
  const subtitle = document.createElement('p');
  subtitle.className = 'battle-report-subtitle';
  subtitle.textContent = `${attackerName} attacked ${defenderName} at ${report.planetName}`;
  frag.append(subtitle);

  // Initial Forces
  frag.append(separator(), sectionHeader('Initial Forces'));

  const forcesGrid = document.createElement('div');
  forcesGrid.className = 'battle-forces-grid';

  forcesGrid.append(headerCell(''), headerCell('Attacker'), headerCell('Defender'));

  for (const unit of COMBAT_DISPLAY) {
    const atkCount = report.attackerInitial[unit] ?? 0;
    const defCount = (report.defenderInitial as Partial<Record<PlanetUnitKey, number>>)[unit] ?? 0;
    if (atkCount === 0 && defCount === 0) continue;
    forcesGrid.append(
      labelCell(UNITS[unit].name),
      valueCell(formatNumber(atkCount)),
      valueCell(formatNumber(defCount)),
    );
  }

  if (report.defenderLasers > 0) {
    forcesGrid.append(
      labelCell('Lasers'),
      valueCell('-'),
      valueCell(formatNumber(report.defenderLasers)),
    );
  }

  frag.append(forcesGrid);

  // Phase details
  for (const phase of report.phases) {
    frag.append(separator(), renderPhase(phase));
  }

  // Outcome
  frag.append(separator());
  const outcome = document.createElement('p');
  outcome.className = 'battle-report-outcome';
  if (report.attackerWon) {
    outcome.textContent = `${attackerName} captured ${report.planetName}!`;
  } else {
    outcome.textContent = `${defenderName} defended ${report.planetName} successfully!`;
  }
  frag.append(outcome);

  return frag;
}

function renderPhase(phase: BattlePhaseReport): HTMLElement {
  const frag = document.createElement('div');
  frag.append(sectionHeader(phase.phase));

  switch (phase.phase) {
    case 'Air vs Ground': {
      frag.append(
        detailRow('Lasers destroyed', formatNumber(phase.lasersDestroyed)),
        detailRow('Lasers remaining', formatNumber(phase.remainingLasers)),
        detailRow('Bombers lost', formatNumber(phase.bombersLost), true),
        detailRow('Transports lost', formatNumber(phase.transportsLost), true),
      );
      const stranded = phase.groundLostToTransports;
      if (stranded.soldiersKilled > 0 || stranded.droidsKilled > 0) {
        frag.append(
          detailRow('Soldiers stranded', formatNumber(stranded.soldiersKilled), true),
          detailRow('Droids stranded', formatNumber(stranded.droidsKilled), true),
        );
      }
      break;
    }
    case 'Air vs Air': {
      frag.append(
        detailRow('Attacker fighters lost', formatNumber(phase.atkFightersLost), true),
        detailRow('Defender fighters lost', formatNumber(phase.defFightersLost), true),
      );
      if (phase.transportsLostToFighters > 0) {
        frag.append(detailRow('Transports shot down', formatNumber(phase.transportsLostToFighters), true));
      }
      const stranded = phase.groundLostToTransports;
      if (stranded.soldiersKilled > 0 || stranded.droidsKilled > 0) {
        frag.append(
          detailRow('Soldiers stranded', formatNumber(stranded.soldiersKilled), true),
          detailRow('Droids stranded', formatNumber(stranded.droidsKilled), true),
        );
      }
      break;
    }
    case 'Ground vs Ground': {
      frag.append(
        detailRow('Attacker ground power', formatNumber(phase.atkPower)),
        detailRow('Defender ground power', formatNumber(phase.defPower)),
        detailRow('Attacker soldiers lost', formatNumber(phase.atkSoldiersLost), true),
        detailRow('Attacker droids lost', formatNumber(phase.atkDroidsLost), true),
        detailRow('Defender soldiers lost', formatNumber(phase.defSoldiersLost), true),
        detailRow('Defender droids lost', formatNumber(phase.defDroidsLost), true),
      );
      const result = document.createElement('p');
      result.className = phase.attackerWon ? 'battle-phase-result victory' : 'battle-phase-result defeat';
      result.textContent = phase.attackerWon ? 'Attacker wins ground battle!' : 'Defender holds ground!';
      frag.append(result);
      break;
    }
  }

  return frag;
}

function detailRow(label: string, value: string, isLoss = false): HTMLElement {
  const row = document.createElement('div');
  row.className = 'battle-detail-row';
  const lbl = document.createElement('span');
  lbl.className = 'battle-detail-label';
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = isLoss ? 'battle-detail-value loss' : 'battle-detail-value';
  val.textContent = value;
  row.append(lbl, val);
  return row;
}

function sectionHeader(text: string): HTMLElement {
  const header = document.createElement('h3');
  header.className = 'battle-section-header';
  header.textContent = text;
  return header;
}

function separator(): HTMLElement {
  const sep = document.createElement('hr');
  sep.className = 'battle-separator';
  return sep;
}

function headerCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'battle-forces-header';
  cell.textContent = text;
  return cell;
}

function labelCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'battle-forces-label';
  cell.textContent = text;
  return cell;
}

function valueCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'battle-forces-value';
  cell.textContent = text;
  return cell;
}
