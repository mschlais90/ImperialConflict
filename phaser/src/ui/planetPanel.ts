import { BUILDINGS, getBuildCost, getOverbuildMultiplier } from '../core/data/buildings';
import { UNITS } from '../core/data/units';
import type { GameState } from '../core/galaxy/galaxyData';
import type { BuildingKey, CombatUnitKey, Planet, PlanetUnitKey, UnitKey } from '../core/models/types';
import { calcSciencePercent, calcTravelTicks, getEmpire, getPlanet, getPlanetsForEmpire, getSystem } from '../core/selectors/selectors';
import { button, collapsible, formatNumber, labeledControl, maxAffordable, numberInput, parseIntegerInput, resourceCostText, select } from './dom';
import type { UiContext } from './types';

const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKey[];

function countBuildingsAndQueue(planet: Planet): number {
  const built = BUILDING_KEYS.reduce((sum, key) => sum + (planet.buildings[key] ?? 0), 0);
  const queued = planet.buildQueue.filter((order) => order.category === 'building').length;
  return built + queued;
}
const COMBAT_UNITS: CombatUnitKey[] = ['fighter', 'bomber', 'transport', 'soldier', 'droid'];
const TRAINABLE_UNITS: Array<Exclude<UnitKey, 'explorer'>> = [
  'fighter',
  'bomber',
  'transport',
  'soldier',
  'droid',
  'agent',
  'wizard',
];
const PLANET_DISPLAY_UNITS: PlanetUnitKey[] = ['fighter', 'bomber', 'transport', 'soldier', 'droid', 'explorer', 'agent', 'wizard'];

export function renderPlanetPanel(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Planet panel requires game state.');
  }

  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const selectedPlanetId = context.controller.clientState?.selectedPlanetId ?? null;
  const selectedPlanet = selectedPlanetId === null ? undefined : getPlanet(state, selectedPlanetId);
  if (!selectedPlanet) {
    panel.append(sectionTitle('Planet'), emptyText('Select a planet in a system.'));
    return panel;
  }

  const system = getSystem(state, selectedPlanet.systemId);
  const owner = selectedPlanet.ownerId >= 0 ? getEmpire(state, selectedPlanet.ownerId) : undefined;
  const details: Array<[string, string]> = [
    ['System', system?.systemName ?? 'Unknown'],
  ];
  if (owner) {
    details.push(['Owner', owner.empireName]);
  }
  details.push(
    ['Size', `${countBuildingsAndQueue(selectedPlanet)}/${formatNumber(selectedPlanet.size)}`],
    ['Population', formatNumber(selectedPlanet.population)],
  );
  if (selectedPlanet.hasPortal) {
    details.push(['Portal', 'Active']);
  }
  const bonuses = Object.entries(selectedPlanet.resourceBonuses);
  if (bonuses.length > 0) {
    for (const [res, mult] of bonuses) {
      details.push(['Bonus', `${res.charAt(0).toUpperCase() + res.slice(1)} x${(mult as number).toFixed(1)}`]);
    }
  }
  panel.append(sectionTitle(selectedPlanet.planetName), detailGrid(details));

  if (selectedPlanet.ownerId === context.player.id) {
    panel.append(renderOwnedPlanet(context, selectedPlanet));
  } else if (selectedPlanet.ownerId < 0) {
    panel.append(renderUncolonizedPlanet(context, selectedPlanet));
  } else {
    panel.append(renderEnemyPlanet(context, selectedPlanet));
  }

  return panel;
}

function renderOwnedPlanet(context: UiContext, planet: Planet): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Owned planet controls require game state.');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'panel-stack';

  wrapper.append(
    collapsible('planet-buildings', 'Buildings', () => buildingsSection(context, planet), true),
    collapsible('planet-fleets', 'Units & Training', () => unitsSection(context, planet), false),
  );

  return wrapper;
}

