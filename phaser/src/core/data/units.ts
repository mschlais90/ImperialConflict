import type { ResourceKey, UnitKey } from '../models/types';

export interface UnitDefinition {
  name: string;
  cost: Partial<Record<ResourceKey, number>>;
  buildTicks: number;
  groundAttack: number;
  groundDefense: number;
  airAttack: number;
  airDefense: number;
  networth: number;
  consumesFood: boolean;
  capacity?: number;
  isSpecial?: boolean;
  description: string;
}

export const UNITS = {
  fighter: {
    name: 'Fighter',
    cost: { gc: 50, iron: 5, endurium: 1 },
    buildTicks: 3,
    groundAttack: 0,
    groundDefense: 4,
    airAttack: 10,
    airDefense: 10,
    networth: 3,
    consumesFood: true,
    description: 'Air superiority unit.',
  },
  bomber: {
    name: 'Bomber',
    cost: { gc: 80, iron: 8, endurium: 2 },
    buildTicks: 4,
    groundAttack: 10,
    groundDefense: 0,
    airAttack: 0,
    airDefense: 2,
    networth: 5,
    consumesFood: true,
    description: 'Ground attack from air. Targets lasers.',
  },
  soldier: {
    name: 'Soldier',
    cost: { gc: 30, iron: 2 },
    buildTicks: 2,
    groundAttack: 5,
    groundDefense: 6,
    airAttack: 0,
    airDefense: 0,
    networth: 1,
    consumesFood: true,
    description: 'Basic ground combat unit.',
  },
  droid: {
    name: 'Droid',
    cost: { gc: 40, iron: 5, endurium: 1 },
    buildTicks: 3,
    groundAttack: 6,
    groundDefense: 7,
    airAttack: 0,
    airDefense: 0,
    networth: 1,
    consumesFood: false,
    description: 'Advanced ground unit. Does not consume food.',
  },
  transport: {
    name: 'Transport',
    cost: { gc: 60, iron: 10, endurium: 2 },
    buildTicks: 3,
    groundAttack: 0,
    groundDefense: 5,
    airAttack: 0,
    airDefense: 5,
    networth: 6,
    consumesFood: true,
    capacity: 100,
    description: 'Carries up to 100 soldiers or droids.',
  },
  explorer: {
    name: 'Explorer Ship',
    cost: { gc: 10000 },
    buildTicks: 20,
    groundAttack: 0,
    groundDefense: 0,
    airAttack: 0,
    airDefense: 0,
    networth: 10,
    consumesFood: false,
    description: 'Colonizes unowned planets. Built via build queue.',
  },
  agent: {
    name: 'Agent',
    cost: { gc: 50, iron: 5 },
    buildTicks: 0,
    groundAttack: 0,
    groundDefense: 0,
    airAttack: 0,
    airDefense: 0,
    networth: 1,
    consumesFood: true,
    isSpecial: true,
    description: 'Covert operative. Performs espionage and sabotage operations.',
  },
  wizard: {
    name: 'Wizard',
    cost: { gc: 40, octarine: 3 },
    buildTicks: 0,
    groundAttack: 0,
    groundDefense: 0,
    airAttack: 0,
    airDefense: 0,
    networth: 1,
    consumesFood: false,
    isSpecial: true,
    description: 'Magic caster. Performs spells using octarine.',
  },
} as const satisfies Record<UnitKey, UnitDefinition>;
