import { getBuildCost, getBuildTicks } from '../data/buildings';
import { UNITS } from '../data/units';
import { performAgentOp, performWizardSpell, type AgentOperationType, type SpellType } from '../engines/opsEngine';
import { appendEvent } from '../events/eventLog';
import type { GameState } from '../galaxy/galaxyData';
import type { BuildingKey, CombatUnitKey, Empire, Planet, ResourceKey, ScienceKey, UnitKey } from '../models/types';
import { calcEmpireNetworth, calcTravelTicks, getEmpire, getPlanet, getPlanetsForEmpire } from '../selectors/selectors';

export type CommandResult = { ok: true; message: string } | { ok: false; message: string };
type CommandFailure = { ok: false; message: string };
type OwnedPlanetResult = CommandFailure | { ok: true; empire: Empire; planet: Planet };
type OperationTargetsResult =
  | CommandFailure
  | { ok: true; attacker: Empire; targetEmpire: Empire; targetPlanet?: Planet };

const COMBAT_UNIT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];
const SCIENCE_KEYS: ScienceKey[] = ['military', 'welfare', 'economy', 'construction', 'resources'];

export function queueBuilding(
  state: GameState,
  input: { empireId: number; planetId: number; buildingType: BuildingKey; count: number },
): CommandResult {
  const resolved = requireOwnedPlanet(state, input.empireId, input.planetId);
  if (!resolved.ok) {
    return resolved;
  }
  if (!isPositiveInteger(input.count)) {
    return fail('Count must be positive');
  }
  if (input.buildingType === 'portal' && (resolved.planet.hasPortal || hasQueuedPortal(resolved.planet) || input.count > 1)) {
    return fail('Planet can only have one portal');
  }

  const constructionScience = getSciencePercent(state, resolved.empire, 'construction');
  const costs = simulateBuildingCosts(input.buildingType, input.count, constructionScience, resolved.planet);
  if (!canAfford(resolved.empire, sumCosts(costs))) {
    return fail('Cannot afford building order');
  }

  for (const cost of costs) {
    deductCost(resolved.empire, cost);
    resolved.planet.buildQueue.push({
      category: 'building',
      itemType: input.buildingType,
      ticksRemaining: getBuildTicks(input.buildingType, constructionScience),
    });
  }

  return ok(`Queued ${input.count} ${input.buildingType}`);
}

export function queueExplorer(
  state: GameState,
  input: { empireId: number; planetId: number; count: number },
): CommandResult {
  const resolved = requireOwnedPlanet(state, input.empireId, input.planetId);
  if (!resolved.ok) {
    return resolved;
  }
  if (!isPositiveInteger(input.count)) {
    return fail('Count must be positive');
  }

  const totalCost = multiplyCost(UNITS.explorer.cost, input.count);
  if (!canAfford(resolved.empire, totalCost)) {
    return fail('Cannot afford explorer order');
  }

  deductCost(resolved.empire, totalCost);
  for (let i = 0; i < input.count; i += 1) {
    resolved.planet.buildQueue.push({ category: 'unit', itemType: 'explorer', ticksRemaining: UNITS.explorer.buildTicks });
  }

  return ok(`Queued ${input.count} explorer`);
}

export function trainUnits(
  state: GameState,
  input: { empireId: number; planetId: number; unitType: Exclude<UnitKey, 'explorer'>; count: number },
): CommandResult {
  const resolved = requireOwnedPlanet(state, input.empireId, input.planetId);
  if (!resolved.ok) {
    return resolved;
  }
  if (!isPositiveInteger(input.count)) {
    return fail('Count must be positive');
  }

  const totalCost = multiplyCost(UNITS[input.unitType].cost, input.count);
  if (!canAfford(resolved.empire, totalCost)) {
    return fail('Cannot afford units');
  }

  deductCost(resolved.empire, totalCost);
  resolved.planet.units[input.unitType] = (resolved.planet.units[input.unitType] ?? 0) + input.count;
  return ok(`Trained ${input.count} ${input.unitType}`);
}

