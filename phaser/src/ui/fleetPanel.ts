import { UNITS } from '../core/data/units';
import type { CombatUnitKey, Fleet, Planet, ResourceKey, UnitKey } from '../core/models/types';
import { calcTravelTicks, getPlanet, getPlanetsForEmpire } from '../core/selectors/selectors';
import { button, formatNumber, maxAffordable, numberInput, parseIntegerInput, resourceCostHtml } from './dom';
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

  // Active fleets with recall
  panel.append(subtitle(`Fleets in Transit (${active.length})`), active.length > 0 ? fleetList(active, state) : emptyText('No fleets in transit.'));

  return panel;
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

let massTrainPersistedSelection: Set<number> | null = null;
let persistedMassTrainUnitKey: CombatUnitKey | 'agent' | 'wizard' = 'fighter';

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
  const selNoPortalsBtn = button('Select All Without Portals', () => {
    selected.clear();
    for (const p of ownedPlanets) {
      if (!p.hasPortal) selected.add(p.id);
    }
    refreshCheckboxes();
    updatePreview();
  });
  selNoPortalsBtn.classList.add('mass-build-toggle-btn-compact');
  toggleRow.append(selAllBtn, deselAllBtn, selNoPortalsBtn);
  wrapper.append(toggleRow);

  // Planet table
  const table = document.createElement('div');
  table.className = 'mass-train-table';

  const portalPlanets = ownedPlanets.filter((p) => p.hasPortal);
  const nonPortalPlanets = ownedPlanets.filter((p) => !p.hasPortal);
  const hasPortals = portalPlanets.length > 0;

  const headerCols = hasPortals
    ? ['', 'Planet', '', 'F', 'B', 'T', 'S', 'D', 'A', 'W', 'Has', 'Can Train', 'Recall']
    : ['', 'Planet', '', 'F', 'B', 'T', 'S', 'D', 'A', 'W', 'Has', 'Can Train'];

  const headerRow = document.createElement('div');
  headerRow.className = 'mass-train-row mass-train-row-header';
  for (const text of headerCols) {
    const cell = document.createElement('span');
    cell.textContent = text;
    headerRow.append(cell);
  }
  table.append(headerRow);

  const checkboxes = new Map<number, HTMLInputElement>();
  const rowElements = new Map<number, HTMLElement>();
  let selectedUnitType: CombatUnitKey | 'agent' | 'wizard' = persistedMassTrainUnitKey;

  const UNIT_COL_KEYS = ['fighter', 'bomber', 'transport', 'soldier', 'droid', 'agent', 'wizard'] as const;

  function buildPortalRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'mass-train-row mass-train-row-portal';
    const allSelected = portalPlanets.every((p) => selected.has(p.id));
    if (allSelected && portalPlanets.length > 0) row.classList.add('mass-train-row-selected');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = allSelected && portalPlanets.length > 0;
    cb.addEventListener('change', () => {
      for (const p of portalPlanets) {
        if (cb.checked) {
          selected.add(p.id);
        } else {
          selected.delete(p.id);
        }
      }
      row.classList.toggle('mass-train-row-selected', cb.checked);
      updatePreview();
    });
    // Store checkbox reference using first portal planet id (for refreshCheckboxes)
    for (const p of portalPlanets) {
      checkboxes.set(p.id, cb);
      rowElements.set(p.id, row);
    }

    const cbCell = document.createElement('span');
    cbCell.append(cb);

    const nameCell = document.createElement('span');
    nameCell.textContent = `Portaled Planets (${portalPlanets.length})`;

    const portalCell = document.createElement('span');
    portalCell.className = 'mass-train-cell-portal';
    portalCell.textContent = '\u{1F310}';

    // Sum units across all portal planets
    const unitCountCells = UNIT_COL_KEYS.map((uk) => {
      const cell = document.createElement('span');
      cell.className = 'mass-train-cell-num';
      let total = 0;
      for (const p of portalPlanets) total += p.units[uk] ?? 0;
      cell.textContent = String(total);
      return cell;
    });

    const hasCell = document.createElement('span');
    hasCell.className = 'mass-train-cell-num';
    let hasTotal = 0;
    for (const p of portalPlanets) hasTotal += p.units[selectedUnitType as keyof typeof p.units] ?? 0;
    hasCell.textContent = String(hasTotal);

    const affordCell = document.createElement('span');
    affordCell.className = 'mass-train-cell-num';
    affordCell.textContent = String(maxAffordable(player.resources, UNITS[selectedUnitType].cost));

    // No recall for portal planets (empty cell for column alignment)
    const recallCell = document.createElement('span');

    row.append(cbCell, nameCell, portalCell, ...unitCountCells, hasCell, affordCell, recallCell);
    return row;
  }

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

    const portalCell = document.createElement('span');
    portalCell.className = 'mass-train-cell-portal';
    portalCell.textContent = '';

    const unitCountCells = UNIT_COL_KEYS.map((uk) => {
      const cell = document.createElement('span');
      cell.className = 'mass-train-cell-num';
      cell.textContent = String(planet.units[uk] ?? 0);
      return cell;
    });

    const hasCell = document.createElement('span');
    hasCell.className = 'mass-train-cell-num';
    hasCell.textContent = String(planet.units[selectedUnitType as keyof typeof planet.units] ?? 0);

    const affordCell = document.createElement('span');
    affordCell.className = 'mass-train-cell-num';
    affordCell.textContent = String(maxAffordable(player.resources, UNITS[selectedUnitType].cost));

    row.append(cbCell, nameCell, portalCell, ...unitCountCells, hasCell, affordCell);

    if (hasPortals) {
      const recallCell = document.createElement('span');
      const hasCombatUnits = TRAINABLE_COMBAT.some((k) => (planet.units[k] ?? 0) > 0);
      if (hasCombatUnits) {
        const nearestTicks = getNearestPortalTicks(context.controller.state!, planet, portalPlanets);
        const recallBtn = button(`Recall (${nearestTicks}t)`, () => {
          context.runCommand(() =>
            context.commands.recallToPortal({ empireId: context.player.id, sourcePlanetId: planet.id }),
          );
        });
        recallBtn.className = 'ui-button recall-btn';
        recallCell.append(recallBtn);
      }
      row.append(recallCell);
    }

    return row;
  }

  function rebuildRows(): void {
    while (table.children.length > 1) table.removeChild(table.lastChild!);
    checkboxes.clear();
    rowElements.clear();
    if (portalPlanets.length > 0) {
      table.append(buildPortalRow());
    }
    for (const planet of nonPortalPlanets) {
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
  unitSelect.value = persistedMassTrainUnitKey;

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
    const perUnit = resourceCostHtml(cost);

    if (selectedPlanets.length === 0) {
      costPreview.innerHTML = `Cost per unit: ${perUnit}<br>Select planets to see total cost`;
      return;
    }

    const totalCost: Partial<Record<ResourceKey, number>> = {};
    for (const [res, amt] of Object.entries(cost) as Array<[ResourceKey, number]>) {
      totalCost[res as ResourceKey] = amt * count * selectedPlanets.length;
    }
    costPreview.innerHTML = `Cost per unit: ${perUnit}<br>Total for ${selectedPlanets.length} planet${selectedPlanets.length !== 1 ? 's' : ''}: ${resourceCostHtml(totalCost)}`;
  }

  unitSelect.addEventListener('change', () => {
    selectedUnitType = unitSelect.value as typeof selectedUnitType;
    persistedMassTrainUnitKey = selectedUnitType;
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

  // Recall All button (only when portals exist and non-portal planets have units)
  if (hasPortals && nonPortalPlanets.length > 0) {
    const recallAllBtn = button('Recall All to Portal', () => {
      let successCount = 0;
      let lastError = '';
      for (const planet of nonPortalPlanets) {
        const hasCombatUnits = TRAINABLE_COMBAT.some((k) => (planet.units[k] ?? 0) > 0);
        if (!hasCombatUnits) continue;
        const result = context.commands.recallToPortal({ empireId: context.player.id, sourcePlanetId: planet.id });
        if (result.ok) {
          successCount++;
        } else {
          lastError = result.message;
        }
      }
      if (successCount > 0) {
        context.setNotice(`Recalled units from ${successCount} planet${successCount !== 1 ? 's' : ''} to portal`, false, true);
        context.controller.refreshScene?.();
      } else {
        context.setNotice(lastError || 'No units to recall.', true);
      }
    });
    recallAllBtn.className = 'ui-button';
    wrapper.append(recallAllBtn);
  }

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
