import { UNITS } from '../core/data/units';
import type { CombatUnitKey, Fleet, Planet, ResourceKey, UnitKey } from '../core/models/types';
import { calcTravelTicks, getPlanet, getPlanetsForEmpire, getSystem } from '../core/selectors/selectors';
import { button, formatNumber, maxAffordable, numberInput, parseIntegerInput, resourceCostText } from './dom';
import { fleetForm } from './planetPanel';
import type { UiContext } from './types';

const TRAINABLE_COMBAT: CombatUnitKey[] = ['fighter', 'bomber', 'transport', 'soldier', 'droid'];
const TRAINABLE_SPECIAL: Array<Exclude<UnitKey, 'explorer' | CombatUnitKey>> = ['agent', 'wizard'];

export function renderFleetManagementPanel(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) throw new Error('Fleet management requires game state.');

  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Fleet Management';
  const hint = document.createElement('p');
  hint.className = 'empty-text';
  hint.textContent = 'Press F to return';
  panel.append(title, hint);

  const ownedPlanets = getPlanetsForEmpire(state, context.player.id);
  const active = state.fleets.filter((f) => f.ownerId === context.player.id);

  // Mass Train section
  panel.append(subtitle('Mass Train Units'), renderMassTrainPanel(context, ownedPlanets));

  // Fleet summary totals
  panel.append(subtitle('Fleet Summary'), fleetSummary(ownedPlanets, active));

  // Stationed units by planet, grouped by system
  panel.append(subtitle('Stationed Units'), stationedByPlanet(context, ownedPlanets));

  // Active fleets with recall
  panel.append(subtitle(`Fleets in Transit (${active.length})`), active.length > 0 ? fleetList(active, state) : emptyText('No fleets in transit.'));

  const portalPlanets = ownedPlanets.filter((p) => p.hasPortal);
  if (active.length > 0 && portalPlanets.length > 0) {
    panel.append(subtitle('Recall to Portal'), recallControls(context, active, portalPlanets));
  }

  return panel;
}

function stationedByPlanet(context: UiContext, planets: Planet[]): HTMLElement {
  const state = context.controller.state!;
  const wrapper = document.createElement('div');
  wrapper.className = 'stationed-list';

  const COMBAT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'transport', 'soldier', 'droid'];
  const planetsWithUnits = planets.filter((p) =>
    COMBAT_KEYS.some((k) => (p.units[k] ?? 0) > 0),
  );

  if (planetsWithUnits.length === 0) {
    return emptyText('No stationed combat units.');
  }

  const hasPortals = planets.some((p) => p.hasPortal);

  // Group by system
  const bySystem = new Map<number, Planet[]>();
  for (const p of planetsWithUnits) {
    const list = bySystem.get(p.systemId) ?? [];
    list.push(p);
    bySystem.set(p.systemId, list);
  }

  for (const [systemId, systemPlanets] of bySystem) {
    const sys = getSystem(state, systemId);
    const sysName = sys?.systemName ?? `System ${systemId}`;
    const sysHeader = document.createElement('div');
    sysHeader.className = 'stationed-system';
    sysHeader.textContent = sysName;
    wrapper.append(sysHeader);

    for (const planet of systemPlanets) {
      const row = document.createElement('div');
      row.className = 'stationed-row';
      const name = document.createElement('span');
      name.className = 'stationed-planet';
      name.textContent = planet.planetName;
      const units = document.createElement('span');
      units.className = 'stationed-units';
      units.textContent = formatUnitsFromPlanet(planet, COMBAT_KEYS);
      row.append(name, units);

      if (hasPortals && !planet.hasPortal) {
        const nearestTicks = getNearestPortalTicks(state, planet, planets);
        const recallBtn = button(`Recall (${nearestTicks}t)`, () => {
          context.runCommand(() =>
            context.commands.recallToPortal({ empireId: context.player.id, sourcePlanetId: planet.id }),
          );
        });
        recallBtn.className = 'ui-button recall-btn';
        row.append(recallBtn);
      }

      wrapper.append(row);
    }
  }

  return wrapper;
}

function getNearestPortalTicks(state: Parameters<typeof calcTravelTicks>[0], planet: Planet, ownedPlanets: Planet[]): number {
  let nearest = Infinity;
  for (const p of ownedPlanets) {
    if (!p.hasPortal) continue;
    const ticks = calcTravelTicks(state, planet.systemId, p.systemId);
    if (ticks < nearest) nearest = ticks;
  }
  return nearest;
}

function formatUnitsFromPlanet(planet: Planet, keys: CombatUnitKey[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const count = planet.units[key] ?? 0;
    if (count > 0) parts.push(`${count}${UNIT_ABBREV[key]}`);
  }
  return parts.join(', ');
}

