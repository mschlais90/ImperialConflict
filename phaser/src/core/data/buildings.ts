import type { BuildingKey, Planet, ResourceKey } from '../models/types';

export interface BuildingDefinition {
  name: string;
  cost: Partial<Record<ResourceKey, number>>;
  buildTicks: number;
  production: Partial<Record<ResourceKey | 'rp', number>>;
  description: string;
}

export const BUILDINGS = {
  mine: {
    name: 'Mining Facility',
    cost: { gc: 200, food: 5, endurium: 1 },
    buildTicks: 12,
    production: { iron: 1 },
    description: 'Produces 1 iron per tick.',
  },
  refinery: {
    name: 'Refinement Station',
    cost: { gc: 300, iron: 20 },
    buildTicks: 12,
    production: { endurium: 1 },
    description: 'Produces 1 endurium per tick.',
  },
  occult_center: {
    name: 'Occult Center',
    cost: { gc: 400, iron: 15, endurium: 4 },
    buildTicks: 12,
    production: { octarine: 1 },
    description: 'Produces 1 octarine per tick.',
  },
  farm: {
    name: 'Hydroponic Farm',
    cost: { gc: 160, iron: 3, endurium: 1 },
    buildTicks: 10,
    production: { food: 100 },
    description: 'Produces 100 food per tick.',
  },
  research_center: {
    name: 'Research Center',
    cost: { gc: 100, endurium: 1 },
    buildTicks: 14,
    production: { rp: 20 },
    description: 'Generates 20 research points per tick.',
  },
  cash_factory: {
    name: 'Cash Factory',
    cost: { gc: 120, iron: 10, endurium: 1 },
    buildTicks: 5,
    production: {},
    description: 'Adds 8 GC to base income per tick.',
  },
  tax_office: {
    name: 'Tax Office',
    cost: { gc: 200, iron: 15, endurium: 1 },
    buildTicks: 14,
    production: {},
    description: 'Increases income by 2% per 1% of total buildings.',
  },
  living_quarter: {
    name: 'Living Quarter',
    cost: { gc: 200, iron: 25, endurium: 1 },
    buildTicks: 8,
    production: {},
    description: 'Increases max population by 650.',
  },
  laser: {
    name: 'Laser Turret',
    cost: { gc: 700, iron: 35, endurium: 1 },
    buildTicks: 8,
    production: {},
    description: 'Defense: 10% chance to destroy each attacking bomber, kills 10 units if surviving.',
  },
  portal: {
    name: 'Portal',
    cost: { gc: 2000, iron: 100, endurium: 20, octarine: 10 },
    buildTicks: 40,
    production: {},
    description: 'Enables instant troop transport between portalled planets.',
  },
} as const satisfies Record<BuildingKey, BuildingDefinition>;

export function getBuildCost(
  type: BuildingKey,
  constructionSciencePct = 0,
  planet: Planet | null = null,
): Partial<Record<ResourceKey, number>> {
  const baseCost: Partial<Record<ResourceKey, number>> = BUILDINGS[type].cost;
  const discount = 1 / (1 + constructionSciencePct / 100);
  const overbuild = getOverbuildMultiplier(planet);
  const result: Partial<Record<ResourceKey, number>> = {};

  for (const resource of Object.keys(baseCost) as ResourceKey[]) {
    const base = baseCost[resource] ?? 0;
    result[resource] = Math.max(
      Math.trunc(base * discount * overbuild),
      Math.trunc(base * 0.5),
    );
  }

  return result;
}

export function getBuildTicks(type: BuildingKey, constructionSciencePct = 0): number {
  const baseTicks = BUILDINGS[type].buildTicks;
  const discount = 1 / (1 + constructionSciencePct / 100);
  return Math.max(Math.trunc(baseTicks * discount), 1);
}

export function calcMaxBuildable(
  resources: Record<ResourceKey, number>,
  type: BuildingKey,
  constructionSciencePct = 0,
  planet: Planet | null = null,
): number {
  const baseCosts = BUILDINGS[type].cost as Partial<Record<ResourceKey, number>>;
  const discount = 1 / (1 + constructionSciencePct / 100);
  const currentTotal = planet
    ? Object.values(planet.buildings).reduce((sum, n) => sum + (n ?? 0), 0)
      + planet.buildQueue.filter((o) => o.category === 'building').length
    : 0;

  const available: Record<ResourceKey, number> = { ...resources };
  let count = 0;

  for (let i = 0; i < 9999; i++) {
    const simTotal = currentTotal + i;
    const overbuild = planet && simTotal > planet.size ? simTotal / planet.size : 1;

    let canAfford = true;
    const roundCost: Partial<Record<ResourceKey, number>> = {};
    for (const res of Object.keys(baseCosts) as ResourceKey[]) {
      const baseAmount = baseCosts[res] ?? 0;
      if (!baseAmount) continue;
      const cost = Math.max(Math.trunc(baseAmount * discount * overbuild), Math.trunc(baseAmount * 0.5));
      roundCost[res] = cost;
      if (cost > (available[res] ?? 0)) {
        canAfford = false;
        break;
      }
    }

    if (!canAfford) break;
    for (const res of Object.keys(roundCost) as ResourceKey[]) {
      available[res] = (available[res] ?? 0) - (roundCost[res] ?? 0);
    }
    count++;
  }

  return count;
}

export function getOverbuildMultiplier(planet: Planet | null): number {
  if (planet === null) {
    return 1;
  }

  const builtCount = Object.values(planet.buildings).reduce((total, count) => total + (count ?? 0), 0);
  const queuedBuildingCount = planet.buildQueue.filter((order) => order.category === 'building').length;
  const totalBuildings = builtCount + queuedBuildingCount;

  if (totalBuildings <= planet.size) {
    return 1;
  }

  return totalBuildings / planet.size;
}
