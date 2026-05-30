import { getPlanetsForEmpire, calcTravelTicks } from '../core/selectors/selectors';
import type { Planet } from '../core/models/types';
import { button } from './dom';
import type { UiContext } from './types';

export function renderExplorationPanel(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Exploration panel requires game state.');
  }

  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Exploration';
  panel.append(title);

  const playerPlanets = getPlanetsForEmpire(state, context.player.id);

  // Explorer counts
  const idleExplorers = playerPlanets.reduce((sum, p) => sum + (p.units.explorer ?? 0), 0);
  const buildingExplorers = playerPlanets.reduce(
    (sum, p) => sum + p.buildQueue.filter((o) => o.category === 'unit' && o.itemType === 'explorer').length,
    0,
  );

  const explorerFleets = state.fleets.filter((f) => f.isExploration && f.ownerId === context.player.id);
  const enRouteTargets = new Set(explorerFleets.map((f) => f.targetPlanetId));

  const header = document.createElement('div');
  header.className = 'exploration-header';
  header.innerHTML = `<span>Explorers available: <strong>${idleExplorers}</strong></span>`
    + `<span>Building: <strong>${buildingExplorers}</strong></span>`
    + `<span>En route: <strong>${explorerFleets.length}</strong></span>`;
  panel.append(header);

  // Find unexplored planets
  const unexplored = state.planets.filter((p) => p.ownerId < 0);

  if (unexplored.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-text';
    empty.textContent = 'All planets have been explored.';
    panel.append(empty);
    return panel;
  }

  // Find best explorer source for travel tick calculation
  const portalPlanets = playerPlanets.filter((p) => p.hasPortal);
  const portalExplorerCount = portalPlanets.reduce((sum, p) => sum + (p.units.explorer ?? 0), 0);

  function bestTravelTicks(target: Planet): { ticks: number; source: Planet | null } {
    let bestPortal: Planet | null = null;
    let bestPortalTicks = Infinity;
    if (portalExplorerCount > 0) {
      for (const p of portalPlanets) {
        const t = calcTravelTicks(state!, p.systemId, target.systemId);
        if (t < bestPortalTicks) {
          bestPortalTicks = t;
          bestPortal = p;
        }
      }
    }

    let bestDirect: Planet | null = null;
    let bestDirectTicks = Infinity;
    for (const p of playerPlanets) {
      if (p.hasPortal) continue;
      if ((p.units.explorer ?? 0) <= 0) continue;
      const t = calcTravelTicks(state!, p.systemId, target.systemId);
      if (t < bestDirectTicks) {
        bestDirectTicks = t;
        bestDirect = p;
      }
    }

    const usePortal = bestPortal && (!bestDirect || bestPortalTicks <= bestDirectTicks);
    return {
      ticks: usePortal ? bestPortalTicks : bestDirect ? bestDirectTicks : Infinity,
      source: usePortal ? bestPortal : bestDirect,
    };
  }

  // Build list with travel info
  const entries = unexplored.map((planet) => {
    const travel = bestTravelTicks(planet);
    const enRouteFleet = explorerFleets.find((f) => f.targetPlanetId === planet.id);
    return { planet, ticks: travel.ticks, source: travel.source, enRouteFleet };
  });

  // Sort by ticks (ascending), then by size (descending)
  entries.sort((a, b) => a.ticks - b.ticks || b.planet.size - a.planet.size);

  // Table header
  const tableHeader = document.createElement('div');
  tableHeader.className = 'exploration-row exploration-row-header';
  tableHeader.innerHTML = '<span>Planet</span><span>Size</span><span>Ticks</span><span></span>';
  panel.append(tableHeader);

  // Planet rows
  const list = document.createElement('div');
  list.className = 'exploration-list';

  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'exploration-row';

    const name = document.createElement('span');
    name.textContent = entry.planet.planetName;

    const size = document.createElement('span');
    size.textContent = String(entry.planet.size);

    const ticks = document.createElement('span');
    ticks.textContent = entry.ticks === Infinity ? '—' : String(entry.ticks);

    const action = document.createElement('span');

    if (enRouteTargets.has(entry.planet.id)) {
      const enRouteBtn = button(`En route (${entry.enRouteFleet!.ticksRemaining}t)`, () => {}, 'ui-button exploration-btn');
      enRouteBtn.disabled = true;
      enRouteBtn.title = 'An explorer is already travelling to this planet';
      action.append(enRouteBtn);
    } else if (!entry.source || idleExplorers <= 0) {
      const noBtn = button('Explore', () => {}, 'ui-button exploration-btn');
      noBtn.disabled = true;
      noBtn.title = 'No explorers available';
      action.append(noBtn);
    } else {
      const source = entry.source;
      const exploreBtn = button('Explore', () => {
        context.runCommand(() =>
          context.commands.sendExplorer({
            empireId: context.player.id,
            sourcePlanetId: source.id,
            targetPlanetId: entry.planet.id,
          }),
        );
      }, 'ui-button exploration-btn');
      action.append(exploreBtn);
    }

    row.append(name, size, ticks, action);
    list.append(row);
  }

  panel.append(list);
  return panel;
}