export function renderFleetContent(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Fleet panel requires game state.');
  }

  const frag = document.createElement('div');
  frag.className = 'panel-stack';

  const ownedPlanets = getPlanetsForEmpire(state, context.player.id);

  // Send to selected target
  const selectedPlanetId = context.controller.clientState?.selectedPlanetId ?? null;
  const selectedTarget = selectedPlanetId === null ? undefined : getPlanet(state, selectedPlanetId);
  if (selectedTarget && selectedTarget.ownerId !== context.player.id) {
    const portalPlanets = ownedPlanets.filter((p) => p.hasPortal);
    const hasPortalUnits = portalPlanets.some((p) =>
      ['fighter', 'bomber', 'soldier', 'droid', 'transport'].some((u) => (p.units[u as keyof typeof p.units] ?? 0) > 0),
    );
    frag.append(
      subtitle('Send to selected'),
      ownedPlanets.length > 0 ? fleetForm(context, selectedTarget, ownedPlanets, hasPortalUnits ? portalPlanets : []) : emptyText('No owned planets can send fleets.'),
    );
  } else {
    frag.append(emptyText('Select a neutral or enemy planet to send fleets.'));
  }

  // Active fleets
  const active = state.fleets.filter((fleet) => fleet.ownerId === context.player.id);
  frag.append(subtitle('Active'), active.length > 0 ? fleetList(active, state) : emptyText('No fleets in transit.'));

  // Fleet summary
  frag.append(subtitle('Fleet Summary'), fleetSummary(ownedPlanets, active));

  // Recall section
  const portalPlanets = ownedPlanets.filter((p) => p.hasPortal);
  if (active.length > 0 && portalPlanets.length > 0) {
    frag.append(subtitle('Recall to Portal'), recallControls(context, active, portalPlanets));
  }

  return frag;
}

function fleetList(fleets: Fleet[], state: { planets: Planet[] }): HTMLElement {
  const list = document.createElement('div');
  list.className = 'key-value-list';
  const sorted = [...fleets].sort((a, b) => a.ticksRemaining - b.ticksRemaining);
  for (const fleet of sorted) {
    const target = state.planets.find((p) => p.id === fleet.targetPlanetId);
    const targetName = target?.planetName ?? `Planet ${fleet.targetPlanetId}`;
    const label = fleet.isExploration ? `Exploring -> ${targetName}` : `Fleet -> ${targetName} (${formatUnits(fleet.units)})`;
    const row = document.createElement('div');
    row.innerHTML = `<span>${label}</span><strong>${fleet.ticksRemaining} ticks</strong>`;
    list.append(row);
  }
  return list;
}

const UNIT_ABBREV: Record<string, string> = { fighter: 'F', bomber: 'B', soldier: 'S', droid: 'D', transport: 'T' };

