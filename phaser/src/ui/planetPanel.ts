import { BUILDINGS, getBuildCost } from '../core/data/buildings';
import { UNITS } from '../core/data/units';
import { queueBuilding, queueExplorer, sendExplorer, sendFleet, trainUnits } from '../core/commands/playerCommands';
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
const COMBAT_UNITS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];
const TRAINABLE_UNITS: Array<Exclude<UnitKey, 'explorer'>> = [
  'fighter',
  'bomber',
  'soldier',
  'droid',
  'transport',
  'agent',
  'wizard',
];
const PLANET_DISPLAY_UNITS: PlanetUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport', 'explorer', 'agent', 'wizard'];

export function renderPlanetPanel(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Planet panel requires game state.');
  }

  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const selectedPlanet = state.selectedPlanetId === null ? undefined : getPlanet(state, state.selectedPlanetId);
  if (!selectedPlanet) {
    panel.append(sectionTitle('Planet'), emptyText('Select a planet in a system.'));
    return panel;
  }

  const system = getSystem(state, selectedPlanet.systemId);
  const owner = selectedPlanet.ownerId >= 0 ? getEmpire(state, selectedPlanet.ownerId) : undefined;
  const details: Array<[string, string]> = [
    ['System', system?.systemName ?? 'Unknown'],
    ['Owner', owner?.empireName ?? 'Uncolonized'],
    ['Size', `${countBuildingsAndQueue(selectedPlanet)}/${formatNumber(selectedPlanet.size)}`],
    ['Population', formatNumber(selectedPlanet.population)],
  ];
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

  // Current buildings + build inputs
  const buildForm = document.createElement('div');
  buildForm.className = 'build-grid';
  const inputs = new Map<BuildingKey, HTMLInputElement>();

  for (const key of BUILDING_KEYS) {
    const built = planet.buildings[key] ?? 0;
    const cost = getBuildCost(key, constructionSci, planet);
    const affordable = maxAffordable(context.player.resources, cost);

    const row = document.createElement('div');
    row.className = 'build-row';

    const label = document.createElement('span');
    label.className = 'build-label';
    label.textContent = `${BUILDINGS[key].name}`;

    const countLabel = document.createElement('span');
    countLabel.className = 'build-count';
    countLabel.textContent = `${built}`;

    const costLabel = document.createElement('span');
    costLabel.className = 'build-cost';
    costLabel.textContent = resourceCostText(cost);

    const input = numberInput(affordable, { min: 0 });
    input.className = 'build-input';
    inputs.set(key, input);

    row.append(label, countLabel, costLabel, input);
    buildForm.append(row);
  }

  const queueAllBtn = button('Queue All', () => {
    let anyQueued = false;
    for (const key of BUILDING_KEYS) {
      const input = inputs.get(key)!;
      const parsed = parseIntegerInput(input.value, { label: BUILDINGS[key].name, min: 0, max: 999 });
      if (!parsed.ok) {
        context.setNotice(parsed.message, true);
        return;
      }
      if (parsed.value > 0) {
        const result = queueBuilding(state, {
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
      context.setNotice('Buildings queued.');
      context.controller.refreshScene?.();
    }
  });
  queueAllBtn.classList.add('primary');

  frag.append(buildForm, queueAllBtn);

  // Explorer queue
  const explorerCost = resourceCostText(UNITS.explorer.cost);
  const explorerAffordable = maxAffordable(context.player.resources, UNITS.explorer.cost);
  const explorerRow = document.createElement('div');
  explorerRow.className = 'inline-form';
  const explorerInput = numberInput(explorerAffordable, { min: 0 });
  explorerRow.append(
    labeledControl(`Explorer (${explorerCost})`, explorerInput),
    button('Queue', () => {
      const parsed = parseIntegerInput(explorerInput.value, { label: 'Explorer count', min: 1, max: 999 });
      if (!parsed.ok) {
        context.setNotice(parsed.message, true);
        return;
      }
      context.runCommand(() =>
        queueExplorer(state, { empireId: context.player.id, planetId: planet.id, count: parsed.value }),
      );
    }),
  );
  frag.append(subtitle('Explorers'), explorerRow);

  // Build queue
  frag.append(subtitle('Queue'), queueList(planet));

  return frag;
}

function unitsSection(context: UiContext, planet: Planet): HTMLElement {
  const state = context.controller.state!;
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
    label.textContent = UNITS[key].name;

    const countLabel = document.createElement('span');
    countLabel.className = 'build-count';
    countLabel.textContent = `${planet.units[key] ?? 0}`;

    const costLabel = document.createElement('span');
    costLabel.className = 'build-cost';
    costLabel.textContent = resourceCostText(cost);

    const input = numberInput(affordable, { min: 0 });
    input.className = 'build-input';
    inputs.set(key, input);

    row.append(label, countLabel, costLabel, input);
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
        const result = trainUnits(state, {
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
      context.setNotice('Units trained.');
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
        sendExplorer(state, { empireId: context.player.id, sourcePlanetId: source.id, targetPlanetId: target.id }),
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
  const sources = getPlanetsForEmpire(state, context.player.id).filter((planet) =>
    COMBAT_UNITS.some((unit) => (planet.units[unit] ?? 0) > 0),
  );
  if (sources.length === 0) {
    wrapper.append(emptyText('No combat units available.'));
    return wrapper;
  }

  wrapper.append(subtitle('Attack'), fleetForm(context, target, sources));
  return wrapper;
}

export function fleetForm(context: UiContext, target: Planet, sources: Planet[]): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Fleet form requires game state.');
  }

  const form = document.createElement('div');
  form.className = 'fleet-form';
  if (sources.length === 0) {
    form.append(emptyText('No source planets available.'));
    return form;
  }

  const sourceSelect = select(
    sources.map((planet) => ({ label: planet.planetName, value: planet.id })),
    sources[0].id,
  );
  form.append(labeledControl('Source', sourceSelect));

  const inputs = new Map<CombatUnitKey, HTMLInputElement>();
  for (const unit of COMBAT_UNITS) {
    const input = numberInput(0, { min: 0 });
    inputs.set(unit, input);
    form.append(labeledControl(UNITS[unit].name, input));
  }

  form.append(
    button('Send fleet', () => {
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
      context.runCommand(() =>
        sendFleet(state, {
          empireId: context.player.id,
          sourcePlanetId: Number(sourceSelect.value),
          targetPlanetId: target.id,
          units,
        }),
      );
    }),
  );
  return form;
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

  const entries = Array.from(grouped.values()).slice(0, 6);
  return keyValueList(entries.map((g) => {
    const label = g.count > 1 ? `${g.itemType} x${g.count}` : g.itemType;
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
