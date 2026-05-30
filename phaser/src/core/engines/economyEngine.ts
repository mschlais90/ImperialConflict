import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { processAiTurn } from '../ai/aiController';
import { resolveBattle } from './combatEngine';
import { appendEvent } from '../events/eventLog';
import type {
  BuildingKey,
  CombatUnitKey,
  Empire,
  Fleet,
  Planet,
  PlanetUnitKey,
  ResourceKey,
  ScienceKey,
  UnitKey,
} from '../models/types';
import type { GameState } from '../galaxy/galaxyData';
import { calcEmpireNetworth, getPlanet, getPlanetsForEmpire } from '../selectors/selectors';

const DECAY_RESOURCES: ResourceKey[] = ['food', 'iron', 'endurium', 'octarine'];
const PLANET_UNIT_KEYS: PlanetUnitKey[] = [
  'fighter',
  'bomber',
  'soldier',
  'droid',
  'transport',
  'explorer',
  'agent',
  'wizard',
];
const COMBAT_UNIT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];
const SCIENCE_KEYS: ScienceKey[] = ['military', 'welfare', 'economy', 'construction', 'resources'];

export function processEconomyTick(state: GameState): void {
  advanceFleets(state);

  for (const empire of state.empires) {
    processEmpireTick(state, empire);
  }

  for (const empire of state.empires) {
    if (empire.controllerType === 'ai') {
      processAiTurn(state, empire.id, state.currentTick);
    }
  }

  checkEliminations(state);
}

function advanceFleets(state: GameState): void {
  const arrived: Fleet[] = [];
  for (const fleet of state.fleets) {
    fleet.ticksRemaining -= 1;
    if (fleet.ticksRemaining <= 0) {
      fleet.ticksRemaining = 0;
      arrived.push(fleet);
    }
  }

  for (const fleet of arrived) {
    handleFleetArrival(state, fleet);
  }
}

function handleFleetArrival(state: GameState, fleet: Fleet): void {
  const targetPlanet = getPlanet(state, fleet.targetPlanetId);
  if (targetPlanet === undefined) {
    removeFleet(state, fleet.id);
    return;
  }

  if (fleet.isExploration) {
    if (targetPlanet.ownerId < 0) {
      colonizePlanet(state, targetPlanet, fleet.ownerId);
    }
    removeFleet(state, fleet.id);
    return;
  }

  if (targetPlanet.ownerId === fleet.ownerId) {
    mergeFleetIntoPlanet(targetPlanet, fleet);
    removeFleet(state, fleet.id);
    appendEvent(state, {
      type: 'fleet_arrived',
      tick: state.currentTick,
      fleetId: fleet.id,
      targetPlanetId: targetPlanet.id,
    });
    return;
  }

  if (targetPlanet.ownerId < 0) {
    targetPlanet.ownerId = fleet.ownerId;
    targetPlanet.population = targetPlanet.size;
    mergeFleetIntoPlanet(targetPlanet, fleet);
    removeFleet(state, fleet.id);
    appendEvent(state, {
      type: 'fleet_arrived',
      tick: state.currentTick,
      fleetId: fleet.id,
      targetPlanetId: targetPlanet.id,
    });
    return;
  }

  resolveBattle(state, fleet, targetPlanet);
}

function colonizePlanet(state: GameState, planet: Planet, empireId: number): void {
  planet.ownerId = empireId;
  planet.population = planet.size;
  appendEvent(state, { type: 'planet_colonized', tick: state.currentTick, planetId: planet.id, empireId });
  appendEvent(state, {
    type: 'notification',
    tick: state.currentTick,
    message: `Colonized ${planet.planetName}!`,
    category: 'explore',
  });
}

function mergeFleetIntoPlanet(planet: Planet, fleet: Fleet): void {
  for (const unit of COMBAT_UNIT_KEYS) {
    const count = fleet.units[unit] ?? 0;
    if (count > 0) {
      planet.units[unit] = (planet.units[unit] ?? 0) + count;
    }
  }
}

function removeFleet(state: GameState, fleetId: number): void {
  state.fleets = state.fleets.filter((fleet) => fleet.id !== fleetId);
}

function processEmpireTick(state: GameState, empire: Empire): void {
  const empirePlanets = getPlanetsForEmpire(state, empire.id);
  if (empirePlanets.length === 0) {
    tickDebuffs(state, empire);
    return;
  }

  advanceBuildQueues(state, empirePlanets);
  calculateProduction(state, empire, empirePlanets);
  applyResourceDecay(empire);

  const foodConsumed = calculateFoodConsumption(empirePlanets);
  empire.resources.food -= foodConsumed;
  const isStarving = empire.resources.food < 0;
  if (isStarving) {
    empire.resources.food = 0;
  }

  let income = calculateIncome(state, empire, empirePlanets);
  if (isStarving) {
    income = Math.trunc(income / 2);
  }
  empire.resources.gc += income;

  if (isStarving) {
    starvePopulation(state, empire, empirePlanets);
  } else {
    growPopulation(state, empire, empirePlanets);
  }

  empire.resources.gc = Math.max(empire.resources.gc - calculateUpkeep(empirePlanets), 0);
  generateResearch(empire, empirePlanets);
  tickDebuffs(state, empire);
}

