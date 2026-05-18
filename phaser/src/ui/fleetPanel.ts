import { UNITS } from '../core/data/units';
import { trainUnits } from '../core/commands/playerCommands';
import type { Planet, UnitKey } from '../core/models/types';
import { getPlanet, getPlanetsForEmpire } from '../core/selectors/selectors';
import { button, numberInput, resourceCostText, select } from './dom';
import { fleetForm } from './planetPanel';
import type { UiContext } from './types';

const TRAINABLE_UNITS: Array<Exclude<UnitKey, 'explorer'>> = [
  'fighter',
  'bomber',
  'soldier',
  'droid',
  'transport',
  'agent',
  'wizard',
];

export function renderFleetPanel(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Fleet panel requires game state.');
  }

  const panel = document.createElement('section');
  panel.className = 'side-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Fleets';
  panel.append(title);

  const ownedPlanets = getPlanetsForEmpire(state, context.player.id);
  panel.append(subtitle('Train'), trainControls(context, ownedPlanets));

  const selectedTarget = state.selectedPlanetId === null ? undefined : getPlanet(state, state.selectedPlanetId);
  if (selectedTarget && selectedTarget.ownerId !== context.player.id) {
    panel.append(subtitle('Send to selected'), fleetForm(context, selectedTarget, ownedPlanets));
  } else {
    panel.append(emptyText('Select a neutral or enemy planet to send fleets.'));
  }

  const active = state.fleets.filter((fleet) => fleet.ownerId === context.player.id);
  panel.append(subtitle('Active'), active.length > 0 ? fleetList(active) : emptyText('No fleets in transit.'));
  return panel;
}

function trainControls(context: UiContext, ownedPlanets: Planet[]): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Train controls require game state.');
  }

  if (ownedPlanets.length === 0) {
    return emptyText('No owned planets.');
  }

  const form = document.createElement('div');
  form.className = 'inline-form wrap';
  const planetSelect = select(
    ownedPlanets.map((planet) => ({ label: planet.planetName, value: planet.id })),
    context.controller.state?.selectedPlanetId ?? ownedPlanets[0].id,
  );
  const unitSelect = select(
    TRAINABLE_UNITS.map((unit) => ({ label: `${UNITS[unit].name} (${resourceCostText(UNITS[unit].cost)})`, value: unit })),
    'fighter',
  );
  const count = numberInput(1, { min: 1 });
  form.append(
    planetSelect,
    unitSelect,
    count,
    button('Train', () => {
      context.runCommand(() =>
        trainUnits(state, {
          empireId: context.player.id,
          planetId: Number(planetSelect.value),
          unitType: unitSelect.value as Exclude<UnitKey, 'explorer'>,
          count: Math.max(1, Math.trunc(Number(count.value))),
        }),
      );
    }),
  );
  return form;
}

function fleetList(fleets: Array<{ id: number; targetPlanetId: number; ticksRemaining: number; isExploration: boolean }>): HTMLElement {
  const list = document.createElement('div');
  list.className = 'key-value-list';
  for (const fleet of fleets.slice(0, 6)) {
    const row = document.createElement('div');
    row.innerHTML = `<span>${fleet.isExploration ? 'Explorer' : `Fleet ${fleet.id}`} to ${fleet.targetPlanetId}</span><strong>${fleet.ticksRemaining} ticks</strong>`;
    list.append(row);
  }
  return list;
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
