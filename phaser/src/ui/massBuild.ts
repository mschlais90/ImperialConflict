import { BUILDINGS, getBuildCost, getOverbuildMultiplier } from '../core/data/buildings';
import type { BonusKey, BuildingKey, Planet, ResourceKey } from '../core/models/types';
import { calcSciencePercent, getPlanetsForEmpire } from '../core/selectors/selectors';
import { button, numberInput, parseIntegerInput, resourceCostHtml } from './dom';
import { resourceIcon } from './resourceIcons';
import type { UiContext } from './types';

const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKey[];

// Persists selection across re-renders within the same session
let persistedSelection: Set<number> | null = null;

// Persists building dropdown and count input across re-renders
let persistedBuildingKey: BuildingKey = 'mine';
let persistedCount = '1';

// Persists sort state across re-renders
let sortColumn: SortColumn = 'name';
let sortAsc = true;

type SortColumn = 'name' | 'portal' | 'built' | 'lasers' | 'ob' | 'bonuses';

const NON_RESOURCE_BONUS_LABELS: Partial<Record<BonusKey, string>> = {
  research: 'Research',
  population_growth: 'Pop',
  defense: 'Defense',
};

const RESOURCE_BONUS_KEYS: ReadonlySet<BonusKey> = new Set(['gc', 'food', 'iron', 'endurium', 'octarine']);

function bonusLabel(key: BonusKey): string {
  if (RESOURCE_BONUS_KEYS.has(key)) return resourceIcon(key as 'gc' | 'food' | 'iron' | 'endurium' | 'octarine');
  return NON_RESOURCE_BONUS_LABELS[key] ?? key;
}

function countBuildings(planet: Planet): number {
  return BUILDING_KEYS.reduce((sum, key) => sum + (planet.buildings[key] ?? 0), 0);
}

function countBuildingsAndQueue(planet: Planet): number {
  const built = countBuildings(planet);
  const queued = planet.buildQueue.filter((o) => o.category === 'building').length;
  return built + queued;
}

function overbuildPercent(planet: Planet): number {
  const mult = getOverbuildMultiplier(planet);
  return Math.round((mult - 1) * 100);
}

function bonusHtml(planet: Planet): string {
  const entries = Object.entries(planet.resourceBonuses) as Array<[BonusKey, number]>;
  if (entries.length === 0) return '';
  return entries
    .filter(([, mult]) => mult > 1)
    .map(([res, mult]) => `${bonusLabel(res)} +${Math.round((mult - 1) * 100)}%`)
    .join(', ');
}

const BONUS_SORT_ORDER: Partial<Record<BonusKey, number>> = {
  gc: 0, food: 1, iron: 2, endurium: 3, octarine: 4, research: 5, population_growth: 6, defense: 7,
};

function bonusSortKey(planet: Planet): [number, number] {
  const entries = Object.entries(planet.resourceBonuses) as Array<[BonusKey, number]>;
  const bonused = entries.filter(([, mult]) => mult !== 1);
  if (bonused.length === 0) return [99, 0];
  bonused.sort((a, b) => (BONUS_SORT_ORDER[a[0]] ?? 99) - (BONUS_SORT_ORDER[b[0]] ?? 99));
  return [BONUS_SORT_ORDER[bonused[0][0]] ?? 99, bonused[0][1]];
}

function sortPlanets(planets: Planet[]): Planet[] {
  const sorted = [...planets];
  const dir = sortAsc ? 1 : -1;
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortColumn) {
      case 'name':
        cmp = a.planetName.localeCompare(b.planetName);
        break;
      case 'portal':
        cmp = (a.hasPortal ? 1 : 0) - (b.hasPortal ? 1 : 0);
        break;
      case 'built':
        cmp = countBuildingsAndQueue(a) - countBuildingsAndQueue(b);
        break;
      case 'lasers':
        cmp = (a.buildings.laser ?? 0) - (b.buildings.laser ?? 0);
        break;
      case 'ob':
        cmp = overbuildPercent(a) - overbuildPercent(b);
        break;
      case 'bonuses': {
        const [aType, aRatio] = bonusSortKey(a);
        const [bType, bRatio] = bonusSortKey(b);
        cmp = aType !== bType ? aType - bType : aRatio - bRatio;
        break;
      }
    }
    return cmp * dir;
  });
  return sorted;
}