export function sendFleet(
  state: GameState,
  input: {
    empireId: number;
    sourcePlanetId: number;
    targetPlanetId: number;
    units: Partial<Record<CombatUnitKey, number>>;
  },
): CommandResult {
  const resolved = requireOwnedPlanet(state, input.empireId, input.sourcePlanetId);
  if (!resolved.ok) {
    return resolved;
  }
  const target = getPlanet(state, input.targetPlanetId);
  if (target === undefined) {
    return fail('Target planet not found');
  }
  if (target.id === resolved.planet.id) {
    return fail('Cannot send a fleet to the same planet');
  }

  const requested = normalizeCombatUnits(input.units);
  const totalUnits = Object.values(requested).reduce((total, count) => total + count, 0);
  if (totalUnits <= 0) {
    return fail('Select units to send');
  }
  for (const unit of COMBAT_UNIT_KEYS) {
    if ((resolved.planet.units[unit] ?? 0) < (requested[unit] ?? 0)) {
      return fail(`Not enough ${unit}`);
    }
  }
  const groundUnits = (requested.soldier ?? 0) + (requested.droid ?? 0);
  const transportCapacity = (requested.transport ?? 0) * (UNITS.transport.capacity ?? 100);
  if (groundUnits > transportCapacity) {
    return fail('Not enough transport capacity');
  }

  for (const unit of COMBAT_UNIT_KEYS) {
    const count = requested[unit] ?? 0;
    if (count > 0) {
      resolved.planet.units[unit] = (resolved.planet.units[unit] ?? 0) - count;
    }
  }

  const fleet = {
    id: state.nextFleetId,
    ownerId: input.empireId,
    units: requested,
    originSystemId: resolved.planet.systemId,
    targetSystemId: target.systemId,
    targetPlanetId: target.id,
    ticksRemaining: calcTravelTicks(state, resolved.planet.systemId, target.systemId),
    isExploration: false,
  };
  state.nextFleetId += 1;
  state.fleets.push(fleet);
  appendEvent(state, {
    type: 'fleet_launched',
    tick: state.currentTick,
    fleetId: fleet.id,
    ownerId: fleet.ownerId,
    originSystemId: fleet.originSystemId,
    targetSystemId: fleet.targetSystemId,
    targetPlanetId: fleet.targetPlanetId,
  });

  return ok(`Fleet sent to ${target.planetName}`);
}

export function sendExplorer(
  state: GameState,
  input: { empireId: number; sourcePlanetId: number; targetPlanetId: number },
): CommandResult {
  const resolved = requireOwnedPlanet(state, input.empireId, input.sourcePlanetId);
  if (!resolved.ok) {
    return resolved;
  }
  const target = getPlanet(state, input.targetPlanetId);
  if (target === undefined) {
    return fail('Target planet not found');
  }
  if (target.ownerId >= 0) {
    return fail('Explorer target must be unowned');
  }
  // Portal pooling: if source has a portal but no explorer, find any portal planet with one
  let explorerDonor = resolved.planet;
  if ((resolved.planet.units.explorer ?? 0) <= 0 && resolved.planet.hasPortal) {
    const donor = getPlanetsForEmpire(state, input.empireId).find(
      (p) => p.id !== resolved.planet.id && p.hasPortal && (p.units.explorer ?? 0) > 0,
    );
    if (donor !== undefined) {
      explorerDonor = donor;
    }
  }
  if ((explorerDonor.units.explorer ?? 0) <= 0) {
    return fail('No explorer available');
  }

  explorerDonor.units.explorer = (explorerDonor.units.explorer ?? 0) - 1;
  const fleet = {
    id: state.nextFleetId,
    ownerId: input.empireId,
    units: {},
    originSystemId: resolved.planet.systemId,
    targetSystemId: target.systemId,
    targetPlanetId: target.id,
    ticksRemaining: calcTravelTicks(state, resolved.planet.systemId, target.systemId),
    isExploration: true,
  };
  state.nextFleetId += 1;
  state.fleets.push(fleet);
  appendEvent(state, {
    type: 'fleet_launched',
    tick: state.currentTick,
    fleetId: fleet.id,
    ownerId: fleet.ownerId,
    originSystemId: fleet.originSystemId,
    targetSystemId: fleet.targetSystemId,
    targetPlanetId: fleet.targetPlanetId,
  });

  return ok(`Explorer sent to ${target.planetName}`);
}

export function setResearchAllocation(
  state: GameState,
  input: { empireId: number; allocation: Record<ScienceKey, number> },
): CommandResult {
  const empire = getEmpire(state, input.empireId);
  if (empire === undefined) {
    return fail('Empire not found');
  }
  const total = SCIENCE_KEYS.reduce((sum, science) => sum + input.allocation[science], 0);
  if (total !== 100) {
    return fail('Research allocation must total 100');
  }
  if (SCIENCE_KEYS.some((science) => !Number.isInteger(input.allocation[science]) || input.allocation[science] < 0)) {
    return fail('Research allocation values must be non-negative integers');
  }

  empire.researchAllocation = { ...input.allocation };
  return ok('Research allocation updated');
}

export function performAgentOperation(
  state: GameState,
  input: { empireId: number; targetEmpireId: number; operationType: AgentOperationType; targetPlanetId?: number },
): CommandResult {
  if (requiresAgentTargetPlanet(input.operationType) && input.targetPlanetId === undefined) {
    return fail('No target planet selected');
  }
  const resolved = resolveOperationTargets(state, input.empireId, input.targetEmpireId, input.targetPlanetId);
  if (!resolved.ok) {
    return resolved;
  }
  const result = performAgentOp(state, input.operationType, resolved.attacker, resolved.targetEmpire, resolved.targetPlanet);
  return result.success ? ok(result.message) : fail(result.message);
}

export function performSpell(
  state: GameState,
  input: { empireId: number; targetEmpireId: number; spellType: SpellType; targetPlanetId?: number },
): CommandResult {
  if (requiresSpellTargetPlanet(input.spellType) && input.targetPlanetId === undefined) {
    return fail('No target planet selected');
  }
  const resolved = resolveOperationTargets(state, input.empireId, input.targetEmpireId, input.targetPlanetId);
  if (!resolved.ok) {
    return resolved;
  }
  const result = performWizardSpell(state, input.spellType, resolved.attacker, resolved.targetEmpire, resolved.targetPlanet);
  return result.success ? ok(result.message) : fail(result.message);
}