function advanceBuildQueues(state: GameState, empirePlanets: Planet[]): void {
  for (const planet of empirePlanets) {
    const completedIndexes: number[] = [];
    for (let i = 0; i < planet.buildQueue.length; i += 1) {
      const order = planet.buildQueue[i];
      order.ticksRemaining -= 1;
      if (order.ticksRemaining <= 0) {
        completedIndexes.push(i);
      }
    }

    for (let i = completedIndexes.length - 1; i >= 0; i -= 1) {
      const order = planet.buildQueue[completedIndexes[i]];
      completeBuildOrder(state, planet, order.itemType, order.category);
      planet.buildQueue.splice(completedIndexes[i], 1);
    }
  }
}

function completeBuildOrder(
  state: GameState,
  planet: Planet,
  itemType: BuildingKey | UnitKey,
  category: 'building' | 'unit',
): void {
  if (category === 'building') {
    const buildingType = itemType as BuildingKey;
    planet.buildings[buildingType] = (planet.buildings[buildingType] ?? 0) + 1;
    if (buildingType === 'portal') {
      planet.hasPortal = true;
    }
    appendEvent(state, { type: 'building_completed', tick: state.currentTick, planetId: planet.id, buildingType });
    return;
  }

  const unitType = itemType as UnitKey;
  if (isPlanetUnit(unitType)) {
    planet.units[unitType] = (planet.units[unitType] ?? 0) + 1;
  }
  appendEvent(state, { type: 'unit_completed', tick: state.currentTick, planetId: planet.id, unitType });
}

function calculateProduction(state: GameState, empire: Empire, empirePlanets: Planet[]): void {
  const resourceMultiplier = 1 + getSciencePercent(state, empire, 'resources') / 100;
  const foodReduction = Math.min(
    empire.debuffs
      .filter((debuff) => debuff.type === 'reduced_food')
      .reduce((total, debuff) => total + debuff.value, 0),
    0.5,
  );

  for (const planet of empirePlanets) {
    for (const buildingType of Object.keys(planet.buildings) as BuildingKey[]) {
      const count = planet.buildings[buildingType] ?? 0;
      if (count <= 0) {
        continue;
      }

      const production = BUILDINGS[buildingType].production as Partial<Record<ResourceKey | 'rp', number>>;
      for (const resource of Object.keys(production) as Array<ResourceKey | 'rp'>) {
        if (resource === 'rp') {
          continue;
        }

        const baseAmount = (production[resource] ?? 0) * count;
        const bonus = planet.resourceBonuses[resource] ?? 1;
        let amount = Math.trunc(baseAmount * bonus * resourceMultiplier);
        if (resource === 'food' && foodReduction > 0) {
          amount = Math.trunc(amount * (1 - foodReduction));
        }
        empire.resources[resource] += amount;
      }
    }
  }
}

function applyResourceDecay(empire: Empire): void {
  for (const resource of DECAY_RESOURCES) {
    const decay = Math.trunc(empire.resources[resource] * 0.005);
    empire.resources[resource] -= decay;
  }
}

function calculateIncome(state: GameState, empire: Empire, empirePlanets: Planet[]): number {
  let totalPopulation = 0;
  let totalCashFactories = 0;
  let totalTaxOffices = 0;
  let totalBuildings = 0;

  for (const planet of empirePlanets) {
    totalPopulation += planet.population;
    totalCashFactories += planet.buildings.cash_factory ?? 0;
    totalTaxOffices += planet.buildings.tax_office ?? 0;
    totalBuildings += getTotalBuildings(planet);
  }

  const base = 100 + Math.trunc(totalPopulation / 30) + totalCashFactories * 8;
  const taxBonus = 1 + (2 * totalTaxOffices) / (totalBuildings + 1);
  const economyMultiplier = 1 + getSciencePercent(state, empire, 'economy') / 100;
  return Math.trunc(base * taxBonus * economyMultiplier);
}

function calculateFoodConsumption(empirePlanets: Planet[]): number {
  let total = 0;
  for (const planet of empirePlanets) {
    total += Math.trunc(planet.population / 10);
    for (const unit of PLANET_UNIT_KEYS) {
      if (UNITS[unit].consumesFood) {
        total += planet.units[unit] ?? 0;
      }
    }
  }
  return total;
}

function starvePopulation(state: GameState, empire: Empire, empirePlanets: Planet[]): void {
  let totalDeaths = 0;
  for (const planet of empirePlanets) {
    if (planet.population <= 0) {
      continue;
    }

    const deaths = Math.max(Math.trunc(planet.population * 0.1), 1);
    planet.population = Math.max(planet.population - deaths, 0);
    totalDeaths += deaths;
  }

  if (empire.controllerType === 'human' && totalDeaths > 0) {
    appendEvent(state, {
      type: 'notification',
      tick: state.currentTick,
      message: `Starvation! ${totalDeaths} population died. Income halved.`,
      category: 'warning',
    });
  }
}