function buildingsSection(context: UiContext, planet: Planet): HTMLElement {
  const state = context.controller.state!;
  const constructionSci = calcSciencePercent(state, context.player, 'construction');
  const frag = document.createElement('div');
  frag.className = 'panel-stack';

  // Overbuild warning
  const overbuild = getOverbuildMultiplier(planet);
  if (overbuild > 1) {
    const warn = document.createElement('p');
    warn.className = 'overbuild-warning';
    warn.textContent = `Overbuilt: ${Math.trunc((overbuild - 1) * 100)}% cost increase`;
    frag.append(warn);
  }

  // Current buildings + build inputs
  const buildForm = document.createElement('div');
  buildForm.className = 'build-grid';
  const inputs = new Map<BuildingKey, HTMLInputElement>();

  for (const key of BUILDING_KEYS) {
    if (key === 'portal' && (planet.hasPortal || planet.buildQueue.some((o) => o.category === 'building' && o.itemType === 'portal'))) {
      continue;
    }
    const built = planet.buildings[key] ?? 0;
    const cost = getBuildCost(key, constructionSci, planet);
    const affordable = maxAffordable(context.player.resources, cost);

    const row = document.createElement('div');
    row.className = 'build-row';

    const label = document.createElement('span');
    label.className = 'build-label';
    label.textContent = `${BUILDINGS[key].name} ${built} (${affordable})`;

    const costLabel = document.createElement('span');
    costLabel.className = affordable === 0 ? 'build-cost cost-unaffordable' : 'build-cost';
    costLabel.textContent = resourceCostText(cost);

    const input = numberInput(0, { min: 0 });
    input.className = 'build-input';
    inputs.set(key, input);

    row.append(label, costLabel, input);
    buildForm.append(row);
  }

  // Live cost preview
  const costPreview = document.createElement('div');
  costPreview.className = 'build-cost-preview';

  function updateCostPreview(): void {
    const totals: Record<string, number> = {};
    for (const key of BUILDING_KEYS) {
      const input = inputs.get(key);
      if (!input) continue;
      const count = parseInt(input.value, 10);
      if (!count || count <= 0) continue;
      const cost = getBuildCost(key, constructionSci, planet);
      for (const [res, amount] of Object.entries(cost)) {
        totals[res] = (totals[res] ?? 0) + amount * count;
      }
    }
    const entries = Object.entries(totals).filter(([, v]) => v > 0);
    if (entries.length === 0) {
      costPreview.textContent = '';
      return;
    }
    const parts = entries.map(([res, amount]) => {
      const available = (context.player.resources as Record<string, number>)[res] ?? 0;
      const unaffordable = amount > available;
      return `<span class="${unaffordable ? 'cost-unaffordable' : ''}">${formatNumber(amount)} ${res}</span>`;
    });
    costPreview.innerHTML = `Total: ${parts.join(', ')}`;
  }

  for (const input of inputs.values()) {
    input.addEventListener('input', updateCostPreview);
  }

  const queueAllBtn = button('Build', () => {
    let anyQueued = false;
    for (const key of BUILDING_KEYS) {
      const input = inputs.get(key);
      if (!input) continue;
      const parsed = parseIntegerInput(input.value, { label: BUILDINGS[key].name, min: 0, max: 999 });
      if (!parsed.ok) {
        context.setNotice(parsed.message, true);
        return;
      }
      if (parsed.value > 0) {
        const result = context.commands.queueBuilding({
          empireId: context.player.id,
          planetId: planet.id,
          buildingType: key,
          count: parsed.value,
        });
        if (!result.ok) {
          context.setNotice(result.message, true);
          return;
        }
        anyQueued = true;
      }
    }
    if (anyQueued) {
      context.setNotice('Buildings queued.', false, true);
      context.controller.refreshScene?.();
    }
  });
  queueAllBtn.classList.add('primary');

  frag.append(buildForm, costPreview, queueAllBtn);

  // Explorer queue
  const allPlanets = getPlanetsForEmpire(state, context.player.id);
  const totalExplorers = allPlanets.reduce((sum, p) => sum + (p.units.explorer ?? 0), 0);
  const queuedExplorers = allPlanets.reduce(
    (sum, p) => sum + p.buildQueue.filter((o) => o.category === 'unit' && o.itemType === 'explorer').length,
    0,
  );
  const explorerCost = resourceCostText(UNITS.explorer.cost);
  const explorerAffordable = maxAffordable(context.player.resources, UNITS.explorer.cost);

  const explorerCount = document.createElement('div');
  explorerCount.className = 'explorer-count';
  explorerCount.textContent = `Idle: ${totalExplorers}` + (queuedExplorers > 0 ? ` | Building: ${queuedExplorers}` : '');

  const explorerRow = document.createElement('div');
  explorerRow.className = 'inline-form';
  const explorerInput = numberInput(0, { min: 0 });
  explorerRow.append(
    labeledControl(`Explorer (${explorerCost}) max: ${explorerAffordable}`, explorerInput),
    button('Queue', () => {
      const parsed = parseIntegerInput(explorerInput.value, { label: 'Explorer count', min: 1, max: 999 });
      if (!parsed.ok) {
        context.setNotice(parsed.message, true);
        return;
      }
      context.runCommand(() =>
        context.commands.queueExplorer({ empireId: context.player.id, planetId: planet.id, count: parsed.value }),
      );
    }),
  );
  frag.append(subtitle('Explorers'), explorerCount, explorerRow);

  // Build queue
  frag.append(subtitle('Queue'), queueList(planet));

  return frag;
}

