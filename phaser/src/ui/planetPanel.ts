import { BUILDINGS } from '../core/data/buildings';
import { UNITS } from '../core/data/units';
import { queueBuilding, queueExplorer, sendExplorer, sendFleet } from '../core/commands/playerCommands';
import type { BuildingKey, CombatUnitKey, Planet, PlanetUnitKey } from '../core/models/types';
import { getEmpire, getPlanet, getPlanetsForEmpire, getSystem } from '../core/selectors/selectors';
import { button, formatNumber, numberInput, resourceCostText, select } from './dom';
import type { UiContext } from './types';

const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKey[];
const COMBAT_UNITS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];
const PLANET_UNITS: PlanetUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport', 'explorer', 'agent', 'wizard'];

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
  panel.append(sectionTitle(selectedPlanet.planetName), detailGrid([
    ['System', system?.systemName ?? 'Unknown'],
    ['Owner', owner?.empireName ?? 'Uncolonized'],
    ['Size', formatNumber(selectedPlanet.size)],
    ['Population', formatNumber(selectedPlanet.population)],
  ]));

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
  wrapper.append(subtitle('Buildings'), keyValueList(BUILDING_KEYS.map((key) => [BUILDINGS[key].name, planet.buildings[key] ?? 0])));
  wrapper.append(subtitle('Queue'), queueList(planet));
  wrapper.append(subtitle('Build'), buildControls(context, planet));
  wrapper.append(subtitle('Units'), keyValueList(PLANET_UNITS.map((key) => [UNITS[key].name, planet.units[key] ?? 0])));
  wrapper.append(subtitle('Explorers'), explorerBuildControls(context, planet));
  return wrapper;
}

function buildControls(context: UiContext, planet: Planet): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Build controls require game state.');
  }

  const form = document.createElement('div');
  form.className = 'inline-form';
  const buildingSelect = select(
    BUILDING_KEYS.map((key) => ({ label: `${BUILDINGS[key].name} (${resourceCostText(BUILDINGS[key].cost)})`, value: key })),
    'mine',
  );
  const count = numberInput(1, { min: 1 });
  form.append(
    buildingSelect,
    count,
    button('Queue', () => {
      context.runCommand(() =>
        queueBuilding(state, {
          empireId: context.player.id,
          planetId: planet.id,
          buildingType: buildingSelect.value as BuildingKey,
          count: readPositive(count),
        }),
      );
    }),
  );
  return form;
}

function explorerBuildControls(context: UiContext, planet: Planet): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Explorer controls require game state.');
  }

  const form = document.createElement('div');
  form.className = 'inline-form';
  const count = numberInput(1, { min: 1 });
  form.append(
    count,
    button(`Queue explorer (${resourceCostText(UNITS.explorer.cost)})`, () => {
      context.runCommand(() => queueExplorer(state, { empireId: context.player.id, planetId: planet.id, count: readPositive(count) }));
    }),
  );
  return form;
}

function renderUncolonizedPlanet(context: UiContext, target: Planet): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Explorer launch controls require game state.');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'panel-stack';
  const sources = getPlanetsForEmpire(state, context.player.id).filter((planet) => (planet.units.explorer ?? 0) > 0);
  if (sources.length === 0) {
    wrapper.append(emptyText('No idle explorers available.'));
    return wrapper;
  }

  const sourceSelect = select(
    sources.map((planet) => ({ label: `${planet.planetName} (${planet.units.explorer ?? 0})`, value: planet.id })),
    sources[0].id,
  );
  const form = document.createElement('div');
  form.className = 'inline-form';
  form.append(
    sourceSelect,
    button('Launch explorer', () => {
      context.runCommand(() =>
        sendExplorer(state, { empireId: context.player.id, sourcePlanetId: Number(sourceSelect.value), targetPlanetId: target.id }),
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
      const units = Object.fromEntries(COMBAT_UNITS.map((unit) => [unit, readNonNegative(inputs.get(unit))])) as Partial<
        Record<CombatUnitKey, number>
      >;
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

  return keyValueList(planet.buildQueue.slice(0, 6).map((order) => [order.itemType, `${order.ticksRemaining} ticks`]));
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

function labeledControl(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('label');
  row.className = 'form-row';
  row.append(document.createTextNode(label), control);
  return row;
}

function emptyText(text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = 'empty-text';
  element.textContent = text;
  return element;
}

function readPositive(input: HTMLInputElement): number {
  return Math.max(1, Math.trunc(Number(input.value)));
}

function readNonNegative(input: HTMLInputElement | undefined): number {
  return Math.max(0, Math.trunc(Number(input?.value ?? 0)));
}
