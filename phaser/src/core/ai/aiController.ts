import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import {
  performAgentOperation,
  performSpell,
  queueBuilding,
  queueExplorer,
  sendExplorer,
  trainUnits,
} from '../commands/playerCommands';
import type { AgentOperationType, SpellType } from '../engines/opsEngine';
import { getAgentOperationCost, getSpellCost, getTotalAgents, getTotalWizards } from '../engines/opsEngine';
import { appendEvent } from '../events/eventLog';
import type { GameState } from '../galaxy/galaxyData';
import type { BuildingKey, CombatUnitKey, Empire, Planet, UnitKey } from '../models/types';
import {
  calcTravelTicks,
  getEmpire,
  getFleetsForEmpire,
  getPlanet,
  getPlanetsForEmpire,
  getSystem,
} from '../selectors/selectors';

const MIN_MILITARY_TICK = 40;
const BUILD_QUEUE_MAX = 3;
const RECENT_ATTACK_COOLDOWN = 60;
const RECENT_ATTACK_MULTIPLIER = 1.5;
const GARRISON_FRACTION = 0.15;
const MIN_GARRISON_PER_PLANET = 10;

type DifficultyParams = { attackStartTick: number; strengthRatio: number; buildMultiplier: number; opsFrequency: number };

function getDifficultyParams(state: GameState): DifficultyParams {
  switch (state.difficulty ?? 'hard') {
    case 'easy': return { attackStartTick: 150, strengthRatio: 3.5, buildMultiplier: 0.4, opsFrequency: 10 };
    case 'normal': return { attackStartTick: 110, strengthRatio: 2.4, buildMultiplier: 0.8, opsFrequency: 7 };
    case 'hard': return { attackStartTick: 100, strengthRatio: 2.0, buildMultiplier: 1.0, opsFrequency: 5 };
  }
}
const COMBAT_UNIT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];
const TRAINABLE_UNIT_KEYS: Array<Exclude<UnitKey, 'explorer'>> = [
  'transport',
  'soldier',
  'droid',
  'fighter',
  'bomber',
  'agent',
  'wizard',
];

type CombatUnitCounts = Record<CombatUnitKey, number>;
type PooledAttackWithdrawal = { planet: Planet; units: CombatUnitCounts };
type PooledAttackPlan = {
  originSystemId: number;
  units: Partial<Record<CombatUnitKey, number>>;
  withdrawals: PooledAttackWithdrawal[];
};

export function processAiTurn(state: GameState, empireId: number, tickNumber: number): void {
  const empire = getEmpire(state, empireId);
  if (empire === undefined) {
    return;
  }

  const planets = getPlanetsForEmpire(state, empire.id);
  if (planets.length === 0) {
    return;
  }

  const diff = getDifficultyParams(state);
  getAiControllerState(state, empire.id);
  doBuilding(state, empire, planets);
  doColonization(state, empire, planets);

  if (tickNumber >= MIN_MILITARY_TICK) {
    doMilitaryProduction(state, empire, planets, diff.buildMultiplier);
  }

  if (tickNumber >= diff.attackStartTick) {
    doAttack(state, empire, planets, tickNumber, diff.strengthRatio);
  }

  if (tickNumber >= diff.attackStartTick && tickNumber % diff.opsFrequency === 0) {
    doOperations(state, empire);
  }
}

function doBuilding(state: GameState, empire: Empire, planets: Planet[]): void {
  for (const planet of planets) {
    if (planet.buildQueue.length >= BUILD_QUEUE_MAX) {
      continue;
    }
    if (getTotalBuildings(planet) >= planet.size) {
      continue;
    }

    const buildingType = chooseBuilding(state, empire, planet);
    if (buildingType === undefined) {
      continue;
    }

    queueBuilding(state, { empireId: empire.id, planetId: planet.id, buildingType, count: 1 });
  }
}

function chooseBuilding(state: GameState, empire: Empire, planet: Planet): BuildingKey | undefined {
  const foodBalance = estimateFoodBalance(state, empire);
  if (foodBalance < 0) {
    return 'farm';
  }

  const income = estimateIncome(state, empire);
  if (income < 50) {
    return 'cash_factory';
  }

  if (empire.resources.iron < 50) {
    return 'mine';
  }

  if (empire.resources.endurium < 10) {
    return empire.resources.iron >= 20 ? 'refinery' : 'mine';
  }

  const researchCenters = getPlanetsForEmpire(state, empire.id).reduce(
    (total, ownedPlanet) => total + (ownedPlanet.buildings.research_center ?? 0),
    0,
  );
  if (researchCenters < 3) {
    return 'research_center';
  }

  if (planet.population >= getMaxPopulation(planet) * 0.9) {
    return 'living_quarter';
  }

  if ((planet.buildings.cash_factory ?? 0) < 5) {
    return 'cash_factory';
  }

  if (getTotalBuildings(planet) > 15 && (planet.buildings.laser ?? 0) < 3) {
    return 'laser';
  }

  if (foodBalance < 200) {
    return 'farm';
  }

  return 'mine';
}