function unitsSection(context: UiContext, planet: Planet): HTMLElement {
  const frag = document.createElement('div');
  frag.className = 'panel-stack';

  // Current unit counts
  const unitList = PLANET_DISPLAY_UNITS.filter((key) => (planet.units[key] ?? 0) > 0);
  if (unitList.length > 0) {
    frag.append(keyValueList(unitList.map((key) => [UNITS[key].name, planet.units[key] ?? 0])));
  }

  // Train inputs
  const trainForm = document.createElement('div');
  trainForm.className = 'build-grid';
  const inputs = new Map<Exclude<UnitKey, 'explorer'>, HTMLInputElement>();

  for (const key of TRAINABLE_UNITS) {
    const cost = UNITS[key].cost;
    const affordable = maxAffordable(context.player.resources, cost);

    const row = document.createElement('div');
    row.className = 'build-row';

    const label = document.createElement('span');
    label.className = 'build-label';
    label.textContent = `${UNITS[key].name} ${planet.units[key] ?? 0}`;

    const costLabel = document.createElement('span');
    costLabel.className = 'build-cost';
    costLabel.textContent = resourceCostText(cost);

    const inputWrapper = document.createElement('span');
    inputWrapper.className = 'build-input-wrapper';
    const input = numberInput(0, { min: 0 });
    input.className = 'build-input';
    inputs.set(key, input);
    const maxLabel = document.createElement('span');
    maxLabel.className = 'build-max';
    maxLabel.textContent = `(${affordable})`;
    inputWrapper.append(input, maxLabel);

    row.append(label, costLabel, inputWrapper);
    trainForm.append(row);
  }

  const trainAllBtn = button('Train All', () => {
    let anyTrained = false;
    for (const key of TRAINABLE_UNITS) {
      const input = inputs.get(key)!;
      const parsed = parseIntegerInput(input.value, { label: UNITS[key].name, min: 0, max: 999_999 });
      if (!parsed.ok) {
        context.setNotice(parsed.message, true);
        return;
      }
      if (parsed.value > 0) {
        const result = context.commands.trainUnits({
          empireId: context.player.id,
          planetId: planet.id,
          unitType: key,
          count: parsed.value,
        });
        if (!result.ok) {
          context.setNotice(result.message, true);
          return;
        }
        anyTrained = true;
      }
    }
    if (anyTrained) {
      context.setNotice('Units trained.', false, true);
      context.controller.refreshScene?.();
    }
  });
  trainAllBtn.classList.add('primary');

  frag.append(subtitle('Train'), trainForm, trainAllBtn);

  return frag;
}

function renderUncolonizedPlanet(context: UiContext, target: Planet): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Explorer launch controls require game state.');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'panel-stack';

  const playerPlanets = getPlanetsForEmpire(state, context.player.id);

  const portalPlanets = playerPlanets.filter((p) => p.hasPortal);
  const portalExplorerCount = portalPlanets.reduce((sum, p) => sum + (p.units.explorer ?? 0), 0);
  let bestPortal: Planet | null = null;
  let bestPortalTicks = Infinity;
  if (portalExplorerCount > 0) {
    for (const p of portalPlanets) {
      const ticks = calcTravelTicks(state, p.systemId, target.systemId);
      if (ticks < bestPortalTicks) {
        bestPortalTicks = ticks;
        bestPortal = p;
      }
    }
  }

  let bestDirect: Planet | null = null;
  let bestDirectTicks = Infinity;
  for (const p of playerPlanets) {
    if (p.hasPortal) continue;
    if ((p.units.explorer ?? 0) <= 0) continue;
    const ticks = calcTravelTicks(state, p.systemId, target.systemId);
    if (ticks < bestDirectTicks) {
      bestDirectTicks = ticks;
      bestDirect = p;
    }
  }

  if (!bestPortal && !bestDirect) {
    wrapper.append(emptyText('No idle explorers available.'));
    return wrapper;
  }

  const usePortal = bestPortal && (!bestDirect || bestPortalTicks <= bestDirectTicks);
  const source = usePortal ? bestPortal! : bestDirect!;
  const ticks = usePortal ? bestPortalTicks : bestDirectTicks;
  const label = usePortal ? `Send explorer via portal (${ticks} ticks)` : `Send explorer from ${source.planetName} (${ticks} ticks)`;

  const form = document.createElement('div');
  form.className = 'inline-form';
  form.append(
    button(label, () => {
      context.runCommand(() =>
        context.commands.sendExplorer({ empireId: context.player.id, sourcePlanetId: source.id, targetPlanetId: target.id }),
      );
    }),
  );
  wrapper.append(subtitle('Colonize'), form);
  return wrapper;
}

