import { describe, expect, it } from 'vitest';
import { BUILDINGS, getBuildCost, getBuildTicks } from '../../core/data/buildings';
import { SCIENCES } from '../../core/data/sciences';
import { UNITS } from '../../core/data/units';
import { createPlanet } from '../../core/models/types';
import { createSeededRng } from '../../core/random/rng';

describe('ported data tables', () => {
  it('ports the Godot building definitions used by the MVP', () => {
    expect(BUILDINGS.mine.cost).toEqual({ gc: 200, food: 5, endurium: 1 });
    expect(BUILDINGS.farm.production).toEqual({ food: 100 });
    expect(BUILDINGS.portal.buildTicks).toBe(40);
  });

  it('ports unit costs and transport capacity', () => {
    expect(UNITS.fighter.networth).toBe(3);
    expect(UNITS.explorer.cost).toEqual({ gc: 10000 });
    expect(UNITS.transport.capacity).toBe(100);
  });

  it('ports all five science branches', () => {
    expect(Object.keys(SCIENCES).sort()).toEqual([
      'construction',
      'economy',
      'military',
      'resources',
      'welfare',
    ]);
  });

  it('applies construction science and overbuild cost rules', () => {
    const planet = createPlanet({ id: 1, planetName: 'Test I', systemId: 1, size: 1 });
    planet.buildings.mine = 1;
    planet.buildQueue.push({ itemType: 'farm', ticksRemaining: 3, category: 'building' });
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
});
