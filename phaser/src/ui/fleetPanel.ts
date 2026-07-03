import { UNITS } from '../core/data/units';
import type { GameState } from '../core/galaxy/galaxyData';
import type { CombatUnitKey, Fleet, Planet, ResourceKey, UnitKey } from '../core/models/types';
import { calcTravelTicks, getPlanet, getPlanetsForEmpire, getSystem } from '../core/selectors/selectors';
import { button, formatNumber, maxAffordable, numberInput, parseIntegerInput, resourceCostHtml } from './dom';
import { fleetForm } from './planetPanel';
import type { UiContext } from './types';

const TRAINABLE_COMBAT: CombatUnitKey[] = ['fighter', 'bomber', 'transport', 'soldier', 'droid'];
const TRAINABLE_SPECIAL: Array<Exclude<UnitKey, 'explorer' | CombatUnitKey>> = ['agent', 'wizard'];

type FleetFilter = 'all' | 'combat' | 'exploration';
type FleetSortKey = 'eta' | 'destination' | 'size';
let persistedFleetFilter: FleetFilter = 'all';
let persistedFleetSortKey: FleetSortKey = 'eta';
let persistedFleetSortAsc = true;

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

  // Active fleets with filter/sort
  const refreshPanel = () => context.controller.overlay.render();
  panel.append(subtitle(`Fleets in Transit (${active.length})`), active.length > 0 ? fleetCardList(active, state, refreshPanel) : emptyText('No fleets in transit.'));

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
  const refreshPanel = () => context.controller.overlay.render();
  frag.append(subtitle('Active'), active.length > 0 ? fleetCardList(active, state, refreshPanel) : emptyText('No fleets in transit.'));

  // Fleet summary
  frag.append(subtitle('Fleet Summary'), fleetSummary(ownedPlanets, active));

  return frag;
}

function fleetCardList(fleets: Fleet[], state: GameState, refreshPanel: () => void): HTMLElement {
  const wrapper = document.createElement('div');

  // Filter toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'fleet-toolbar';

  const filterGroup = document.createElement('div');
  filterGroup.className = 'fleet-toolbar-group';
  const filterLabel = document.createElement('span');
  filterLabel.className = 'fleet-toolbar-label';
  filterLabel.textContent = 'Filter:';
  filterGroup.append(filterLabel);

  const FILTERS: { key: FleetFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'combat', label: 'Combat' },
    { key: 'exploration', label: 'Exploration' },
  ];
  for (const f of FILTERS) {
    const btn = document.createElement('button');
    btn.className = 'fleet-filter-btn' + (persistedFleetFilter === f.key ? ' active' : '');
    btn.textContent = f.label;
    btn.addEventListener('click', () => {
      persistedFleetFilter = f.key;
      refreshPanel();
    });
    filterGroup.append(btn);
  }

  const sortGroup = document.createElement('div');
  sortGroup.className = 'fleet-toolbar-group';
  const sortLabel = document.createElement('span');
  sortLabel.className = 'fleet-toolbar-label';
  sortLabel.textContent = 'Sort:';
  sortGroup.append(sortLabel);

  const SORTS: { key: FleetSortKey; label: string }[] = [
    { key: 'eta', label: 'ETA' },
    { key: 'destination', label: 'Destination' },
    { key: 'size', label: 'Size' },
  ];
  for (const s of SORTS) {
    const btn = document.createElement('button');
    const isActive = persistedFleetSortKey === s.key;
    btn.className = 'fleet-sort-btn' + (isActive ? ' active' : '');
    btn.textContent = s.label + (isActive ? (persistedFleetSortAsc ? ' \u25B2' : ' \u25BC') : '');
    btn.addEventListener('click', () => {
      if (persistedFleetSortKey === s.key) {
        persistedFleetSortAsc = !persistedFleetSortAsc;
      } else {
        persistedFleetSortKey = s.key;
        persistedFleetSortAsc = true;
      }
      refreshPanel();
    });
    sortGroup.append(btn);
  }

  toolbar.append(filterGroup, sortGroup);
  wrapper.append(toolbar);

  // Filter
  let filtered = [...fleets];
  if (persistedFleetFilter === 'combat') filtered = filtered.filter((f) => !f.isExploration);
  if (persistedFleetFilter === 'exploration') filtered = filtered.filter((f) => f.isExploration);

  // Sort
  filtered.sort((a, b) => {
    let cmp = 0;
    switch (persistedFleetSortKey) {
      case 'eta':
        cmp = a.ticksRemaining - b.ticksRemaining;
        break;
      case 'destination': {
        const nameA = getPlanet(state, a.targetPlanetId)?.planetName ?? '';
        const nameB = getPlanet(state, b.targetPlanetId)?.planetName ?? '';
        cmp = nameA.localeCompare(nameB);
        break;
      }
      case 'size': {
        const sizeA = Object.values(a.units).reduce((s, n) => s + (n ?? 0), 0);
        const sizeB = Object.values(b.units).reduce((s, n) => s + (n ?? 0), 0);
        cmp = sizeA - sizeB;
        break;
      }
    }
    return persistedFleetSortAsc ? cmp : -cmp;
  });

  if (filtered.length === 0) {
    wrapper.append(emptyText('No matching fleets.'));
    return wrapper;
  }

  // Card list
  const cardList = document.createElement('div');
  cardList.className = 'fleet-card-list';

  for (const fleet of filtered) {
    const card = document.createElement('div');
    card.className = 'fleet-card';

    // Header: type badge + route
    const header = document.createElement('div');
    header.className = 'fleet-card-header';

    const badge = document.createElement('span');
    badge.className = 'fleet-type-badge ' + (fleet.isExploration ? 'fleet-type-exploration' : 'fleet-type-combat');
    badge.textContent = fleet.isExploration ? 'Explore' : 'Combat';

    const route = document.createElement('span');
    route.className = 'fleet-route';
    const originSystem = getSystem(state, fleet.originSystemId);
    const target = getPlanet(state, fleet.targetPlanetId);
    const originName = originSystem?.systemName ?? `System ${fleet.originSystemId}`;
    const targetName = target?.planetName ?? `Planet ${fleet.targetPlanetId}`;
    route.innerHTML = `${originName}<span class="fleet-route-arrow">\u2192</span>${targetName}`;

    header.append(badge, route);
    card.append(header);

    // Progress bar
    const totalTicks = calcTravelTicks(state, fleet.originSystemId, fleet.targetSystemId);
    const elapsed = totalTicks - fleet.ticksRemaining;
    const pct = totalTicks > 0 ? Math.round((elapsed / totalTicks) * 100) : 100;

    const progressRow = document.createElement('div');
    progressRow.className = 'fleet-progress-row';

    const progressBar = document.createElement('div');
    progressBar.className = 'fleet-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'fleet-progress-fill' + (fleet.isExploration ? ' exploration' : '');
    progressFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    progressBar.append(progressFill);

    const progressLabel = document.createElement('span');
    progressLabel.className = 'fleet-progress-label';
    progressLabel.textContent = `${fleet.ticksRemaining} / ${totalTicks} ticks`;

    progressRow.append(progressBar, progressLabel);
    card.append(progressRow);

    // Unit badges (combat only)
    if (!fleet.isExploration) {
      const badges = renderUnitBadges(fleet.units);
      if (badges.children.length > 0) card.append(badges);
    }

    cardList.append(card);
  }

  wrapper.append(cardList);
  return wrapper;
}

