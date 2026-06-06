import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../core/engines/gameManager';
import { advanceTick, setSpeed } from '../../core/engines/tickEngine';
import { createEmptyGameState, type GameState } from '../../core/galaxy/galaxyData';
import { createEmpire, createPlanet, type Empire, type Fleet, type Planet } from '../../core/models/types';
import { calcEmpireNetworth, getPlanetsForEmpire, getPlayerEmpire } from '../../core/selectors/selectors';

describe('economy and ticks', () => {
  it('advances current tick', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    advanceTick(state);
    expect(state.currentTick).toBe(1);
  });

  it('completes build queue items and adds buildings', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state)!;
    const home = getPlanetsForEmpire(state, player.id)[0];
    home.buildQueue.push({ itemType: 'farm', ticksRemaining: 1, category: 'building' });
    advanceTick(state);
    expect(home.buildings.farm).toBe(1);
  });

  it('completes build queue items and adds units', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state)!;
    const home = getPlanetsForEmpire(state, player.id)[0];
    home.buildQueue.push({ itemType: 'explorer', ticksRemaining: 1, category: 'unit' });
    advanceTick(state);
    expect(home.units.explorer).toBe(1);
  });

  it('produces resources, applies food consumption, and generates research', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    const player = getPlayerEmpire(state)!;
    const home = getPlanetsForEmpire(state, player.id)[0];
    // Give starting buildings so the test has something to produce with
    home.buildings = { mine: 3, farm: 3, research_center: 1 };
    const foodBefore = player.resources.food;
    const ironBefore = player.resources.iron;
    advanceTick(state);
    expect(player.resources.iron).toBeGreaterThanOrEqual(ironBefore);
    expect(player.resources.food).not.toBe(foodBefore);
    expect(player.researchPoints.military).toBeGreaterThan(0);
  });

  it('updates speed without processing a tick', () => {
    const state = createNewGame({ empireName: 'Player Empire', seed: 42 });
    setSpeed(state, 4);
    expect(state.currentSpeed).toBe(4);
    expect(state.currentTick).toBe(0);
  });

  it('resolves enemy fleet arrivals with combat', () => {
    const { state } = createControlledState();
    const enemy = createEmpire({ id: 2, empireName: 'Enemy', controllerType: 'ai', color: '#f00' });
    state.empires.push(enemy);
    const enemyPlanet = createPlanet({ id: 2, planetName: 'Enemy I', systemId: 2, size: 20 });
    enemyPlanet.ownerId = enemy.id;
    enemyPlanet.population = 100;
    state.planets.push(enemyPlanet);

    const fleet: Fleet = {
      id: 7,
      ownerId: 1,
      units: { soldier: 100, transport: 1 },
      originSystemId: 1,
      targetSystemId: 2,
      targetPlanetId: enemyPlanet.id,
      ticksRemaining: 1,
      isExploration: false,
    };
    state.fleets.push(fleet);

    enemyPlanet.units = { soldier: 1 };

    advanceTick(state);

    expect(state.fleets).not.toContain(fleet);
    expect(enemyPlanet.ownerId).toBe(1);
    expect(state.events.filter((event) => event.type === 'battle_resolved' && event.planetId === enemyPlanet.id)).toHaveLength(1);
    expect(state.events).toContainEqual(
      expect.objectContaining({
        type: 'battle_resolved',
        report: expect.objectContaining({
          attackerWon: true,
          phases: expect.arrayContaining([expect.objectContaining({ phase: 'Ground vs Ground' })]),
        }),
      }),
    );
  });

  it('emits colonization and explore notification for explorer arrivals', () => {
    const { state, empire } = createControlledState();
    empire.resources.food = 100;
    const target = createPlanet({ id: 2, planetName: 'Open I', systemId: 2, size: 20 });
    state.planets.push(target);
    state.systems.push({ id: 2, systemName: 'Open', position: { x: 5, y: 0 }, planetIds: [target.id] });
    const fleet: Fleet = {
      id: 7,
      ownerId: empire.id,
      units: {},
      originSystemId: 1,
      targetSystemId: 2,
      targetPlanetId: target.id,
      ticksRemaining: 1,
      isExploration: true,
    };
    state.fleets.push(fleet);

    advanceTick(state);

    expect(target.ownerId).toBe(empire.id);
    expect(target.population).toBeGreaterThanOrEqual(target.size);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: 'planet_colonized', planetId: target.id, empireId: empire.id }),
    );
  });

  it('lands non-explorer fleets on unowned planets without colonization events', () => {
    const { state, empire } = createControlledState();
    empire.resources.food = 100;
    const target = createPlanet({ id: 2, planetName: 'Open I', systemId: 2, size: 20 });
    state.planets.push(target);
    state.systems.push({ id: 2, systemName: 'Open', position: { x: 5, y: 0 }, planetIds: [target.id] });
    const fleet: Fleet = {
      id: 7,
      ownerId: empire.id,
      units: { soldier: 5, transport: 1 },
      originSystemId: 1,
      targetSystemId: 2,
      targetPlanetId: target.id,
      ticksRemaining: 1,
      isExploration: false,
    };
    state.fleets.push(fleet);

    advanceTick(state);

    expect(target.ownerId).toBe(empire.id);
    expect(target.population).toBeGreaterThanOrEqual(target.size);
    expect(target.units.soldier).toBe(5);
    expect(target.units.transport).toBe(1);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'fleet_arrived', fleetId: fleet.id }));
    expect(state.events.some((event) => event.type === 'planet_colonized' && event.planetId === target.id)).toBe(false);
  });

  it('produces resources with planet bonus and resource science multiplier', () => {
    const { state, empire, planet } = createControlledState();
    planet.buildings = { farm: 1 };
    planet.resourceBonuses.food = 1.5;
    empire.researchPoints.resources = 1000;
    const networth = calcEmpireNetworth(state, empire.id);
    const resourceMultiplier = 1 + (100 * (1 - Math.exp(-1000 / (100 * networth)))) / 100;
    const producedFood = Math.trunc(100 * 1.5 * resourceMultiplier);

    advanceTick(state);

    expect(empire.resources.food).toBe(producedFood - Math.trunc(producedFood * 0.005));
  });

  it('applies 0.5% resource decay with truncation', () => {
    const { state, empire } = createControlledState();
    empire.resources = { gc: 0, food: 1000, iron: 199, endurium: 200, octarine: 201 };

    advanceTick(state);

    expect(empire.resources.food).toBe(995);
    expect(empire.resources.iron).toBe(199);
    expect(empire.resources.endurium).toBe(199);
    expect(empire.resources.octarine).toBe(200);
  });

  it('applies exact food consumption, income, upkeep, and population growth for a simple planet', () => {
    const { state, empire, planet } = createControlledState();
    empire.resources = { gc: 50, food: 1000, iron: 0, endurium: 0, octarine: 0 };
    planet.population = 100;
    planet.buildings = { cash_factory: 1 };
    planet.units = { soldier: 2, droid: 1 };

    advanceTick(state);

    expect(empire.resources.food).toBe(983);
    expect(empire.resources.gc).toBe(157);
    expect(planet.population).toBe(105);
  });

  it('splits research according to allocation', () => {
    const { state, empire, planet } = createControlledState();
    planet.buildings = { research_center: 3 };
    empire.researchAllocation = { military: 50, welfare: 25, economy: 25, construction: 0, resources: 0 };

    advanceTick(state);

    expect(empire.researchPoints).toEqual({
      military: 30,
      welfare: 15,
      economy: 15,
      construction: 0,
      resources: 0,
    });
  });

  it('halves income and kills population during starvation', () => {
    const { state, empire, planet } = createControlledState();
    empire.resources = { gc: 0, food: 5, iron: 0, endurium: 0, octarine: 0 };
    // population must exceed 100 — starvation cannot reduce below that floor
    planet.population = 200;

    advanceTick(state);

    // food: 5 - (200/10)=20 → -15 starving, clamped to 0
    // income: 100 + trunc(200/30)=106 → halved = 53
    // starvation: deaths = trunc(200*0.2)=40, pop = max(200-40,100)=160
    expect(empire.resources.food).toBe(0);
    expect(empire.resources.gc).toBe(53);
    expect(planet.population).toBe(160);
    expect(state.events.some((event) => event.type === 'notification' && event.category === 'warning')).toBe(true);
  });

  it('does not reduce population below 100 from starvation', () => {
    const { state, empire, planet } = createControlledState();
    empire.resources = { gc: 0, food: 0, iron: 0, endurium: 0, octarine: 0 };
    planet.population = 100;

    advanceTick(state);

    // population at floor — starvation should not reduce further
    expect(planet.population).toBe(100);
  });

  it('ends in defeat when the player has no planets or fleets', () => {
    const state = createEmptyGameState();
    state.currentState = 'playing';
    state.currentSpeed = 1;
    state.empires.push(createEmpire({ id: 1, empireName: 'Player', controllerType: 'human', color: '#fff' }));
    state.empires.push(createEmpire({ id: 2, empireName: 'Enemy', controllerType: 'ai', color: '#f00' }));
    const enemyPlanet = createPlanet({ id: 1, planetName: 'Enemy I', systemId: 1, size: 20 });
    enemyPlanet.ownerId = 2;
    state.planets.push(enemyPlanet);

    advanceTick(state);

    expect(state.currentState).toBe('game_over');
    expect(state.currentSpeed).toBe(0);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'game_over', playerWon: false }));
  });

  it('ends in victory when all AI empires have no planets or fleets', () => {
    const { state } = createControlledState();
    state.empires.push(createEmpire({ id: 2, empireName: 'Enemy', controllerType: 'ai', color: '#f00' }));

    advanceTick(state);

    expect(state.currentState).toBe('game_over');
    expect(state.currentSpeed).toBe(0);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'game_over', playerWon: true }));
  });
});

function createControlledState(): { state: GameState; empire: Empire; planet: Planet } {
  const state = createEmptyGameState();
  state.currentState = 'playing';
  state.currentSpeed = 1;
  state.nextEmpireId = 2;
  state.nextSystemId = 2;
  state.nextPlanetId = 2;
  state.nextFleetId = 1;

  const empire = createEmpire({ id: 1, empireName: 'Exact Empire', controllerType: 'human', color: '#fff' });
  empire.homeSystemId = 1;
  empire.homePlanetId = 1;
  const planet = createPlanet({ id: 1, planetName: 'Exact I', systemId: 1, size: 20 });
  planet.ownerId = empire.id;

  state.empires.push(empire);
  state.systems.push({ id: 1, systemName: 'Exact', position: { x: 0, y: 0 }, planetIds: [planet.id] });
  state.planets.push(planet);

  return { state, empire, planet };
}
