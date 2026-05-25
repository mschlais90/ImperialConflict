import { BUILDINGS, getBuildCost, getOverbuildMultiplier } from '../core/data/buildings';
import { queueBuilding } from '../core/commands/playerCommands';
import type { BuildingKey, Planet, ResourceKey } from '../core/models/types';
import { calcSciencePercent, getPlanetsForEmpire } from '../core/selectors/selectors';
import { button, numberInput, parseIntegerInput, resourceCostText } from './dom';
import type { UiContext } from './types';

const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKey[];

// Persists selection across re-renders within the same session
let persistedSelection: Set<number> | null = null;

const BONUS_LABELS: Record<ResourceKey, string> = {
  gc: 'GC',
  food: 'Food',
  iron: 'Iron',
  endurium: 'End',
  octarine: 'Oct',
};

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

function bonusText(planet: Planet): string {
  const entries = Object.entries(planet.resourceBonuses) as Array<[ResourceKey, number]>;
  if (entries.length === 0) return '';
  return entries
    .filter(([, mult]) => mult !== 1)
    .map(([res, mult]) => `${BONUS_LABELS[res]} x${mult.toFixed(1)}`)
    .join(', ');
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
  });
  const deselectAllBtn = button('Deselect All', () => {
    selected.clear();
    refreshCheckboxes();
  });
  toggleRow.append(selectAllBtn, deselectAllBtn);
  container.append(toggleRow);

  // Planet table
  const table = document.createElement('div');
  table.className = 'mass-build-table';

  // Header
  const headerRow = document.createElement('div');
  headerRow.className = 'mass-build-row mass-build-row-header';
  headerRow.append(
    hdrCell(''),
    hdrCell('Planet'),
    hdrCell(''),
    hdrCell('Built'),
    hdrCell('Lasers'),
    hdrCell('OB%'),
    hdrCell('Bonuses'),
  );
  table.append(headerRow);

  const checkboxes = new Map<number, HTMLInputElement>();
  const rows = new Map<number, HTMLElement>();

  for (const planet of planets) {
    const total = countBuildingsAndQueue(planet);
    const ob = overbuildPercent(planet);
    const bonus = bonusText(planet);

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
    });
    checkboxes.set(planet.id, cb);
    rows.set(planet.id, row);

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
    const bonusCell = textCell(bonus || '-');
    if (bonus) bonusCell.classList.add('mass-build-bonus');

    row.append(cbCell, nameCell, portalCell, builtCell, laserCell, obCell, bonusCell);
    table.append(row);
  }

  container.append(table);

  // Building selection and count
  const formSection = document.createElement('div');
  formSection.className = 'mass-build-form';

  const buildingLabel = document.createElement('label');
  buildingLabel.className = 'form-row';
  buildingLabel.textContent = 'Building: ';
  const buildingSelect = document.createElement('select');
  for (const key of BUILDING_KEYS) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key === 'portal' ? '\u{1F310} ' + BUILDINGS[key].name : BUILDINGS[key].name;
    buildingSelect.append(opt);
  }
  buildingLabel.append(buildingSelect);

  const countLabel = document.createElement('label');
  countLabel.className = 'form-row';
  countLabel.textContent = 'Count per planet: ';
  const countInput = numberInput(1, { min: 1 });
  countInput.className = 'build-input';
  countLabel.append(countInput);

  // Cost preview
  const costPreview = document.createElement('div');
  costPreview.className = 'mass-build-cost-preview';

  function updateCostPreview(): void {
    const buildingType = buildingSelect.value as BuildingKey;
    const isPortal = buildingType === 'portal';
    countInput.disabled = isPortal;
    if (isPortal) countInput.value = '1';
    const baseCost = getBuildCost(buildingType, constructionSci);
    costPreview.textContent = isPortal
      ? `Cost per portal: ${resourceCostText(baseCost)} (skips planets that already have one)`
      : `Cost per unit: ${resourceCostText(baseCost)}`;
  }

  buildingSelect.addEventListener('change', updateCostPreview);
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
      const result = queueBuilding(state, {
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

  formSection.append(buildingLabel, countLabel, costPreview, buildBtn);
  container.append(formSection);

  panel.append(container);

  function refreshCheckboxes(): void {
    for (const [id, cb] of checkboxes) {
      cb.checked = selected.has(id);
      rows.get(id)?.classList.toggle('mass-build-row-selected', selected.has(id));
    }
  }

  return panel;
}

function hdrCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'mass-build-header';
  cell.textContent = text;
  return cell;
}

function textCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'mass-build-cell';
  cell.textContent = text;
  return cell;
}
