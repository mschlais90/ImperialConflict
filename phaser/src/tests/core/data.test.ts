import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  getBuildCost,
  getBuildTicks,
  getOverbuildMultiplier,
} from '../../core/data/buildings';
import { SCIENCES } from '../../core/data/sciences';
import { UNITS } from '../../core/data/units';
import { createPlanet } from '../../core/models/types';
import { createSeededRng } from '../../core/random/rng';

describe('ported data tables', () => {
  it('ports all Godot building definitions used by the MVP', () => {
    expect(BUILDINGS).toEqual({
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
        description:
          'Defense: 10% chance to destroy each attacking bomber, kills 10 units if surviving.',
      },
      portal: {
        name: 'Portal',
        cost: { gc: 2000, iron: 100, endurium: 20, octarine: 10 },
        buildTicks: 40,
        production: {},
        description: 'Enables instant troop transport between portalled planets.',
      },
    });
  });

  it('ports all Godot unit definitions used by the MVP', () => {
    expect(UNITS).toEqual({
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
    });
  });

  it('ports all five science branches', () => {
    expect(SCIENCES).toEqual({
      military: {
        name: 'Military',
        description: 'Increases attack and defense strength.',
      },
      welfare: {
        name: 'Welfare',
        description: 'Increases maximum population.',
      },
      economy: {
        name: 'Economy',
        description: 'Increases income.',
      },
      construction: {
        name: 'Construction',
        description: 'Reduces building costs and build times.',
      },
      resources: {
        name: 'Resources',
        description: 'Increases resource production rates.',
      },
    });
  });

  it('applies construction science and overbuild cost rules', () => {
    const planet = createPlanet({ id: 1, planetName: 'Test I', systemId: 1, size: 1 });
    planet.buildings.mine = 1;
    planet.buildQueue.push({ itemType: 'farm', ticksRemaining: 3, category: 'building' });
    expect(getOverbuildMultiplier(planet)).toBe(2);
    expect(getBuildCost('farm', 0, planet).gc).toBe(320);
    expect(getBuildTicks('portal', 100)).toBe(20);
  });

  it('provides deterministic RNG for tests', () => {
    const a = createSeededRng(123);
    const b = createSeededRng(123);
    expect([a.float(), a.intRange(1, 10), a.pick(['a', 'b', 'c'])]).toEqual([
      b.float(),
      b.intRange(1, 10),
      b.pick(['a', 'b', 'c']),
    ]);
  });

  it('uses different RNG sequences for different seeds', () => {
    const a = createSeededRng(123);
    const b = createSeededRng(456);
    expect([a.float(), a.intRange(1, 10), a.pick(['a', 'b', 'c'])]).not.toEqual([
      b.float(),
      b.intRange(1, 10),
      b.pick(['a', 'b', 'c']),
    ]);
  });

  it('throws a clear error when picking from an empty array', () => {
    const rng = createSeededRng(123);
    expect(() => rng.pick([])).toThrow('Cannot pick from an empty array.');
  });
});