function renderEnemyPlanet(context: UiContext, target: Planet): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Attack controls require game state.');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'panel-stack';
  const allPlanets = getPlanetsForEmpire(state, context.player.id);
  const sources = allPlanets.filter((planet) =>
    COMBAT_UNITS.some((unit) => (planet.units[unit] ?? 0) > 0),
  );
  const portalPlanets = allPlanets.filter((p) => p.hasPortal);
  const hasPortalUnits = portalPlanets.some((p) =>
    COMBAT_UNITS.some((unit) => (p.units[unit] ?? 0) > 0),
  );

  if (sources.length === 0) {
    wrapper.append(emptyText('No combat units available.'));
    return wrapper;
  }

  wrapper.append(subtitle('Attack'), fleetForm(context, target, sources, hasPortalUnits ? portalPlanets : []));
  return wrapper;
}

const PORTAL_NETWORK_VALUE = -999;

export function fleetForm(context: UiContext, target: Planet, sources: Planet[], portalPlanets: Planet[] = []): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Fleet form requires game state.');
  }

  const form = document.createElement('div');
  form.className = 'fleet-form';
  if (sources.length === 0 && portalPlanets.length === 0) {
    form.append(emptyText('No source planets available.'));
    return form;
  }

  const hasPortalOption = portalPlanets.length > 0;

  const sourceOptions: Array<{ label: string; value: number }> = [];
  if (hasPortalOption) {
    const nearestTicks = getNearestPortalTicks(state, portalPlanets, target);
    sourceOptions.push({ label: `\u{1F310} Portal Network (${nearestTicks} ticks)`, value: PORTAL_NETWORK_VALUE });
  }
  const sourcesWithTicks = sources.map((planet) => ({
    planet,
    ticks: calcTravelTicks(state, planet.systemId, target.systemId),
  }));
  sourcesWithTicks.sort((a, b) => a.ticks - b.ticks);
  for (const { planet, ticks } of sourcesWithTicks) {
    sourceOptions.push({ label: `${planet.planetName} (${ticks} ticks)`, value: planet.id });
  }

  const defaultValue = hasPortalOption ? PORTAL_NETWORK_VALUE : sourcesWithTicks[0].planet.id;
  const sourceSelect = select(sourceOptions, defaultValue);
  sourceSelect.className = 'fleet-source-select';
  const sourceRow = document.createElement('label');
  sourceRow.className = 'fleet-source-row';
  sourceRow.append(document.createTextNode('Source'), sourceSelect);
  form.append(sourceRow);

  const inputs = new Map<CombatUnitKey, HTMLInputElement>();
  const availableLabels = new Map<CombatUnitKey, HTMLSpanElement>();

  function isPortalMode(): boolean {
    return Number(sourceSelect.value) === PORTAL_NETWORK_VALUE;
  }

  function getAvailableUnits(unit: CombatUnitKey): number {
    if (isPortalMode()) {
      return portalPlanets.reduce((sum, p) => sum + (p.units[unit] ?? 0), 0);
    }
    const source = sources.find((p) => p.id === Number(sourceSelect.value)) ?? sources[0];
    return source.units[unit] ?? 0;
  }

  for (const unit of COMBAT_UNITS) {
    const available = getAvailableUnits(unit);
    const input = numberInput(0, { min: 0, max: available });
    inputs.set(unit, input);

    const row = document.createElement('div');
    row.className = 'fleet-unit-row';
    const label = document.createElement('span');
    label.textContent = UNITS[unit].name;
    const avail = document.createElement('span');
    avail.className = 'fleet-available';
    avail.textContent = `(${available})`;
    availableLabels.set(unit, avail);
    row.append(label, avail, input);
    form.append(row);
  }

  function updateAvailable(): void {
    for (const unit of COMBAT_UNITS) {
      const available = getAvailableUnits(unit);
      const avail = availableLabels.get(unit)!;
      avail.textContent = `(${available})`;
      const input = inputs.get(unit)!;
      input.max = String(available);
      if (Number(input.value) > available) {
        input.value = String(available);
      }
    }
  }

  sourceSelect.addEventListener('change', updateAvailable);

  const sendAllBtn = button('Send all', () => {
    for (const unit of COMBAT_UNITS) {
      const available = getAvailableUnits(unit);
      inputs.get(unit)!.value = String(available);
    }
  });

  const sendBtn = button('Send fleet', () => {
    const units: Partial<Record<CombatUnitKey, number>> = {};
    for (const unit of COMBAT_UNITS) {
      const parsedCount = parseIntegerInput(inputs.get(unit)?.value ?? '', { label: UNITS[unit].name, min: 0, max: 999_999 });
      if (!parsedCount.ok) {
        context.setNotice(parsedCount.message, true);
        return;
      }
      if (parsedCount.value > 0) {
        units[unit] = parsedCount.value;
      }
    }
    if (isPortalMode()) {
      context.runCommand(() =>
        context.commands.sendPortalFleet({
          empireId: context.player.id,
          targetPlanetId: target.id,
          units,
        }),
      );
    } else {
      context.runCommand(() =>
        context.commands.sendFleet({
          empireId: context.player.id,
          sourcePlanetId: Number(sourceSelect.value),
          targetPlanetId: target.id,
          units,
        }),
      );
    }
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'fleet-btn-row';
  btnRow.append(sendAllBtn, sendBtn);
  form.append(btnRow);
  return form;
}

function getNearestPortalTicks(state: GameState, portalPlanets: Planet[], target: Planet): number {
  let best = Infinity;
  for (const p of portalPlanets) {
    const ticks = calcTravelTicks(state, p.systemId, target.systemId);
    if (ticks < best) best = ticks;
  }
  return best === Infinity ? 1 : best;
}

function queueList(planet: Planet): HTMLElement {
  if (planet.buildQueue.length === 0) {
    return emptyText('Queue is empty.');
  }

  const grouped = new Map<string, { itemType: string; ticksRemaining: number; count: number }>();
  for (const order of planet.buildQueue) {
    const key = `${order.itemType}:${order.ticksRemaining}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(key, { itemType: order.itemType, ticksRemaining: order.ticksRemaining, count: 1 });
    }
  }

  const entries = Array.from(grouped.values()).sort((a, b) => a.ticksRemaining - b.ticksRemaining);
  return keyValueList(entries.map((g) => {
    const displayName = (BUILDINGS as Record<string, { name: string }>)[g.itemType]?.name
      ?? (UNITS as Record<string, { name: string }>)[g.itemType]?.name
      ?? g.itemType;
    const label = g.count > 1 ? `${displayName} x${g.count}` : displayName;
    return [label, `${g.ticksRemaining} ticks`];
  }));
}

function sectionTitle(text: string): HTMLHeadingElement {
  const title = document.createElement('h2');
  title.textContent = text;
  return title;
}

function subtitle(text: string): HTMLHeadingElement {
  const title = document.createElement('h3');
  title.textContent = text;
  return title;
}

function detailGrid(rows: Array<[string, string]>): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  for (const [label, value] of rows) {
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    const valueElement = document.createElement('strong');
    valueElement.textContent = value;
    grid.append(labelElement, valueElement);
  }
  return grid;
}

function keyValueList(rows: Array<[string, number | string]>): HTMLElement {
  const list = document.createElement('div');
  list.className = 'key-value-list';
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const valueText = typeof value === 'number' ? formatNumber(value) : value;
    row.innerHTML = `<span>${label}</span><strong>${valueText}</strong>`;
    list.append(row);
  }
  return list;
}

function emptyText(text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = 'empty-text';
  element.textContent = text;
  return element;
}