export function renderMassBuildPanel(context: UiContext): HTMLElement {
  const state = context.controller.state!;
  const planets = getPlanetsForEmpire(state, context.player.id);
  const constructionSci = calcSciencePercent(state, context.player, 'construction');

  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Mass Build';
  panel.append(title);

  if (planets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-text';
    empty.textContent = 'No planets owned.';
    panel.append(empty);
    return panel;
  }

  const container = document.createElement('div');
  container.className = 'panel-stack';

  // Restore previous selection, filtering out planets no longer owned
  const ownedIds = new Set(planets.map((p) => p.id));
  if (persistedSelection) {
    for (const id of persistedSelection) {
      if (!ownedIds.has(id)) persistedSelection.delete(id);
    }
  } else {
    persistedSelection = new Set<number>();
  }
  const selected = persistedSelection;

  const toggleRow = document.createElement('div');
  toggleRow.className = 'mass-build-toggle-row';

  const selectAllBtn = button('Select All', () => {
    for (const p of planets) selected.add(p.id);
    refreshCheckboxes();
    updateCostPreview();
  });
  const deselectAllBtn = button('Deselect All', () => {
    selected.clear();
    refreshCheckboxes();
    updateCostPreview();
  });
  const selectNoLasersBtn = button('Select All Without Lasers', () => {
    selected.clear();
    for (const p of planets) {
      const hasLaser = (p.buildings.laser ?? 0) > 0;
      const laserInQueue = p.buildQueue.some((o) => o.category === 'building' && o.itemType === 'laser');
      if (!hasLaser && !laserInQueue) selected.add(p.id);
    }
    refreshCheckboxes();
    updateCostPreview();
  });
  selectNoLasersBtn.classList.add('mass-build-toggle-btn-compact');
  const selectNoPortalsBtn = button('Select All Without Portals', () => {
    selected.clear();
    for (const p of planets) {
      const portalInQueue = p.buildQueue.some((o) => o.category === 'building' && o.itemType === 'portal');
      if (!p.hasPortal && !portalInQueue) selected.add(p.id);
    }
    refreshCheckboxes();
    updateCostPreview();
  });
  selectNoPortalsBtn.classList.add('mass-build-toggle-btn-compact');
  const selectNotOverbuiltBtn = button('Select All Not Overbuilt', () => {
    selected.clear();
    for (const p of planets) {
      if (overbuildPercent(p) === 0) selected.add(p.id);
    }
    refreshCheckboxes();
    updateCostPreview();
  });
  selectNotOverbuiltBtn.classList.add('mass-build-toggle-btn-compact');
  toggleRow.append(selectAllBtn, deselectAllBtn, selectNoLasersBtn, selectNoPortalsBtn, selectNotOverbuiltBtn);
  container.append(toggleRow);

  // Planet table
  const table = document.createElement('div');
  table.className = 'mass-build-table';

  // Header
  const headerRow = document.createElement('div');
  headerRow.className = 'mass-build-row mass-build-row-header';

  const HEADERS: Array<{ label: string; column: SortColumn | null }> = [
    { label: '', column: null },
    { label: 'Planet', column: 'name' },
    { label: '', column: 'portal' },
    { label: 'Built', column: 'built' },
    { label: 'Lasers', column: 'lasers' },
    { label: 'OB%', column: 'ob' },
    { label: 'Bonuses', column: 'bonuses' },
  ];

  for (const hdr of HEADERS) {
    const cell = document.createElement('span');
    cell.className = 'mass-build-header';
    if (hdr.column !== null) {
      cell.classList.add('mass-build-header-sortable');
      const arrow = sortColumn === hdr.column ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';
      cell.textContent = hdr.label + arrow;
      const col = hdr.column;
      cell.addEventListener('click', () => {
        if (sortColumn === col) {
          sortAsc = !sortAsc;
        } else {
          sortColumn = col;
          sortAsc = true;
        }
        rebuildRows();
      });
    } else {
      cell.textContent = hdr.label;
    }
    headerRow.append(cell);
  }
  table.append(headerRow);

  const checkboxes = new Map<number, HTMLInputElement>();
  const rowElements = new Map<number, HTMLElement>();

  function createRow(planet: Planet): HTMLElement {
    const total = countBuildingsAndQueue(planet);
    const ob = overbuildPercent(planet);
    const bonus = bonusHtml(planet);

    const row = document.createElement('div');
    row.className = 'mass-build-row';
    if (selected.has(planet.id)) row.classList.add('mass-build-row-selected');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(planet.id);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        selected.add(planet.id);
        row.classList.add('mass-build-row-selected');
      } else {
        selected.delete(planet.id);
        row.classList.remove('mass-build-row-selected');
      }
      updateCostPreview();
    });
    checkboxes.set(planet.id, cb);
    rowElements.set(planet.id, row);

    const cbCell = document.createElement('span');
    cbCell.className = 'mass-build-cell';
    cbCell.append(cb);

    const lasers = planet.buildings.laser ?? 0;

    const nameCell = textCell(planet.planetName);
    const portalCell = textCell(planet.hasPortal ? '\u{1F310}' : '');
    const builtCell = textCell(`${total}/${planet.size}`);
    const laserCell = textCell(lasers > 0 ? String(lasers) : '-');
    const obCell = textCell(ob > 0 ? `${ob}%` : '-');
    if (ob > 0) obCell.classList.add('mass-build-overbuild');
    const bonusCell = document.createElement('span');
    bonusCell.className = 'mass-build-cell';
    bonusCell.innerHTML = bonus || '-';
    if (bonus) bonusCell.classList.add('mass-build-bonus');

    row.append(cbCell, nameCell, portalCell, builtCell, laserCell, obCell, bonusCell);
    return row;
  }

  function rebuildRows(): void {
    // Remove existing data rows (keep header)
    while (table.children.length > 1) {
      table.removeChild(table.lastChild!);
    }
    checkboxes.clear();
    rowElements.clear();

    // Update header arrows
    for (let i = 0; i < HEADERS.length; i++) {
      const hdr = HEADERS[i];
      const cell = headerRow.children[i] as HTMLElement;
      if (hdr.column !== null) {
        const arrow = sortColumn === hdr.column ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';
        cell.textContent = hdr.label + arrow;
      }
    }

    const sorted = sortPlanets(planets);
    for (const planet of sorted) {
      table.append(createRow(planet));
    }
  }

  // Initial render
  const sorted = sortPlanets(planets);
  for (const planet of sorted) {
    table.append(createRow(planet));
  }

  container.append(table);

  // Building selection and count
  const formSection = document.createElement('div');
  formSection.className = 'mass-build-form';

  const buildingSelect = document.createElement('select');
  for (const key of BUILDING_KEYS) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key === 'portal' ? '\u{1F310} ' + BUILDINGS[key].name : BUILDINGS[key].name;
    buildingSelect.append(opt);
  }
  buildingSelect.value = persistedBuildingKey;

  const buildingRow = document.createElement('div');
  buildingRow.className = 'mass-build-field-row';
  const buildingLabelEl = document.createElement('span');
  buildingLabelEl.className = 'mass-build-field-label';
  buildingLabelEl.textContent = 'Building:';
  buildingRow.append(buildingLabelEl, buildingSelect);

  const countInput = numberInput(Number(persistedCount) || 1, { min: 1 });
  countInput.className = 'build-input';
  const maxBtn = button('Max', () => {
    const buildingType = buildingSelect.value as BuildingKey;
    if (buildingType === 'portal') return;
    let selectedPlanets = planets.filter((p) => selected.has(p.id));
    if (selectedPlanets.length === 0) return;
    const max = calcMaxMassAffordable(buildingType, constructionSci, selectedPlanets, context.player.resources);
    countInput.value = String(Math.max(max, 1));
    persistedCount = countInput.value;
    updateCostPreview();
  });
  maxBtn.className = 'build-max-btn ui-button';

  const countRow = document.createElement('div');
  countRow.className = 'mass-build-field-row';
  const countLabelEl = document.createElement('span');
  countLabelEl.className = 'mass-build-field-label';
  countLabelEl.textContent = 'Count per planet:';
  countRow.append(countLabelEl, countInput, maxBtn);

  formSection.append(buildingRow, countRow);

  // Cost preview
  const costPreview = document.createElement('div');
  costPreview.className = 'mass-build-cost-preview';

  function updateCostPreview(): void {
    const buildingType = buildingSelect.value as BuildingKey;
    const isPortal = buildingType === 'portal';
    countInput.disabled = isPortal;
    if (isPortal) countInput.value = '1';
    const baseCost = getBuildCost(buildingType, constructionSci);
    const perUnitLine = isPortal
      ? `Cost per portal: ${resourceCostHtml(baseCost)} (skips planets that already have one)`
      : `Cost per unit: ${resourceCostHtml(baseCost)}`;

    let selectedPlanets = planets.filter((p) => selected.has(p.id));
    if (isPortal) {
      selectedPlanets = selectedPlanets.filter(
        (p) => !p.hasPortal && !p.buildQueue.some((o) => o.category === 'building' && o.itemType === 'portal'),
      );
    }

    if (selectedPlanets.length === 0) {
      costPreview.innerHTML = `${perUnitLine}<br>Select planets to see total cost`;
      return;
    }

    const count = isPortal ? 1 : Math.max(Number.parseInt(countInput.value, 10) || 1, 1);
    const totalCost: Partial<Record<ResourceKey, number>> = {};
    for (const planet of selectedPlanets) {
      const planetCost = getBuildCost(buildingType, constructionSci, planet);
      for (const [res, amount] of Object.entries(planetCost)) {
        totalCost[res as ResourceKey] = (totalCost[res as ResourceKey] ?? 0) + (amount ?? 0) * count;
      }
    }

    costPreview.innerHTML = `${perUnitLine}<br>Total for ${selectedPlanets.length} planet${selectedPlanets.length > 1 ? 's' : ''}: ${resourceCostHtml(totalCost)}`;
  }

  buildingSelect.addEventListener('change', () => {
    persistedBuildingKey = buildingSelect.value as BuildingKey;
    updateCostPreview();
  });
  countInput.addEventListener('input', () => {
    persistedCount = countInput.value;
    updateCostPreview();
  });
  updateCostPreview();

  const buildBtn = button('Build on Selected Planets', () => {
    const buildingType = buildingSelect.value as BuildingKey;
    const parsed = parseIntegerInput(countInput.value, { label: 'Count', min: 1, max: 999 });
    if (!parsed.ok) {
      context.setNotice(parsed.message, true);
      return;
    }
    const isPortal = buildingType === 'portal';
    const count = isPortal ? 1 : parsed.value;
    let selectedPlanets = planets.filter((p) => selected.has(p.id));
    if (isPortal) {
      selectedPlanets = selectedPlanets.filter(
        (p) => !p.hasPortal && !p.buildQueue.some((o) => o.category === 'building' && o.itemType === 'portal'),
      );
    }
    if (selectedPlanets.length === 0) {
      context.setNotice('No planets selected.', true);
      return;
    }

    let successCount = 0;
    let lastError = '';
    for (const planet of selectedPlanets) {
      const result = context.commands.queueBuilding({
        empireId: context.player.id,
        planetId: planet.id,
        buildingType,
        count,
      });
      if (result.ok) {
        successCount++;
      } else {
        lastError = result.message;
      }
    }

    if (successCount > 0) {
      const msg = `Queued ${count} ${BUILDINGS[buildingType].name} on ${successCount} planet${successCount > 1 ? 's' : ''}`;
      if (lastError) {
        context.setNotice(`${msg} (${selectedPlanets.length - successCount} failed: ${lastError})`, false, true);
      } else {
        context.setNotice(msg, false, true);
      }
      context.controller.refreshScene?.();
    } else {
      context.setNotice(lastError || 'Build failed.', true);
    }
  });
  buildBtn.classList.add('primary');

  formSection.append(costPreview, buildBtn);
  container.append(formSection);

  panel.append(container);

  function refreshCheckboxes(): void {
    for (const [id, cb] of checkboxes) {
      cb.checked = selected.has(id);
      rowElements.get(id)?.classList.toggle('mass-build-row-selected', selected.has(id));
    }
  }

  return panel;
}

