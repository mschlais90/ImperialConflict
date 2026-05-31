import { getPlanetsForEmpire, calcTravelTicks } from '../core/selectors/selectors';
import type { Planet, ResourceKey } from '../core/models/types';
import { UNITS } from '../core/data/units';
import { button, formatNumber } from './dom';
import type { UiContext } from './types';

// Persists sort state across re-renders
let persistedSortField: 'ticks' | 'size' | 'bonus' = 'ticks';
let persistedSortAsc = true;

function getBonusInfo(planet: Planet): { resource: string; pct: number } | null {
  const entries = Object.entries(planet.resourceBonuses) as Array<[ResourceKey, number]>;
  const bonused = entries.filter(([, mult]) => mult > 1);
  if (bonused.length === 0) return null;
  bonused.sort((a, b) => b[1] - a[1]); // highest bonus first
  const [res, mult] = bonused[0];
  return { resource: res.charAt(0).toUpperCase() + res.slice(1), pct: Math.round((mult - 1) * 100) };
}

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
  const empire = state.empires.find((e) => e.id === context.player.id)!;

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

  // Build Explorer button
  const explorerCost = UNITS.explorer.cost.gc;
  const canAfford = empire.resources.gc >= explorerCost;
  const portalPlanets = playerPlanets.filter((p) => p.hasPortal);
  const buildPlanetId = portalPlanets.length > 0 ? portalPlanets[0].id : empire.homePlanetId;
  const buildPlanet = state.planets.find((p) => p.id === buildPlanetId);
  const buildLabel = `Build Explorer (${formatNumber(explorerCost)} GC)`;

  const buildBtn = button(buildLabel, () => {
    context.runCommand(() =>
      context.commands.queueExplorer({
        empireId: context.player.id,
        planetId: buildPlanetId,
        count: 1,
      }),
    );
  }, canAfford ? 'ui-button primary exploration-build-btn' : 'ui-button exploration-build-btn');
  buildBtn.disabled = !canAfford;
  if (!canAfford) {
    buildBtn.title = 'Insufficient GC';
  } else if (buildPlanet) {
    buildBtn.title = `Will build on ${buildPlanet.planetName}`;
  }

  const buildRow = document.createElement('div');
  buildRow.className = 'exploration-build-row';
  buildRow.append(buildBtn);
  panel.append(buildRow);

  // Find unexplored planets
  const unexplored = state.planets.filter((p) => p.ownerId < 0);

  if (unexplored.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-text';
    empty.textContent = 'All planets have been explored.';
    panel.append(empty);
    return panel;
  }

  // Find best source planet for travel tick calculation.
  // Always show ticks based on nearest owned planet (portal planets first, then any).
  // The source is picked by who has an idle explorer; if nobody does, still show
  // distance from the closest owned planet so the player can plan ahead.
  function bestTravelTicks(target: Planet): { ticks: number; source: Planet | null } {
    let bestPortal: Planet | null = null;
    let bestPortalTicks = Infinity;
    for (const p of portalPlanets) {
      const t = calcTravelTicks(state!, p.systemId, target.systemId);
      if (t < bestPortalTicks) {
        bestPortalTicks = t;
        bestPortal = p;
      }
    }

    let bestDirect: Planet | null = null;
    let bestDirectTicks = Infinity;
    for (const p of playerPlanets) {
      if (p.hasPortal) continue;
      const t = calcTravelTicks(state!, p.systemId, target.systemId);
      if (t < bestDirectTicks) {
        bestDirectTicks = t;
        bestDirect = p;
      }
    }

    // Prefer portal route if it's equal or shorter
    const usePortal = bestPortal && (!bestDirect || bestPortalTicks <= bestDirectTicks);
    const ticks = usePortal ? bestPortalTicks : bestDirect ? bestDirectTicks : Infinity;

    // For the actual source (who donates the explorer), prefer planets with idle explorers
    let source: Planet | null = null;
    if (usePortal && portalPlanets.some((p) => (p.units.explorer ?? 0) > 0)) {
      source = bestPortal;
    } else {
      const directWithExplorer = playerPlanets
        .filter((p) => !p.hasPortal && (p.units.explorer ?? 0) > 0)
        .sort((a, b) => calcTravelTicks(state!, a.systemId, target.systemId) - calcTravelTicks(state!, b.systemId, target.systemId));
      if (directWithExplorer.length > 0) {
        source = directWithExplorer[0];
      } else if (portalPlanets.some((p) => (p.units.explorer ?? 0) > 0)) {
        source = portalPlanets.find((p) => (p.units.explorer ?? 0) > 0)!;
      }
    }

    return { ticks, source };
  }

  // Build list with travel info and bonus
  const entries = unexplored.map((planet) => {
    const travel = bestTravelTicks(planet);
    const enRouteFleet = explorerFleets.find((f) => f.targetPlanetId === planet.id);
    const bonus = getBonusInfo(planet);
    return { planet, ticks: travel.ticks, source: travel.source, enRouteFleet, bonus };
  });

  // Sort state (uses module-level persistence)
  let sortField = persistedSortField;
  let sortAsc = persistedSortAsc;

  function sortEntries(): void {
    persistedSortField = sortField;
    persistedSortAsc = sortAsc;
    if (sortField === 'ticks') {
      entries.sort((a, b) => {
        const cmp = (a.ticks === Infinity ? 99999 : a.ticks) - (b.ticks === Infinity ? 99999 : b.ticks);
        return sortAsc ? cmp || b.planet.size - a.planet.size : -cmp || a.planet.size - b.planet.size;
      });
    } else if (sortField === 'size') {
      entries.sort((a, b) => {
        const cmp = a.planet.size - b.planet.size;
        return sortAsc ? cmp : -cmp;
      });
    } else {
      // Bonus sort: alphabetical by resource name (asc/desc togglable), then % always descending
      entries.sort((a, b) => {
        const aRes = a.bonus?.resource ?? '';
        const bRes = b.bonus?.resource ?? '';
        // No-bonus planets always sort to the end
        if (!aRes && !bRes) return 0;
        if (!aRes) return 1;
        if (!bRes) return -1;
        const resCmp = aRes.localeCompare(bRes);
        if (resCmp !== 0) return sortAsc ? resCmp : -resCmp;
        // Same resource: always sort by % descending
        return (b.bonus?.pct ?? 0) - (a.bonus?.pct ?? 0);
      });
    }
  }

  sortEntries();

  // Table header
  const tableHeader = document.createElement('div');
  tableHeader.className = 'exploration-row exploration-row-header';

  const planetHeader = document.createElement('span');
  planetHeader.textContent = 'Planet';

  const sizeHeader = document.createElement('span');
  sizeHeader.className = 'exploration-sortable';
  sizeHeader.textContent = 'Size';
  sizeHeader.title = 'Click to sort by size';

  const bonusHeader = document.createElement('span');
  bonusHeader.className = 'exploration-sortable';
  bonusHeader.textContent = 'Bonus';
  bonusHeader.title = 'Click to sort by bonus';

  const ticksHeader = document.createElement('span');
  ticksHeader.className = 'exploration-sortable';
  ticksHeader.textContent = 'Ticks';
  ticksHeader.title = 'Click to sort by travel ticks';

  const actionHeader = document.createElement('span');

  tableHeader.append(planetHeader, sizeHeader, bonusHeader, ticksHeader, actionHeader);
  panel.append(tableHeader);

  // Planet rows
  const list = document.createElement('div');
  list.className = 'exploration-list';

  function updateSortHeaders(): void {
    const arrow = sortAsc ? ' ▲' : ' ▼';
    sizeHeader.textContent = sortField === 'size' ? `Size${arrow}` : 'Size';
    bonusHeader.textContent = sortField === 'bonus' ? `Bonus${arrow}` : 'Bonus';
    ticksHeader.textContent = sortField === 'ticks' ? `Ticks${arrow}` : 'Ticks';
  }

  updateSortHeaders();

  function renderRows(): void {
    list.innerHTML = '';
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'exploration-row';

      const name = document.createElement('span');
      name.textContent = entry.planet.planetName;

      const size = document.createElement('span');
      size.className = 'exploration-cell-center';
      size.textContent = String(entry.planet.size);

      const bonusCell = document.createElement('span');
      bonusCell.className = 'exploration-cell-center';
      if (entry.bonus) {
        bonusCell.textContent = `${entry.bonus.resource} +${entry.bonus.pct}%`;
        bonusCell.className += ' exploration-bonus';
      } else {
        bonusCell.textContent = '—';
      }

      const ticks = document.createElement('span');
      ticks.className = 'exploration-cell-center';
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

      row.append(name, size, bonusCell, ticks, action);
      list.append(row);
    }
  }

  sizeHeader.addEventListener('click', () => {
    if (sortField === 'size') {
      sortAsc = !sortAsc;
    } else {
      sortField = 'size';
      sortAsc = false; // default descending for size (biggest first)
    }
    sortEntries();
    updateSortHeaders();
    renderRows();
  });

  bonusHeader.addEventListener('click', () => {
    if (sortField === 'bonus') {
      sortAsc = !sortAsc;
    } else {
      sortField = 'bonus';
      sortAsc = true; // default ascending alphabetical (Endurium, Food, Iron, Octarine)
    }
    sortEntries();
    updateSortHeaders();
    renderRows();
  });

  ticksHeader.addEventListener('click', () => {
    if (sortField === 'ticks') {
      sortAsc = !sortAsc;
    } else {
      sortField = 'ticks';
      sortAsc = true; // default ascending for ticks (closest first)
    }
    sortEntries();
    updateSortHeaders();
    renderRows();
  });

  renderRows();

  panel.append(list);
  return panel;
}