function doColonization(state: GameState, empire: Empire, planets: Planet[]): void {
  const exploringCount = getFleetsForEmpire(state, empire.id).filter((fleet) => fleet.isExploration).length;
  if (exploringCount >= 2) {
    return;
  }

  const explorersBuilding = planets.reduce(
    (total, planet) =>
      total + planet.buildQueue.filter((order) => order.category === 'unit' && order.itemType === 'explorer').length,
    0,
  );
  const sourcePlanet = planets.find((planet) => (planet.units.explorer ?? 0) > 0);

  if (sourcePlanet === undefined && explorersBuilding === 0) {
    const bestPlanet = planets.reduce((best, planet) => (getTotalBuildings(planet) > getTotalBuildings(best) ? planet : best));
    queueExplorer(state, { empireId: empire.id, planetId: bestPlanet.id, count: 1 });
    return;
  }

  if (sourcePlanet === undefined) {
    return;
  }

  let bestTarget: Planet | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const system of state.systems) {
    for (const planetId of system.planetIds) {
      const planet = getPlanet(state, planetId);
      if (planet === undefined || planet.ownerId >= 0) {
        continue;
      }

      const distance = systemDistance(state, sourcePlanet.systemId, system.id);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = planet;
      }
    }
  }

  if (bestTarget !== undefined) {
    sendExplorer(state, { empireId: empire.id, sourcePlanetId: sourcePlanet.id, targetPlanetId: bestTarget.id });
  }
}

function doMilitaryProduction(state: GameState, empire: Empire, planets: Planet[], buildMultiplier: number): void {
  const totals = countUnits(planets);
  const planetCount = planets.length;
  const targetSoldiers = 50 + planetCount * 40;
  const targetDroids = Math.trunc(targetSoldiers / 3);
  const targetFighters = 10 + planetCount * 8;
  const targetBombers = planetCount * 3;
  const totalGround = totals.soldier + totals.droid;
  const targetTransports = Math.max(Math.ceil(totalGround / 80), planetCount);
  const targetAgents = 5 + planetCount * 3;
  const targetWizards = 5 + planetCount * 3;
  const bestPlanet = planets.reduce((best, planet) => (getTotalBuildings(planet) > getTotalBuildings(best) ? planet : best));
  const priorities: Array<{ type: Exclude<UnitKey, 'explorer'>; urgency: number }> = [];

  addPriority(priorities, 'transport', totals.transport, targetTransports);
  addPriority(priorities, 'soldier', totals.soldier, targetSoldiers);
  addPriority(priorities, 'droid', totals.droid, targetDroids);
  addPriority(priorities, 'fighter', totals.fighter, targetFighters);
  addPriority(priorities, 'bomber', totals.bomber, targetBombers);
  addPriority(priorities, 'agent', totals.agent, targetAgents, 0.5);
  addPriority(priorities, 'wizard', totals.wizard, targetWizards, 0.5);
  priorities.sort((a, b) => b.urgency - a.urgency);

  const maxPerTick = Math.max(1, Math.min(Math.trunc((2 + planetCount) * buildMultiplier), 8));
  let built = 0;
  let passCount = 0;

  while (built < maxPerTick && priorities.length > 0 && passCount < 20) {
    passCount += 1;
    for (const entry of priorities) {
      if (built >= maxPerTick) {
        break;
      }
      if (!TRAINABLE_UNIT_KEYS.includes(entry.type)) {
        continue;
      }
      const result = trainUnits(state, { empireId: empire.id, planetId: bestPlanet.id, unitType: entry.type, count: 1 });
      if (result.ok) {
        built += 1;
      }
    }
  }
}