function growPopulation(state: GameState, empire: Empire, empirePlanets: Planet[]): void {
  const welfareMultiplier = 1 + getSciencePercent(state, empire, 'welfare') / 100;
  for (const planet of empirePlanets) {
    if (planet.population <= 0) {
      if (empire.resources.food > 0) {
        planet.population = 100;
      } else {
        continue;
      }
    }

    const maxPopulation = Math.trunc(getMaxPopulation(planet) * welfareMultiplier);
    const popGrowthBonus = planet.resourceBonuses['population_growth'] ?? 1;
    const growth = Math.trunc(planet.population * 0.05 * popGrowthBonus);
    planet.population = Math.min(planet.population + growth, maxPopulation);
  }
}

function calculateUpkeep(empirePlanets: Planet[]): number {
  let total = 0;
  for (const planet of empirePlanets) {
    total += getTotalBuildings(planet);
    total += getTotalUnits(planet);
  }
  return total;
}

function generateResearch(empire: Empire, empirePlanets: Planet[]): void {
  let totalRp = 0;
  for (const planet of empirePlanets) {
    const researchCenters = planet.buildings.research_center ?? 0;
    if (researchCenters > 0) {
      const researchBonus = planet.resourceBonuses['research'] ?? 1;
      totalRp += Math.trunc(researchCenters * 20 * researchBonus);
    }
  }

  if (totalRp <= 0) {
    return;
  }

  for (const science of SCIENCE_KEYS) {
    const allocation = empire.researchAllocation[science];
    const rp = Math.trunc((totalRp * allocation) / 100);
    empire.researchPoints[science] += rp;
  }
}

function tickDebuffs(state: GameState, empire: Empire): void {
  const remainingDebuffs: Empire['debuffs'] = [];
  for (const debuff of empire.debuffs) {
    debuff.ticksRemaining -= 1;
    if (debuff.ticksRemaining > 0) {
      remainingDebuffs.push(debuff);
      continue;
    }

    if (debuff.type === 'portal_disabled' && debuff.planetId !== undefined) {
      const planet = getPlanet(state, debuff.planetId);
      if (planet !== undefined && (planet.buildings.portal ?? 0) > 0) {
        planet.hasPortal = true;
      }
    }
  }
  empire.debuffs = remainingDebuffs;
}

function checkEliminations(state: GameState): void {
  if (state.currentState === 'game_over') {
    return;
  }

  for (const empire of state.empires) {
    const alreadyEliminated = state.events.some(
      (event) => event.type === 'empire_eliminated' && event.empireId === empire.id,
    );
    if (alreadyEliminated) {
      continue;
    }

    const planetCount = getPlanetsForEmpire(state, empire.id).length;
    if (planetCount === 0) {
      state.fleets = state.fleets.filter((fleet) => fleet.ownerId !== empire.id);
      appendEvent(state, { type: 'empire_eliminated', tick: state.currentTick, empireId: empire.id });
    }
  }

  const humanEmpires = state.empires.filter((empire) => empire.controllerType === 'human');
  const nonHumanEmpires = state.empires.filter((empire) => empire.controllerType !== 'human');

  if (humanEmpires.length > 0 && humanEmpires.every((empire) => isEmpireEliminated(state, empire.id))) {
    finishGame(state, false);
    return;
  }

  if (nonHumanEmpires.length > 0 && nonHumanEmpires.every((empire) => isEmpireEliminated(state, empire.id))) {
    finishGame(state, true);
  }
}

function finishGame(state: GameState, playerWon: boolean): void {
  state.currentState = 'game_over';
  state.currentSpeed = 0;
  appendEvent(state, { type: 'game_over', tick: state.currentTick, playerWon });
}

function isEmpireEliminated(state: GameState, empireId: number): boolean {
  return state.events.some((event) => event.type === 'empire_eliminated' && event.empireId === empireId);
}

function getSciencePercent(state: GameState, empire: Empire, science: ScienceKey): number {
  const networth = Math.max(calcEmpireNetworth(state, empire.id), 1);
  return 100 * (1 - Math.exp(-empire.researchPoints[science] / (100 * networth)));
}

function getTotalBuildings(planet: Planet): number {
  return Object.values(planet.buildings).reduce((total, count) => total + (count ?? 0), 0);
}

function getMaxPopulation(planet: Planet): number {
  return 40 * planet.size + 650 * (planet.buildings.living_quarter ?? 0);
}

function getTotalUnits(planet: Planet): number {
  return PLANET_UNIT_KEYS.reduce((total, unit) => total + (planet.units[unit] ?? 0), 0);
}

function isPlanetUnit(unit: UnitKey): unit is PlanetUnitKey {
  return PLANET_UNIT_KEYS.includes(unit as PlanetUnitKey);
}
