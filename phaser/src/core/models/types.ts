export type ResourceKey = 'gc' | 'food' | 'iron' | 'endurium' | 'octarine';
export type BonusKey = ResourceKey | 'research' | 'population_growth' | 'defense';
export type ScienceKey = 'military' | 'welfare' | 'economy' | 'construction' | 'resources';
export type UnitKey =
  | 'fighter'
  | 'bomber'
  | 'soldier'
  | 'droid'
  | 'transport'
  | 'explorer'
  | 'agent'
  | 'wizard';
export type CombatUnitKey = 'fighter' | 'bomber' | 'soldier' | 'droid' | 'transport';
export type PlanetUnitKey = UnitKey;
export type BuildingKey =
  | 'mine'
  | 'refinery'
  | 'occult_center'
  | 'farm'
  | 'research_center'
  | 'cash_factory'
  | 'tax_office'
  | 'living_quarter'
  | 'laser'
  | 'portal';

export type BuildCategory = 'building' | 'unit';

export type BuildOrder =
  | { category: 'building'; itemType: BuildingKey; ticksRemaining: number }
  | { category: 'unit'; itemType: UnitKey; ticksRemaining: number };

export type EmpireControllerType = 'human' | 'ai';

export interface Empire {
  id: number;
  empireName: string;
  controllerType: EmpireControllerType;
  color: string;
  homeSystemId: number;
  homePlanetId: number;
  resources: Record<ResourceKey, number>;
  researchPoints: Record<ScienceKey, number>;
  researchAllocation: Record<ScienceKey, number>;
  debuffs: Array<{ type: string; ticksRemaining: number; value: number; planetId?: number }>;
  isEliminated: boolean;
}

export interface Fleet {
  id: number;
  ownerId: number;
  units: Partial<Record<CombatUnitKey, number>>;
  originSystemId: number;
  targetSystemId: number;
  targetPlanetId: number;
  ticksRemaining: number;
  isExploration: boolean;
}

export interface Planet {
  id: number;
  planetName: string;
  systemId: number;
  size: number;
  ownerId: number;
  population: number;
  buildings: Partial<Record<BuildingKey, number>>;
  buildQueue: BuildOrder[];
  hasPortal: boolean;
  resourceBonuses: Partial<Record<BonusKey, number>>;
  units: Partial<Record<PlanetUnitKey, number>>;
}

export interface SolarSystem {
  id: number;
  systemName: string;
  position: { x: number; y: number };
  planetIds: number[];
}

export function createPlanet(input: Pick<Planet, 'id' | 'planetName' | 'systemId' | 'size'>): Planet {
  return {
    ...input,
    ownerId: -1,
    population: 0,
    buildings: {},
    buildQueue: [],
    hasPortal: false,
    resourceBonuses: {},
    units: {},
  };
}

export function createEmpire(input: Pick<Empire, 'id' | 'empireName' | 'controllerType' | 'color'>): Empire {
  return {
    ...input,
    homeSystemId: -1,
    homePlanetId: -1,
    resources: { gc: 0, food: 0, iron: 0, endurium: 0, octarine: 0 },
    researchPoints: { military: 0, welfare: 0, economy: 0, construction: 0, resources: 0 },
    researchAllocation: { military: 20, welfare: 20, economy: 20, construction: 20, resources: 20 },
    debuffs: [],
    isEliminated: false,
  };
}