function doAttack(state: GameState, empire: Empire, planets: Planet[], tickNumber: number, attackStrengthRatio: number): void {
  const activeAttackFleets = getFleetsForEmpire(state, empire.id).filter((fleet) => !fleet.isExploration).length;
  if (activeAttackFleets >= 2) {
    return;
  }

  const totalPower = calcEmpireAttackPower(planets);
  const deployablePower = totalPower - Math.trunc(totalPower * GARRISON_FRACTION);
  if (deployablePower < 200) {
    return;
  }

  const controller = getAiControllerState(state, empire.id);
  const center = getEmpireCenter(state, planets);
  let bestTarget: Planet | undefined;
  let bestTargetRequiredPower = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const planet of state.planets) {
    if (planet.ownerId < 0 || planet.ownerId === empire.id) {
      continue;
    }

    const defensePower = estimateDefensePower(planet);
    let requiredPower = Math.trunc(defensePower * attackStrengthRatio);
    const memory = controller.recentAttacks[planet.id];
    if (memory !== undefined) {
      const ticksSince = tickNumber - memory.tick;
      if (ticksSince < RECENT_ATTACK_COOLDOWN) {
        continue;
      }
      requiredPower = Math.max(requiredPower, Math.trunc(memory.powerNeeded * RECENT_ATTACK_MULTIPLIER));
    }

    if (deployablePower < requiredPower) {
      continue;
    }

    const system = getSystem(state, planet.systemId);
    const distance = system === undefined ? 100 : Math.hypot(center.x - system.position.x, center.y - system.position.y);
    const surplus = deployablePower - requiredPower;
    const score = surplus / Math.max(distance, 10) + 100 / Math.max(defensePower, 1);

    if (score > bestScore) {
      bestScore = score;
      bestTarget = planet;
      bestTargetRequiredPower = requiredPower;
    }
  }

  if (bestTarget === undefined) {
    return;
  }

  launchPooledAttackFleet(state, empire, planets, bestTarget, bestTargetRequiredPower, tickNumber, controller);
}

function doOperations(state: GameState, empire: Empire): void {
  const enemies = state.empires.filter(
    (candidate) => candidate.id !== empire.id && getPlanetsForEmpire(state, candidate.id).length > 0,
  );
  if (enemies.length === 0) {
    return;
  }

  const target = pick(state, enemies);
  const agentCost = getAgentOperationCost(state, empire);
  if (getTotalAgents(state, empire) >= 5 && empire.resources.gc >= agentCost) {
    const operation = pick<AgentOperationType>(state, ['spy', 'destroy_cash', 'destroy_units', 'sabotage_portal']);
    const targetPlanetId = operation === 'destroy_units' || operation === 'sabotage_portal' ? pickTargetPlanetId(state, target) : undefined;
    if (operation === 'spy' || operation === 'destroy_cash' || targetPlanetId !== undefined) {
      performAgentOperation(state, { empireId: empire.id, targetEmpireId: target.id, operationType: operation, targetPlanetId });
    }
  }

  const spellCost = getSpellCost(state, empire);
  if (getTotalWizards(state, empire) >= 5 && empire.resources.octarine >= spellCost) {
    const spell = pick<SpellType>(state, ['vision', 'hypnotize', 'reduce_food', 'destroy_iron']);
    const targetPlanetId = spell === 'hypnotize' ? pickTargetPlanetId(state, target) : undefined;
    if (spell !== 'hypnotize' || targetPlanetId !== undefined) {
      performSpell(state, { empireId: empire.id, targetEmpireId: target.id, spellType: spell, targetPlanetId });
    }
  }
}

function getAiControllerState(state: GameState, empireId: number): GameState['aiControllers'][number] {
  let controller = state.aiControllers[empireId];
  if (controller === undefined) {
    controller = { empireId, recentAttacks: {} };
    state.aiControllers[empireId] = controller;
  }
  controller.recentAttacks ??= {};
  return controller;
}

function addPriority(
  priorities: Array<{ type: Exclude<UnitKey, 'explorer'>; urgency: number }>,
  type: Exclude<UnitKey, 'explorer'>,
  current: number,
  target: number,
  multiplier = 1,
): void {
  if (current < target) {
    priorities.push({ type, urgency: ((target - current) / Math.max(target, 1)) * multiplier });
  }
}

function countUnits(planets: Planet[]): Record<UnitKey, number> {
  const totals: Record<UnitKey, number> = {
    fighter: 0,
    bomber: 0,
    soldier: 0,
    droid: 0,
    transport: 0,
    explorer: 0,
    agent: 0,
    wizard: 0,
  };
  for (const planet of planets) {
    for (const unitType of Object.keys(totals) as UnitKey[]) {
      totals[unitType] += planet.units[unitType] ?? 0;
    }
  }
  return totals;
}