function requireOwnedPlanet(
  state: GameState,
  empireId: number,
  planetId: number,
): OwnedPlanetResult {
  const empire = getEmpire(state, empireId);
  if (empire === undefined) {
    return fail('Empire not found');
  }
  const planet = getPlanet(state, planetId);
  if (planet === undefined) {
    return fail('Planet not found');
  }
  if (planet.ownerId !== empireId) {
    return fail('Planet is not owned by empire');
  }
  return { ok: true, empire, planet };
}

function resolveOperationTargets(
  state: GameState,
  empireId: number,
  targetEmpireId: number,
  targetPlanetId?: number,
): OperationTargetsResult {
  const attacker = getEmpire(state, empireId);
  if (attacker === undefined) {
    return fail('Empire not found');
  }
  const targetEmpire = getEmpire(state, targetEmpireId);
  if (targetEmpire === undefined) {
    return fail('Target empire not found');
  }
  if (attacker.id === targetEmpire.id) {
    return fail('Cannot target own empire');
  }
  const targetPlanet = targetPlanetId === undefined ? undefined : getPlanet(state, targetPlanetId);
  if (targetPlanetId !== undefined && targetPlanet === undefined) {
    return fail('Target planet not found');
  }
  if (targetPlanet !== undefined && targetPlanet.ownerId !== targetEmpire.id) {
    return fail('Target planet is not owned by target empire');
  }
  return { ok: true, attacker, targetEmpire, targetPlanet };
}

function simulateBuildingCosts(
  buildingType: BuildingKey,
  count: number,
  constructionScience: number,
  planet: Planet,
): Array<Partial<Record<ResourceKey, number>>> {
  const costs: Array<Partial<Record<ResourceKey, number>>> = [];
  const simulatedPlanet: Planet = {
    ...planet,
    buildings: { ...planet.buildings },
    buildQueue: [...planet.buildQueue],
    resourceBonuses: { ...planet.resourceBonuses },
    units: { ...planet.units },
  };
  for (let i = 0; i < count; i += 1) {
    const cost = getBuildCost(buildingType, constructionScience, simulatedPlanet);
    costs.push(cost);
    simulatedPlanet.buildQueue.push({ category: 'building', itemType: buildingType, ticksRemaining: 1 });
  }
  return costs;
}

function normalizeCombatUnits(units: Partial<Record<CombatUnitKey, number>>): Partial<Record<CombatUnitKey, number>> {
  const normalized: Partial<Record<CombatUnitKey, number>> = {};
  for (const unit of COMBAT_UNIT_KEYS) {
    const count = units[unit] ?? 0;
    if (!Number.isInteger(count) || count < 0) {
      return {};
    }
    if (count > 0) {
      normalized[unit] = count;
    }
  }
  return normalized;
}

function getSciencePercent(state: GameState, empire: Empire, science: ScienceKey): number {
  const networth = Math.max(calcEmpireNetworth(state, empire.id), 1);
  return 100 * (1 - Math.exp(-empire.researchPoints[science] / (100 * networth)));
}

function canAfford(empire: Empire, cost: Partial<Record<ResourceKey, number>>): boolean {
  return Object.entries(cost).every(([resource, amount]) => empire.resources[resource as ResourceKey] >= (amount ?? 0));
}

function deductCost(empire: Empire, cost: Partial<Record<ResourceKey, number>>): void {
  for (const resource of Object.keys(cost) as ResourceKey[]) {
    empire.resources[resource] -= cost[resource] ?? 0;
  }
}

function sumCosts(costs: Array<Partial<Record<ResourceKey, number>>>): Partial<Record<ResourceKey, number>> {
  const total: Partial<Record<ResourceKey, number>> = {};
  for (const cost of costs) {
    for (const resource of Object.keys(cost) as ResourceKey[]) {
      total[resource] = (total[resource] ?? 0) + (cost[resource] ?? 0);
    }
  }
  return total;
}

function multiplyCost(cost: Partial<Record<ResourceKey, number>>, count: number): Partial<Record<ResourceKey, number>> {
  const result: Partial<Record<ResourceKey, number>> = {};
  for (const resource of Object.keys(cost) as ResourceKey[]) {
    result[resource] = (cost[resource] ?? 0) * count;
  }
  return result;
}

function hasQueuedPortal(planet: Planet): boolean {
  return planet.buildQueue.some((order) => order.category === 'building' && order.itemType === 'portal');
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function requiresAgentTargetPlanet(operationType: AgentOperationType): boolean {
  return operationType === 'destroy_units' || operationType === 'sabotage_portal';
}

function requiresSpellTargetPlanet(spellType: SpellType): boolean {
  return spellType === 'hypnotize';
}

function ok(message: string): CommandResult {
  return { ok: true, message };
}

function fail(message: string): CommandFailure {
  return { ok: false, message };
}
