import { resolveBattle } from '../core/engines/combatEngine';
import { createEmptyGameState } from '../core/galaxy/galaxyData';
import { createEmpire, createPlanet, type CombatUnitKey } from '../core/models/types';
import { createSeededRng } from '../core/random/rng';
import { calcEmpireNetworth } from '../core/selectors/selectors';
import { renderBattleReportContent } from './battleReport';
import { button } from './dom';

const COMBAT_UNITS: CombatUnitKey[] = ['fighter', 'bomber', 'transport', 'soldier', 'droid'];
const UNIT_LABELS: Record<CombatUnitKey, string> = {
  fighter: 'Fighters',
  bomber: 'Bombers',
  transport: 'Transports',
  soldier: 'Soldiers',
  droid: 'Droids',
};

export function renderSimulatorScreen(root: HTMLElement, onBack: () => void): void {
  const shell = document.createElement('div');
  shell.className = 'simulator-screen interactive';

  const panel = document.createElement('div');
  panel.className = 'simulator-panel';

  const title = document.createElement('h1');
  title.textContent = 'Battle Simulator';
  panel.append(title);

  const columns = document.createElement('div');
  columns.className = 'simulator-columns';

  // Attacker column
  const atkCol = document.createElement('div');
  atkCol.className = 'simulator-column';
  const atkTitle = document.createElement('h2');
  atkTitle.textContent = 'Attacker';
  atkCol.append(atkTitle);

  const atkInputs: Record<CombatUnitKey, HTMLInputElement> = {} as Record<CombatUnitKey, HTMLInputElement>;
  for (const unit of COMBAT_UNITS) {
    const row = createInputRow(UNIT_LABELS[unit], 0);
    atkInputs[unit] = row.input;
    atkCol.append(row.el);
  }
  const atkScience = createInputRow('Military Science %', 0, 0, 100);
  atkCol.append(atkScience.el);
  const atkPortal = createCheckboxRow('Has Portal');
  atkCol.append(atkPortal.el);

  // Defender column
  const defCol = document.createElement('div');
  defCol.className = 'simulator-column';
  const defTitle = document.createElement('h2');
  defTitle.textContent = 'Defender';
  defCol.append(defTitle);

  const defInputs: Record<CombatUnitKey, HTMLInputElement> = {} as Record<CombatUnitKey, HTMLInputElement>;
  for (const unit of COMBAT_UNITS) {
    const row = createInputRow(UNIT_LABELS[unit], 0);
    defInputs[unit] = row.input;
    defCol.append(row.el);
  }
  const defLasers = createInputRow('Lasers', 0);
  defCol.append(defLasers.el);
  const defScience = createInputRow('Military Science %', 0, 0, 100);
  defCol.append(defScience.el);
  const defBonus = createInputRow('Defense Bonus %', 0, 0, 100);
  defCol.append(defBonus.el);
  const defPortal = createCheckboxRow('Has Portal');
  defCol.append(defPortal.el);

  columns.append(atkCol, defCol);
  panel.append(columns);

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'simulator-btn-row';
  const simBtn = button('Simulate', () => runSimulation(), 'ui-button primary');
  const backBtn = button('Back', onBack, 'ui-button');
  backBtn.type = 'button';
  btnRow.append(simBtn, backBtn);
  panel.append(btnRow);

  // Result area
  const resultArea = document.createElement('div');
  resultArea.className = 'simulator-result';
  panel.append(resultArea);

  shell.append(panel);
  root.append(shell);

  function runSimulation(): void {
    const state = createEmptyGameState();
    state.rng = createSeededRng(Date.now());
    state.currentTick = 1;
    state.nextEmpireId = 3;
    state.nextPlanetId = 10;
    state.nextFleetId = 2;

    // Create empires (RP set after state is fully built so networth is accurate)
    const atkSciencePct = clamp(Number(atkScience.input.value) || 0, 0, 99);
    const defSciencePct = clamp(Number(defScience.input.value) || 0, 0, 99);

    const attacker = createEmpire({ id: 1, empireName: 'Attacker', controllerType: 'human', color: '#3380ff' });
    state.empires.push(attacker);

    const defender = createEmpire({ id: 2, empireName: 'Defender', controllerType: 'human', color: '#ff4d4d' });
    state.empires.push(defender);

    // Defender planet
    const defPlanet = createPlanet({ id: 1, planetName: 'Target', systemId: 1, size: 250 });
    defPlanet.ownerId = 2;
    defPlanet.population = 1000;
    defPlanet.buildings.laser = Math.max(0, Math.floor(Number(defLasers.input.value) || 0));
    const defBonusPct = clamp(Number(defBonus.input.value) || 0, 0, 100);
    if (defBonusPct > 0) {
      defPlanet.resourceBonuses.defense = 1 + defBonusPct / 100;
    }
    if (defPortal.checkbox.checked) {
      defPlanet.hasPortal = true;
      defPlanet.buildings.portal = 1;
    }
    for (const unit of COMBAT_UNITS) {
      const count = Math.max(0, Math.floor(Number(defInputs[unit].value) || 0));
      if (count > 0) defPlanet.units[unit] = count;
    }
    state.planets.push(defPlanet);

    // Attacker portal planet (if checked)
    if (atkPortal.checkbox.checked) {
      const atkPortalPlanet = createPlanet({ id: 2, planetName: 'Attacker Base', systemId: 2, size: 200 });
      atkPortalPlanet.ownerId = 1;
      atkPortalPlanet.hasPortal = true;
      atkPortalPlanet.buildings.portal = 1;
      state.planets.push(atkPortalPlanet);
    }

    // Defender retreat portal planet (separate from battle planet if needed)
    // The defender planet itself may have a portal (handled above via poolPortalDefense)
    // For retreat, defender needs another planet with portal if the battle planet is lost
    if (defPortal.checkbox.checked) {
      const defRetreatPlanet = createPlanet({ id: 3, planetName: 'Defender Base', systemId: 3, size: 200 });
      defRetreatPlanet.ownerId = 2;
      defRetreatPlanet.hasPortal = true;
      defRetreatPlanet.buildings.portal = 1;
      state.planets.push(defRetreatPlanet);
    }

    // Attacker fleet
    const fleet = {
      id: 1,
      ownerId: 1,
      units: {} as Partial<Record<CombatUnitKey, number>>,
      originSystemId: 2,
      targetSystemId: 1,
      targetPlanetId: 1,
      ticksRemaining: 0,
      isExploration: false,
    };
    for (const unit of COMBAT_UNITS) {
      const count = Math.max(0, Math.floor(Number(atkInputs[unit].value) || 0));
      if (count > 0) fleet.units[unit] = count;
    }
    state.fleets.push(fleet);

    // Set military RP using actual networth so the desired % is accurate
    attacker.researchPoints.military = sciencePercentToRp(atkSciencePct, calcEmpireNetworth(state, attacker.id));
    defender.researchPoints.military = sciencePercentToRp(defSciencePct, calcEmpireNetworth(state, defender.id));

    // Run battle
    const report = resolveBattle(state, fleet, defPlanet);

    // Show result
    resultArea.replaceChildren();
    const reportContent = renderBattleReportContent(report, 'Attacker', 'Defender', true);
    resultArea.append(reportContent);
  }
}

function createInputRow(label: string, defaultValue: number, min = 0, max = 999999): { el: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('label');
  row.className = 'simulator-input-row';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(defaultValue);
  input.min = String(min);
  input.max = String(max);
  row.append(span, input);
  return { el: row, input };
}

function createCheckboxRow(label: string): { el: HTMLElement; checkbox: HTMLInputElement } {
  const row = document.createElement('label');
  row.className = 'simulator-input-row';
  const span = document.createElement('span');
  span.textContent = label;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  row.append(span, checkbox);
  return { el: row, checkbox };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Convert a desired military science % to the research points needed for a given networth. */
function sciencePercentToRp(pct: number, networth: number): number {
  if (pct <= 0) return 0;
  if (pct >= 100) pct = 99;
  // getSciencePercent: pct = 100 * (1 - exp(-rp / (100 * networth)))
  // Solving for rp: rp = -100 * networth * ln(1 - pct/100)
  const nw = Math.max(networth, 1);
  return -100 * nw * Math.log(1 - pct / 100);
}