function renderUnitBadges(units: Partial<Record<string, number>>): HTMLElement {
  const container = document.createElement('div');
  container.className = 'fleet-unit-badges';
  for (const key of ['fighter', 'bomber', 'transport', 'soldier', 'droid'] as CombatUnitKey[]) {
    const count = units[key] ?? 0;
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'unit-badge';
      badge.textContent = `${UNITS[key].name} x${formatNumber(count)}`;
      container.append(badge);
    }
  }
  return container;
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
  if (hasPortals) table.classList.add('has-recall');

  const UNIT_COL_TOOLTIPS: Record<string, string> = {
    F: 'Fighters', B: 'Bombers', T: 'Transports', S: 'Soldiers', D: 'Droids', A: 'Agents', W: 'Wizards',
  };
  const headerCols = hasPortals
    ? ['', 'Planet', '', 'F', 'B', 'T', 'S', 'D', 'A', 'W', 'Has', 'Can Train', 'Recall']
    : ['', 'Planet', '', 'F', 'B', 'T', 'S', 'D', 'A', 'W', 'Has', 'Can Train'];

  const headerRow = document.createElement('div');
  headerRow.className = 'mass-train-row mass-train-row-header';
  for (const text of headerCols) {
    const cell = document.createElement('span');
    cell.textContent = text;
    if (UNIT_COL_TOOLTIPS[text]) cell.title = UNIT_COL_TOOLTIPS[text];
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
    nameCell.textContent = `Portal (${portalPlanets.length})`;
    nameCell.title = `${portalPlanets.length} portaled planets (units shared)`;

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
    addRowHover(row);
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

    addRowHover(row);
    return row;
  }

  function addRowHover(row: HTMLElement): void {
    const cells = () => Array.from(row.children) as HTMLElement[];
    row.addEventListener('mouseenter', () => cells().forEach((c) => c.classList.add('mass-train-cell-hover')));
    row.addEventListener('mouseleave', () => cells().forEach((c) => c.classList.remove('mass-train-cell-hover')));
  }

  function rebuildRows(): void {
    while (table.children.length > 1) table.removeChild(table.lastChild!);
    checkboxes.clear();
    rowElements.clear();
    let rowIndex = 0;
    if (portalPlanets.length > 0) {
      const portalRow = buildPortalRow();
      if (rowIndex % 2 === 1) portalRow.classList.add('mass-train-row-even');
      table.append(portalRow);
      rowIndex++;
    }
    for (const planet of nonPortalPlanets) {
      const row = buildRow(planet);
      if (rowIndex % 2 === 1) row.classList.add('mass-train-row-even');
      table.append(row);
      rowIndex++;
    }
  }

  rebuildRows();
  const scrollWrapper = document.createElement('div');
  scrollWrapper.className = 'mass-train-scroll';
  scrollWrapper.append(table);
  wrapper.append(scrollWrapper);

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
