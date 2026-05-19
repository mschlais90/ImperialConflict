import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import type { BuildingKey, Empire, Planet, PlanetUnitKey, ResourceKey, ScienceKey } from '../models/types';
import type { GameState } from '../galaxy/galaxyData';
import { calcSciencePercent, getPlanetsForEmpire } from './selectors';

const DECAY_RESOURCES: ResourceKey[] = ['food', 'iron', 'endurium', 'octarine'];
const PLANET_UNIT_KEYS: PlanetUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport', 'explorer', 'agent', 'wizard'];
const SCIENCE_KEYS: ScienceKey[] = ['military', 'welfare', 'economy', 'construction', 'resources'];

export interface IncomeBreakdown {
  base: number;
  populationBonus: number;
  cashFactoryBonus: number;
  taxMultiplier: number;
  economyMultiplier: number;
  total: number;
}

export interface ProductionDetail {
  planetName: string;
  buildingType: string;
  buildingCount: number;
  bonus: number;
  amount: number;
}

export interface ResourceProduction {
  total: number;
  details: ProductionDetail[];
}

export interface EconomyBreakdown {
  income: IncomeBreakdown;
  production: Record<ResourceKey, ResourceProduction>;
  foodConsumption: { populationCost: number; unitCost: number; total: number };
  decay: Partial<Record<ResourceKey, number>>;
  upkeep: { buildings: number; units: number; total: number };
  populationGrowth: { growthRate: number; welfareMultiplier: number };
  research: { rpPerTick: number; allocation: Record<ScienceKey, number>; sciencePercents: Record<ScienceKey, number> };
}

export function calcEconomyBreakdown(state: GameState, empireId: number): EconomyBreakdown {
  const empire = state.empires.find((e) => e.id === empireId);
  if (!empire) {
    throw new Error(`Empire ${empireId} not found.`);
  }

  const planets = getPlanetsForEmpire(state, empireId);
  const resourceMultiplier = 1 + calcSciencePercent(state, empire, 'resources') / 100;
  const foodReduction = Math.min(
    empire.debuffs
      .filter((d) => d.type === 'reduced_food')
      .reduce((sum, d) => sum + d.value, 0),
    0.5,
  );

  // Production
  const production: Record<ResourceKey, ResourceProduction> = {
    gc: { total: 0, details: [] },
    food: { total: 0, details: [] },
    iron: { total: 0, details: [] },
    endurium: { total: 0, details: [] },
    octarine: { total: 0, details: [] },
  };

  for (const planet of planets) {
    for (const buildingType of Object.keys(planet.buildings) as BuildingKey[]) {
      const count = planet.buildings[buildingType] ?? 0;
      if (count <= 0) continue;

      const buildingProduction = BUILDINGS[buildingType].production as Partial<Record<ResourceKey | 'rp', number>>;
      for (const resource of Object.keys(buildingProduction) as Array<ResourceKey | 'rp'>) {
        if (resource === 'rp') continue;

        const baseAmount = (buildingProduction[resource] ?? 0) * count;
        const bonus = planet.resourceBonuses[resource] ?? 1;
        let amount = Math.trunc(baseAmount * bonus * resourceMultiplier);
        if (resource === 'food' && foodReduction > 0) {
          amount = Math.trunc(amount * (1 - foodReduction));
        }

        production[resource].total += amount;
        production[resource].details.push({
          planetName: planet.planetName,
          buildingType: BUILDINGS[buildingType].name,
          buildingCount: count,
          bonus,
          amount,
        });
      }
    }
  }

  // Income
  const income = calcIncomeBreakdown(state, empire, planets);

  // Food consumption
  const foodConsumption = calcFoodConsumption(planets);

  // Decay
  const decay: Partial<Record<ResourceKey, number>> = {};
  for (const resource of DECAY_RESOURCES) {
    decay[resource] = Math.trunc(empire.resources[resource] * 0.005);
  }

  // Upkeep
  let buildingUpkeep = 0;
  let unitUpkeep = 0;
  for (const planet of planets) {
    buildingUpkeep += Object.values(planet.buildings).reduce((sum, c) => sum + (c ?? 0), 0);
    unitUpkeep += PLANET_UNIT_KEYS.reduce((sum, u) => sum + (planet.units[u] ?? 0), 0);
  }

  // Population growth
  const welfareMultiplier = 1 + calcSciencePercent(state, empire, 'welfare') / 100;

  // Research
  const researchCenters = planets.reduce((sum, p) => sum + (p.buildings.research_center ?? 0), 0);
  const rpPerTick = researchCenters * 20;
  const sciencePercents = {} as Record<ScienceKey, number>;
  for (const science of SCIENCE_KEYS) {
    sciencePercents[science] = calcSciencePercent(state, empire, science);
  }

  return {
    income,
    production,
    foodConsumption,
    decay,
    upkeep: { buildings: buildingUpkeep, units: unitUpkeep, total: buildingUpkeep + unitUpkeep },
    populationGrowth: { growthRate: 5, welfareMultiplier },
    research: { rpPerTick, allocation: { ...empire.researchAllocation }, sciencePercents },
  };
}

function calcIncomeBreakdown(state: GameState, empire: Empire, planets: Planet[]): IncomeBreakdown {
  let totalPopulation = 0;
  let totalCashFactories = 0;
  let totalTaxOffices = 0;
  let totalBuildings = 0;

  for (const planet of planets) {
    totalPopulation += planet.population;
    totalCashFactories += planet.buildings.cash_factory ?? 0;
    totalTaxOffices += planet.buildings.tax_office ?? 0;
    totalBuildings += Object.values(planet.buildings).reduce((sum, c) => sum + (c ?? 0), 0);
  }

  const base = 100;
  const populationBonus = Math.trunc(totalPopulation / 30);
  const cashFactoryBonus = totalCashFactories * 8;
  const taxMultiplier = 1 + (2 * totalTaxOffices) / (totalBuildings + 1);
  const economyMultiplier = 1 + calcSciencePercent(state, empire, 'economy') / 100;
  const total = Math.trunc((base + populationBonus + cashFactoryBonus) * taxMultiplier * economyMultiplier);

  return { base, populationBonus, cashFactoryBonus, taxMultiplier, economyMultiplier, total };
}

function calcFoodConsumption(planets: Planet[]): { populationCost: number; unitCost: number; total: number } {
  let populationCost = 0;
  let unitCost = 0;
  for (const planet of planets) {
    populationCost += Math.trunc(planet.population / 10);
    for (const unit of PLANET_UNIT_KEYS) {
      if (UNITS[unit].consumesFood) {
        unitCost += planet.units[unit] ?? 0;
      }
    }
  }
  return { populationCost, unitCost, total: populationCost + unitCost };
}
