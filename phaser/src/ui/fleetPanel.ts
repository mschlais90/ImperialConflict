import { UNITS } from '../core/data/units';
import { trainUnits } from '../core/commands/playerCommands';
import type { CombatUnitKey, Fleet, Planet, UnitKey } from '../core/models/types';
import { calcTravelTicks, getPlanet, getPlanetsForEmpire } from '../core/selectors/selectors';
import { button, labeledControl, numberInput, parseIntegerInput, resourceCostText, select } from './dom';
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
    panel.append(
      subtitle('Send to selected'),
      ownedPlanets.length > 0 ? fleetForm(context, selectedTarget, ownedPlanets) : emptyText('No owned planets can send fleets.'),
    );
  } else {
    panel.append(emptyText('Select a neutral or enemy planet to send fleets.'));
  }

  const active = state.fleets.filter((fleet) => fleet.ownerId === context.player.id);
  panel.append(subtitle('Active'), active.length > 0 ? fleetList(active, state) : emptyText('No fleets in transit.'));

  // Fleet summary
  panel.append(subtitle('Fleet Summary'), fleetSummary(context, ownedPlanets, active));

  // Recall section
  const portalPlanets = ownedPlanets.filter((p) => p.hasPortal);
  if (active.length > 0 && portalPlanets.length > 0) {
    panel.append(subtitle('Recall to Portal'), recallControls(context, active, portalPlanets));
  }

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
    labeledControl('Planet', planetSelect),
    labeledControl('Unit', unitSelect),
    labeledControl('Count', count),
    button('Train', () => {
      const parsedCount = parseIntegerInput(count.value, { label: 'Train count', min: 1, max: 999_999 });
      if (!parsedCount.ok) {
        context.setNotice(parsedCount.message, true);
        return;
      }
      context.runCommand(() =>
        trainUnits(state, {
          empireId: context.player.id,
          planetId: Number(planetSelect.value),
          unitType: unitSelect.value as Exclude<UnitKey, 'explorer'>,
          count: parsedCount.value,
        }),
      );
    }),
  );
  return form;
}

function fleetList(fleets: Fleet[], state: { planets: Planet[] }): HTMLElement {
  const list = document.createElement('div');
  list.className = 'key-value-list';
  const sorted = [...fleets].sort((a, b) => a.ticksRemaining - b.ticksRemaining);
  for (const fleet of sorted.slice(0, 8)) {
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
  for (const key of ['fighter', 'bomber', 'soldier', 'droid', 'transport'] as CombatUnitKey[]) {
    const count = units[key] ?? 0;
    if (count > 0) parts.push(`${count}${UNIT_ABBREV[key]}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'empty';
}

function fleetSummary(_context: UiContext, planets: Planet[], fleets: Fleet[]): HTMLElement {
  const totals: Record<string, { stationed: number; transit: number }> = {};
  for (const key of ['fighter', 'bomber', 'soldier', 'droid', 'transport'] as CombatUnitKey[]) {
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
    row.innerHTML = `<span>${UNITS[key as UnitKey].name}</span><strong>${val.stationed} + ${val.transit} in transit = ${total}</strong>`;
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

  for (const fleet of nonExplore.slice(0, 6)) {
    const target = state.planets.find((p) => p.id === fleet.targetPlanetId);
    const targetName = target?.planetName ?? `Planet ${fleet.targetPlanetId}`;

    // Find nearest portal
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
