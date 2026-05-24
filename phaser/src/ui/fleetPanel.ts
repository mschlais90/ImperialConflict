import { UNITS } from '../core/data/units';
import type { CombatUnitKey, Fleet, Planet } from '../core/models/types';
import { calcTravelTicks, getPlanet, getPlanetsForEmpire, getSystem } from '../core/selectors/selectors';
import { button, formatNumber } from './dom';
import { fleetForm } from './planetPanel';
import type { UiContext } from './types';

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

  // Fleet summary totals
  panel.append(subtitle('Fleet Summary'), fleetSummary(ownedPlanets, active));

  // Stationed units by planet, grouped by system
  panel.append(subtitle('Stationed Units'), stationedByPlanet(context, ownedPlanets));

  // Active fleets with recall
  panel.append(subtitle('Fleets in Transit'), active.length > 0 ? fleetList(active, state) : emptyText('No fleets in transit.'));

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

  const COMBAT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];
  const planetsWithUnits = planets.filter((p) =>
    COMBAT_KEYS.some((k) => (p.units[k] ?? 0) > 0),
  );

  if (planetsWithUnits.length === 0) {
    return emptyText('No stationed combat units.');
  }

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
      wrapper.append(row);
    }
  }

  return wrapper;
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
  const selectedTarget = state.selectedPlanetId === null ? undefined : getPlanet(state, state.selectedPlanetId);
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

function fleetSummary(planets: Planet[], fleets: Fleet[]): HTMLElement {
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

  for (const fleet of nonExplore.slice(0, 6)) {
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