function calcMaxMassAffordable(
  buildingType: BuildingKey,
  constructionSci: number,
  selectedPlanets: Planet[],
  resources: Record<ResourceKey, number>,
): number {
  const baseCosts = BUILDINGS[buildingType].cost as Partial<Record<ResourceKey, number>>;
  const discount = 1 / (1 + constructionSci / 100);
  const available: Record<ResourceKey, number> = { ...resources };
  let count = 0;

  for (let i = 0; i < 999; i++) {
    const roundCost: Partial<Record<ResourceKey, number>> = {};
    let canAfford = true;

    for (const planet of selectedPlanets) {
      const simTotal = countBuildingsAndQueue(planet) + i;
      const overbuild = simTotal > planet.size ? simTotal / planet.size : 1;
      for (const res of Object.keys(baseCosts) as ResourceKey[]) {
        const baseAmount = baseCosts[res] ?? 0;
        if (!baseAmount) continue;
        const cost = Math.max(Math.trunc(baseAmount * discount * overbuild), Math.trunc(baseAmount * 0.5));
        roundCost[res] = (roundCost[res] ?? 0) + cost;
      }
    }

    for (const res of Object.keys(roundCost) as ResourceKey[]) {
      if ((roundCost[res] ?? 0) > (available[res] ?? 0)) {
        canAfford = false;
        break;
      }
    }
    if (!canAfford) break;

    for (const res of Object.keys(roundCost) as ResourceKey[]) {
      available[res] = (available[res] ?? 0) - (roundCost[res] ?? 0);
    }
    count++;
  }

  return count;
}

function textCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'mass-build-cell';
  cell.textContent = text;
  return cell;
}