function formatUnits(units: Partial<Record<string, number>>): string {
  const parts: string[] = [];
  for (const key of ['fighter', 'bomber', 'transport', 'soldier', 'droid'] as CombatUnitKey[]) {
    const count = units[key] ?? 0;
    if (count > 0) parts.push(`${count}${UNIT_ABBREV[key]}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'empty';
}

function fleetSummary(planets: Planet[], fleets: Fleet[]): HTMLElement {
  const totals: Record<string, { stationed: number; transit: number }> = {};
  for (const key of ['fighter', 'bomber', 'transport', 'soldier', 'droid'] as CombatUnitKey[]) {
    totals[key] = { stationed: 0, transit: 0 };
  }

  for (const p of planets) {
    for (const key of Object.keys(totals)) {
      totals[key].stationed += (p.units as Record<string, number>)[key] ?? 0;
    }
  }
  for (const fleet of fleets) {
    if (fleet.isExploration) continue;
    for (const key of Object.keys(totals)) {
      totals[key].transit += (fleet.units as Record<string, number>)[key] ?? 0;
    }
  }

  const list = document.createElement('div');
  list.className = 'key-value-list';
  for (const [key, val] of Object.entries(totals)) {
    const total = val.stationed + val.transit;
    if (total === 0) continue;
    const row = document.createElement('div');
    row.innerHTML = `<span>${UNITS[key as CombatUnitKey].name}</span><strong>${formatNumber(val.stationed)} + ${formatNumber(val.transit)} in transit = ${formatNumber(total)}</strong>`;
    list.append(row);
  }
  if (list.children.length === 0) {
    return emptyText('No military units.');
  }
  return list;
}

function recallControls(context: UiContext, fleets: Fleet[], portalPlanets: Planet[]): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Recall controls require game state.');
  }

  const list = document.createElement('div');
  list.className = 'key-value-list';
  const nonExplore = fleets.filter((f) => !f.isExploration);
  if (nonExplore.length === 0) {
    return emptyText('No recallable fleets.');
  }

  for (const fleet of nonExplore) {
    const target = state.planets.find((p) => p.id === fleet.targetPlanetId);
    const targetName = target?.planetName ?? `Planet ${fleet.targetPlanetId}`;

    let nearestPortal: Planet | null = null;
    let nearestTicks = Infinity;
    for (const p of portalPlanets) {
      const ticks = calcTravelTicks(state, fleet.targetSystemId, p.systemId);
      if (ticks < nearestTicks) {
        nearestTicks = ticks;
        nearestPortal = p;
      }
    }

    if (!nearestPortal) continue;

    const totalTicks = fleet.ticksRemaining + nearestTicks;
    const row = document.createElement('div');
    row.className = 'recall-row';
    const label = document.createElement('span');
    label.textContent = `Fleet -> ${targetName} (${fleet.ticksRemaining}t)`;
    const recallBtn = button(`Recall (${totalTicks}t)`, () => {
      fleet.targetSystemId = nearestPortal!.systemId;
      fleet.targetPlanetId = nearestPortal!.id;
      fleet.ticksRemaining = calcTravelTicks(state, fleet.originSystemId, nearestPortal!.systemId);
      context.setNotice(`Fleet recalled to ${nearestPortal!.planetName}`);
    });
    row.append(label, recallBtn);
    list.append(row);
  }
  return list;
}

let massTrainPersistedSelection: Set<number> | null = null;

function renderMassTrainPanel(context: UiContext, ownedPlanets: Planet[]): HTMLElement {
  const player = context.player;
  const wrapper = document.createElement('div');
  wrapper.className = 'panel-stack';

  if (ownedPlanets.length === 0) {
    return emptyText('No planets owned.');
  }

  // Restore / init planet selection
  const ownedIds = new Set(ownedPlanets.map((p) => p.id));
  if (massTrainPersistedSelection) {
    for (const id of massTrainPersistedSelection) {
      if (!ownedIds.has(id)) massTrainPersistedSelection.delete(id);
    }
  } else {
    massTrainPersistedSelection = new Set<number>();
  }
  const selected = massTrainPersistedSelection;

  // Select/deselect all buttons
  const toggleRow = document.createElement('div');
  toggleRow.className = 'mass-build-toggle-row';
  const selAllBtn = button('Select All', () => {
    for (const p of ownedPlanets) selected.add(p.id);
    refreshCheckboxes();
    updatePreview();
  });
  const deselAllBtn = button('Deselect All', () => {
    selected.clear();
    refreshCheckboxes();
    updatePreview();
  });
  toggleRow.append(selAllBtn, deselAllBtn);
  wrapper.append(toggleRow);

  // Planet table
  const table = document.createElement('div');
  table.className = 'mass-train-table';

  const headerRow = document.createElement('div');
  headerRow.className = 'mass-train-row mass-train-row-header';
  for (const text of ['', 'Planet', 'Has', 'Can Train']) {
    const cell = document.createElement('span');
    cell.textContent = text;
    headerRow.append(cell);
  }
  table.append(headerRow);

  const checkboxes = new Map<number, HTMLInputElement>();
  const rowElements = new Map<number, HTMLElement>();
  let selectedUnitType: CombatUnitKey | 'agent' | 'wizard' = 'fighter';

  function buildRow(planet: Planet): HTMLElement {
    const row = document.createElement('div');
    row.className = 'mass-train-row';
    if (selected.has(planet.id)) row.classList.add('mass-train-row-selected');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(planet.id);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        selected.add(planet.id);
        row.classList.add('mass-train-row-selected');
      } else {
        selected.delete(planet.id);
        row.classList.remove('mass-train-row-selected');
      }
      updatePreview();
    });
    checkboxes.set(planet.id, cb);
    rowElements.set(planet.id, row);

    const cbCell = document.createElement('span');
    cbCell.append(cb);

    const nameCell = document.createElement('span');
    nameCell.textContent = planet.planetName;

    const hasCell = document.createElement('span');
    hasCell.className = 'mass-train-cell-num';
    hasCell.textContent = String(planet.units[selectedUnitType as keyof typeof planet.units] ?? 0);

    const affordCell = document.createElement('span');
    affordCell.className = 'mass-train-cell-num';
    affordCell.textContent = String(maxAffordable(player.resources, UNITS[selectedUnitType].cost));

    row.append(cbCell, nameCell, hasCell, affordCell);
    return row;
  }

  function rebuildRows(): void {
    while (table.children.length > 1) table.removeChild(table.lastChild!);
    checkboxes.clear();
    rowElements.clear();
    for (const planet of ownedPlanets) {
      table.append(buildRow(planet));
    }
  }

  rebuildRows();
  wrapper.append(table);

  // Unit type selector
  const allTrainable = [...TRAINABLE_COMBAT, ...TRAINABLE_SPECIAL] as Array<CombatUnitKey | 'agent' | 'wizard'>;
  const unitSelect = document.createElement('select');
  for (const key of allTrainable) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = UNITS[key].name;
    unitSelect.append(opt);
  }

  const unitRow = document.createElement('div');
  unitRow.className = 'mass-build-field-row';
  const unitLabelEl = document.createElement('span');
  unitLabelEl.className = 'mass-build-field-label';
  unitLabelEl.textContent = 'Unit type:';
  unitRow.append(unitLabelEl, unitSelect);

  // Count + Max
  const countInput = numberInput(1, { min: 1 });
  countInput.className = 'build-input';

  const massMaxBtn = button('Max', () => {
    const selectedPlanets = ownedPlanets.filter((p) => selected.has(p.id));
    if (selectedPlanets.length === 0) return;
    const cost = UNITS[selectedUnitType].cost;
    const n = selectedPlanets.length;
    const scaledCost: Partial<Record<ResourceKey, number>> = {};
    for (const [res, amt] of Object.entries(cost) as Array<[ResourceKey, number]>) {
      scaledCost[res] = amt * n;
    }
    const max = maxAffordable(player.resources, scaledCost);
    countInput.value = String(Math.max(1, max));
    updatePreview();
  });
  massMaxBtn.className = 'build-max-btn ui-button';

  const countRow = document.createElement('div');
  countRow.className = 'mass-build-field-row';
  const countLabelEl = document.createElement('span');
  countLabelEl.className = 'mass-build-field-label';
  countLabelEl.textContent = 'Count per planet:';
  countRow.append(countLabelEl, countInput, massMaxBtn);

  // Cost preview
  const costPreview = document.createElement('div');
  costPreview.className = 'mass-build-cost-preview';

  function updatePreview(): void {
    const selectedPlanets = ownedPlanets.filter((p) => selected.has(p.id));
    const count = Math.max(1, parseInt(countInput.value, 10) || 1);
    const cost = UNITS[selectedUnitType].cost;
    const perUnit = resourceCostText(cost);

    if (selectedPlanets.length === 0) {
      costPreview.textContent = `Cost per unit: ${perUnit}\nSelect planets to see total cost`;
      return;
    }

    const totalCost: Partial<Record<ResourceKey, number>> = {};
    for (const [res, amt] of Object.entries(cost) as Array<[ResourceKey, number]>) {
      totalCost[res as ResourceKey] = amt * count * selectedPlanets.length;
    }
    costPreview.textContent = `Cost per unit: ${perUnit}\nTotal for ${selectedPlanets.length} planet${selectedPlanets.length !== 1 ? 's' : ''}: ${resourceCostText(totalCost)}`;
  }

  unitSelect.addEventListener('change', () => {
    selectedUnitType = unitSelect.value as typeof selectedUnitType;
    rebuildRows();
    updatePreview();
  });
  countInput.addEventListener('input', updatePreview);
  updatePreview();

  // Train button
  const trainBtn = button('Train on Selected Planets', () => {
    const buildingType = unitSelect.value as typeof selectedUnitType;
    const parsed = parseIntegerInput(countInput.value, { label: 'Count', min: 1, max: 999_999 });
    if (!parsed.ok) {
      context.setNotice(parsed.message, true);
      return;
    }
    const selectedPlanets = ownedPlanets.filter((p) => selected.has(p.id));
    if (selectedPlanets.length === 0) {
      context.setNotice('No planets selected.', true);
      return;
    }

    let successCount = 0;
    let lastError = '';
    for (const planet of selectedPlanets) {
      const result = context.commands.trainUnits({
        empireId: player.id,
        planetId: planet.id,
        unitType: buildingType,
        count: parsed.value,
      });
      if (result.ok) {
        successCount++;
      } else {
        lastError = result.message;
      }
    }

    if (successCount > 0) {
      const msg = `Trained ${parsed.value} ${UNITS[buildingType].name} on ${successCount} planet${successCount !== 1 ? 's' : ''}`;
      context.setNotice(lastError ? `${msg} (${selectedPlanets.length - successCount} failed: ${lastError})` : msg, false, true);
      context.controller.refreshScene?.();
    } else {
      context.setNotice(lastError || 'Training failed.', true);
    }
  });
  trainBtn.classList.add('primary');

  wrapper.append(unitRow, countRow, costPreview, trainBtn);

  function refreshCheckboxes(): void {
    for (const [id, cb] of checkboxes) {
      cb.checked = selected.has(id);
      rowElements.get(id)?.classList.toggle('mass-train-row-selected', selected.has(id));
    }
  }

  return wrapper;
}

function subtitle(text: string): HTMLHeadingElement {
  const title = document.createElement('h3');
  title.textContent = text;
  return title;
}

function emptyText(text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = 'empty-text';
  element.textContent = text;
  return element;
}