function estimateFoodBalance(state: GameState, empire: Empire): number {
  let production = 0;
  let consumption = 0;
  for (const planet of getPlanetsForEmpire(state, empire.id)) {
    production += (planet.buildings.farm ?? 0) * (BUILDINGS.farm.production.food ?? 0);
    consumption += Math.trunc(planet.population / 10);
    consumption += getTotalUnitsExceptDroids(planet);
  }
  return production - consumption;
}

function estimateIncome(state: GameState, empire: Empire): number {
  let totalPopulation = 0;
  let totalCashFactories = 0;
  for (const planet of getPlanetsForEmpire(state, empire.id)) {
    totalPopulation += planet.population;
    totalCashFactories += planet.buildings.cash_factory ?? 0;
  }
  return 100 + Math.trunc(totalPopulation / 30) + totalCashFactories * 8;
}

function estimateDefensePower(planet: Planet): number {
  const soldiers = planet.units.soldier ?? 0;
  const droids = planet.units.droid ?? 0;
  const fighters = planet.units.fighter ?? 0;
  return soldiers * 6 + droids * 7 + fighters * 10 + (planet.buildings.laser ?? 0) * 80;
}

function calcEmpireAttackPower(planets: Planet[]): number {
  return planets.reduce((total, planet) => total + calcPlanetAttackPower(planet), 0);
}

function calcPlanetAttackPower(planet: Planet): number {
  return (
    (planet.units.soldier ?? 0) * 5 +
    (planet.units.droid ?? 0) * 6 +
    (planet.units.fighter ?? 0) * 10 +
    (planet.units.bomber ?? 0) * 8 +
    (planet.units.transport ?? 0) * 2
  );
}

function calcDictAttackPower(units: Partial<Record<CombatUnitKey, number>>): number {
  return (
    (units.soldier ?? 0) * 5 +
    (units.droid ?? 0) * 6 +
    (units.fighter ?? 0) * 10 +
    (units.bomber ?? 0) * 8 +
    (units.transport ?? 0) * 2
  );
}

function launchPooledAttackFleet(
  state: GameState,
  empire: Empire,
  planets: Planet[],
  target: Planet,
  requiredPower: number,
  tickNumber: number,
  controller: GameState['aiControllers'][number],
): void {
  const plan = createPooledAttackPlan(state, planets, target);
  if (plan === undefined) {
    return;
  }
  const plannedPower = calcDictAttackPower(plan.units);
  if (plannedPower < requiredPower) {
    return;
  }

  applyPooledAttackWithdrawals(plan.withdrawals);
  const fleet = {
    id: state.nextFleetId,
    ownerId: empire.id,
    units: plan.units,
    originSystemId: plan.originSystemId,
    targetSystemId: target.systemId,
    targetPlanetId: target.id,
    ticksRemaining: calcTravelTicks(state, plan.originSystemId, target.systemId),
    isExploration: false,
  };
  state.nextFleetId += 1;
  state.fleets.push(fleet);
  controller.recentAttacks[target.id] = {
    tick: tickNumber,
    powerNeeded: plannedPower,
  };
  appendEvent(state, {
    type: 'fleet_launched',
    tick: state.currentTick,
    fleetId: fleet.id,
    ownerId: fleet.ownerId,
    originSystemId: fleet.originSystemId,
    targetSystemId: fleet.targetSystemId,
    targetPlanetId: fleet.targetPlanetId,
  });
}

function createPooledAttackPlan(state: GameState, planets: Planet[], target: Planet): PooledAttackPlan | undefined {
  const unitsToSend = emptyCombatCounts();
  const withdrawals: PooledAttackWithdrawal[] = [];
  let nearestSystemId = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const planet of planets) {
    const distance = systemDistance(state, planet.systemId, target.systemId);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSystemId = planet.systemId;
    }

    const withdrawal = planDeployableUnitsForPooledAttack(planet);
    withdrawals.push(withdrawal);
    for (const unitType of COMBAT_UNIT_KEYS) {
      unitsToSend[unitType] += withdrawal.units[unitType];
    }
  }

  if (nearestSystemId < 0) {
    return undefined;
  }

  enforcePlannedTransportCapacity(unitsToSend, withdrawals);
  const finalSend = normalizeSendUnits(unitsToSend);
  if (Object.keys(finalSend).length === 0) {
    return undefined;
  }

  return { originSystemId: nearestSystemId, units: finalSend, withdrawals };
}

