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
  onSkipAll?: () => void,
): HTMLElement {
  const screen = document.createElement('div');
  screen.className = 'battle-report-screen interactive';

  const panel = document.createElement('div');
  panel.className = 'battle-report-panel';

  panel.append(renderBattleReportContent(report, attackerName, defenderName, isPlayerAttacker));

  const btnRow = document.createElement('div');
  btnRow.className = 'battle-report-btn-row';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ui-button primary battle-report-close';
  closeBtn.textContent = 'Continue';
  closeBtn.addEventListener('click', onClose);
  btnRow.append(closeBtn);

  if (onSkipAll) {
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'ui-button battle-report-skip';
    skipBtn.textContent = 'Skip All';
    skipBtn.addEventListener('click', onSkipAll);
    btnRow.append(skipBtn);
  }

  panel.append(btnRow);
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

  // Casualty summary
  const atkLosses = calcBattleLosses(report, true);
  const defLosses = calcBattleLosses(report, false);
  if (atkLosses > 0 || defLosses > 0) {
    frag.append(separator(), sectionHeader('Casualties'));
    const atkRow = detailRow('Attacker lost', `${formatNumber(atkLosses)} units`);
    const defRow = detailRow('Defender lost', `${formatNumber(defLosses)} units`);
    if (isPlayerAttacker) {
      atkRow.querySelector('.battle-detail-value')!.classList.add('loss');
      defRow.querySelector('.battle-detail-value')!.classList.add('battle-kills');
    } else {
      defRow.querySelector('.battle-detail-value')!.classList.add('loss');
      atkRow.querySelector('.battle-detail-value')!.classList.add('battle-kills');
    }
    frag.append(atkRow, defRow);
    if (atkLosses > 0 && defLosses > 0) {
      const ratio = atkLosses >= defLosses
        ? `1:${(atkLosses / defLosses).toFixed(1)}`
        : `${(defLosses / atkLosses).toFixed(1)}:1`;
      frag.append(detailRow('Kill ratio (def:atk)', ratio));
    }
  }

  // Retreat summary
  {
    const retreatLines: Array<[string, string]> = [];
    if (report.attackerWon && report.defenderRetreated) {
      const retreated = COMBAT_DISPLAY
        .filter((unit) => (report.defenderRetreated![unit] ?? 0) > 0)
        .map((unit) => `${formatNumber(report.defenderRetreated![unit]!)} ${UNITS[unit].name}`);
      if (retreated.length > 0) {
        retreatLines.push(['Defender retreated via portal', retreated.join(', ')]);
      }
    }
    if (!report.attackerWon && report.attackerRetreated) {
      const retreated = COMBAT_DISPLAY
        .filter((unit) => (report.attackerRetreated![unit] ?? 0) > 0)
        .map((unit) => `${formatNumber(report.attackerRetreated![unit]!)} ${UNITS[unit].name}`);
      if (retreated.length > 0) {
        retreatLines.push(['Attacker retreated via portal', retreated.join(', ')]);
      }
    }
    if (retreatLines.length > 0) {
      frag.append(separator(), sectionHeader('Retreat'));
      for (const [label, value] of retreatLines) {
        frag.append(detailRow(label, value));
      }
    }
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

export function calcBattleLosses(report: BattleReport, isAttacker: boolean): number {
  // The loser of a battle loses all units that didn't retreat.
  // Survivors retreat to a portal if one exists; the rest are destroyed.
  if (!isAttacker && report.attackerWon) {
    // Defender lost — initial minus any that retreated to a portal
    let total = 0;
    for (const unit of COMBAT_DISPLAY) {
      const initial = (report.defenderInitial as Partial<Record<PlanetUnitKey, number>>)[unit] ?? 0;
      const retreated = report.defenderRetreated?.[unit] ?? 0;
      total += initial - retreated;
    }
    return total;
  }
  if (isAttacker && !report.attackerWon) {
    // Attacker lost — initial minus any that retreated to a portal
    let total = 0;
    for (const unit of COMBAT_DISPLAY) {
      const initial = report.attackerInitial[unit] ?? 0;
      const retreated = report.attackerRetreated?.[unit] ?? 0;
      total += initial - retreated;
    }
    return total;
  }

  // Winner's losses: sum phase-by-phase
  let losses = 0;
  for (const phase of report.phases) {
    switch (phase.phase) {
      case 'Air vs Ground':
        if (isAttacker) {
          losses += phase.bombersLost + phase.transportsLost
            + phase.groundLostToTransports.soldiersKilled
            + phase.groundLostToTransports.droidsKilled;
        }
        break;
      case 'Air vs Air':
        losses += isAttacker ? phase.atkFightersLost : phase.defFightersLost;
        if (isAttacker) {
          losses += phase.transportsLostToFighters
            + phase.groundLostToTransports.soldiersKilled
            + phase.groundLostToTransports.droidsKilled;
        }
        break;
      case 'Ground vs Ground':
        if (isAttacker) {
          losses += phase.atkSoldiersLost + phase.atkDroidsLost;
        } else {
          losses += phase.defSoldiersLost + phase.defDroidsLost;
        }
        break;
    }
  }
  return losses;
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