function planDeployableUnitsForPooledAttack(planet: Planet): PooledAttackWithdrawal {
  const units = emptyCombatCounts();
  const planetGarrison = Math.max(MIN_GARRISON_PER_PLANET, Math.trunc((planet.units.soldier ?? 0) * GARRISON_FRACTION));
  for (const unitType of COMBAT_UNIT_KEYS) {
    const available = planet.units[unitType] ?? 0;
    let keep = 0;
    if (unitType === 'soldier') {
      keep = Math.min(planetGarrison, available);
    } else if (unitType === 'transport') {
      keep = Math.min(Math.ceil(planetGarrison / (UNITS.transport.capacity ?? 100)), available);
    }

    const toSend = Math.max(available - keep, 0);
    if (toSend > 0) {
      units[unitType] = toSend;
    }
  }
  return { planet, units };
}

function enforcePlannedTransportCapacity(unitsToSend: CombatUnitCounts, withdrawals: PooledAttackWithdrawal[]): void {
  const groundCount = unitsToSend.soldier + unitsToSend.droid;
  const transportCapacity = unitsToSend.transport * (UNITS.transport.capacity ?? 100);
  if (groundCount <= 0 || transportCapacity >= groundCount) {
    return;
  }

  let remainingCapacity = transportCapacity;
  unitsToSend.soldier = 0;
  unitsToSend.droid = 0;
  for (const withdrawal of withdrawals) {
    remainingCapacity = keepGroundUnitsWithinCapacity(withdrawal.units, 'soldier', remainingCapacity);
    remainingCapacity = keepGroundUnitsWithinCapacity(withdrawal.units, 'droid', remainingCapacity);
    unitsToSend.soldier += withdrawal.units.soldier;
    unitsToSend.droid += withdrawal.units.droid;
  }
}

function keepGroundUnitsWithinCapacity(units: CombatUnitCounts, unitType: 'soldier' | 'droid', capacity: number): number {
  const kept = Math.min(units[unitType], capacity);
  units[unitType] = kept;
  return capacity - kept;
}

function applyPooledAttackWithdrawals(withdrawals: PooledAttackWithdrawal[]): void {
  for (const withdrawal of withdrawals) {
    for (const unitType of COMBAT_UNIT_KEYS) {
      const count = withdrawal.units[unitType];
      if (count > 0) {
        withdrawal.planet.units[unitType] = (withdrawal.planet.units[unitType] ?? 0) - count;
      }
    }
  }
}

function emptyCombatCounts(): CombatUnitCounts {
  return { fighter: 0, bomber: 0, soldier: 0, droid: 0, transport: 0 };
}

function normalizeSendUnits(units: Record<CombatUnitKey, number>): Partial<Record<CombatUnitKey, number>> {
  const normalized: Partial<Record<CombatUnitKey, number>> = {};
  for (const unitType of COMBAT_UNIT_KEYS) {
    if (units[unitType] > 0) {
      normalized[unitType] = units[unitType];
    }
  }
  return normalized;
}

function getEmpireCenter(state: GameState, planets: Planet[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const planet of planets) {
    const system = getSystem(state, planet.systemId);
    if (system !== undefined) {
      x += system.position.x;
      y += system.position.y;
      count += 1;
    }
  }

  return count > 0 ? { x: x / count, y: y / count } : { x: 0, y: 0 };
}

function systemDistance(state: GameState, firstSystemId: number, secondSystemId: number): number {
  const first = getSystem(state, firstSystemId);
  const second = getSystem(state, secondSystemId);
  if (first === undefined || second === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y);
}

function getTotalBuildings(planet: Planet): number {
  return Object.values(planet.buildings).reduce((total, count) => total + (count ?? 0), 0);
}

function getMaxPopulation(planet: Planet): number {
  return 40 * planet.size + 650 * (planet.buildings.living_quarter ?? 0);
}

function getTotalUnitsExceptDroids(planet: Planet): number {
  return (
    (planet.units.fighter ?? 0) +
    (planet.units.bomber ?? 0) +
    (planet.units.soldier ?? 0) +
    (planet.units.transport ?? 0) +
    (planet.units.explorer ?? 0) +
    (planet.units.agent ?? 0)
  );
}

function pickTargetPlanetId(state: GameState, target: Empire): number | undefined {
  const planets = getPlanetsForEmpire(state, target.id);
  if (planets.length === 0) {
    return undefined;
  }
  return pick(state, planets).id;
}

function pick<T>(state: GameState, items: readonly T[]): T {
  if (state.rng === undefined) {
    throw new Error('GameState RNG is not initialized.');
  }
  return state.rng.pick(items);
}
