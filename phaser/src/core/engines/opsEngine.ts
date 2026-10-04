import { UNITS } from '../data/units';
import { appendEvent } from '../events/eventLog';
import type { GameState } from '../galaxy/galaxyData';
import type { AgentOperationType, CombatUnitKey, Empire, OpsMission, Planet, SpellType } from '../models/types';
import { calcEmpireNetworth, calcTravelTicks, getEmpire, getPlanet, getPlanetsForEmpire } from '../selectors/selectors';

export type { AgentOperationType, SpellType } from '../models/types';
export type OperationResult = { success: true; message: string } | { success: false; message: string };
export type MissionKind = OpsMission['kind'];

const COMBAT_UNIT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];

/** Maximum concurrent missions per kind (agent / wizard) per empire. */
export const MAX_ACTIVE_MISSIONS = 3;
const MIN_MISSION_TICKS = 2;
const MAX_MISSION_TICKS = 6;
/** Galaxy distance units per tick of mission travel. */
const MISSION_DISTANCE_PER_TICK = 8;
/** Fraction of committed units lost when a mission fails. */
const FAILURE_LOSS_RATE = 0.1;

export function getAgentOperationCost(state: GameState, attacker: Empire): number {
  return Math.max(Math.trunc(calcEmpireNetworth(state, attacker.id) / 15), 10);
}

export function getSpellCost(state: GameState, attacker: Empire): number {
  return Math.max(Math.trunc(calcEmpireNetworth(state, attacker.id) / 80), 5);
}

export type OpDifficulty = 'soft' | 'hard';

export const AGENT_OP_DIFFICULTY: Record<AgentOperationType, OpDifficulty> = {
  spy: 'soft',
  destroy_cash: 'hard',
  destroy_units: 'hard',
  sabotage_portal: 'hard',
};

export const SPELL_DIFFICULTY: Record<SpellType, OpDifficulty> = {
  vision: 'soft',
  hypnotize: 'hard',
  reduce_food: 'hard',
  destroy_iron: 'hard',
};

export function getSuccessChance(
  attackerCount: number,
  defenderCount: number,
  attackerNetworth: number,
  defenderNetworth: number,
  difficulty: OpDifficulty = 'hard',
): number {
  if (attackerCount <= 0) {
    return 0;
  }

  // NW only penalizes when attacking someone smaller (protects small empires)
  let networthFactor = 1;
  if (attackerNetworth > defenderNetworth && defenderNetworth > 0) {
    networthFactor = attackerNetworth / defenderNetworth;
  }

  const effectiveDef = defenderCount * networthFactor;
  let chance = attackerCount / (attackerCount + effectiveDef);

  // Soft ops are easier, hard ops are harder
  if (difficulty === 'soft') {
    chance *= 1.3;
  } else {
    chance *= 0.85;
  }

  return Math.min(Math.max(chance, 0.05), 0.9);
}

/** Chance that the defender spots an incoming mission at launch. */
export function getDetectionChance(committed: number, defenderCount: number): number {
  if (defenderCount <= 0) return 0.1;
  return Math.min(Math.max(defenderCount / (defenderCount + committed), 0.1), 0.8);
}

export function getTotalAgents(state: GameState, empire: Empire): number {
  return getPlanetsForEmpire(state, empire.id).reduce((total, planet) => total + (planet.units.agent ?? 0), 0);
}

export function getTotalWizards(state: GameState, empire: Empire): number {
  return getPlanetsForEmpire(state, empire.id).reduce((total, planet) => total + (planet.units.wizard ?? 0), 0);
}

export function getActiveMissionCount(empire: Empire, kind: MissionKind): number {
  return empire.missions.filter((mission) => mission.kind === kind).length;
}

/** Ticks until a mission from `attacker` reaches `targetEmpire` (or the given planet). */
export function getMissionDuration(
  state: GameState,
  kind: MissionKind,
  attacker: Empire,
  targetEmpire: Empire,
  targetPlanet?: Planet,
): number {
  const fromSystemId = getPlanet(state, attacker.homePlanetId)?.systemId ?? attacker.homeSystemId;
  const toSystemId = targetPlanet?.systemId ?? getPlanet(state, targetEmpire.homePlanetId)?.systemId ?? targetEmpire.homeSystemId;
  const distanceTicks = Math.ceil(calcTravelTicks(state, fromSystemId, toSystemId) / MISSION_DISTANCE_PER_TICK);
  const base = Math.min(Math.max(distanceTicks, MIN_MISSION_TICKS), MAX_MISSION_TICKS);
  return kind === 'wizard' ? base + 1 : base;
}

/** Launch an agent mission. Validates fully before spending GC or committing agents. */
export function launchAgentMission(
  state: GameState,
  opType: AgentOperationType,
  attacker: Empire,
  targetEmpire: Empire,
  units?: number,
  targetPlanet?: Planet,
): OperationResult {
  if (!isAgentOperationType(opType)) {
    return { success: false, message: 'Unknown operation' };
  }
  if (requiresAgentTargetPlanet(opType) && targetPlanet === undefined) {
    return { success: false, message: 'No target planet selected' };
  }
  return launchMission(state, { kind: 'agent', opType }, attacker, targetEmpire, units, targetPlanet);
}

/** Launch a wizard mission. Validates fully before spending octarine or committing wizards. */
export function launchWizardMission(
  state: GameState,
  spellType: SpellType,
  attacker: Empire,
  targetEmpire: Empire,
  units?: number,
  targetPlanet?: Planet,
): OperationResult {
  if (!isSpellType(spellType)) {
    return { success: false, message: 'Unknown spell' };
  }
  if (requiresSpellTargetPlanet(spellType) && targetPlanet === undefined) {
    return { success: false, message: 'No target planet selected' };
  }
  return launchMission(state, { kind: 'wizard', opType: spellType }, attacker, targetEmpire, units, targetPlanet);
}

type MissionOp = { kind: 'agent'; opType: AgentOperationType } | { kind: 'wizard'; opType: SpellType };

function launchMission(
  state: GameState,
  op: MissionOp,
  attacker: Empire,
  targetEmpire: Empire,
  requestedUnits: number | undefined,
  targetPlanet: Planet | undefined,
): OperationResult {
  if (targetPlanet !== undefined && targetPlanet.ownerId !== targetEmpire.id) {
    return { success: false, message: 'Target planet is not owned by target empire' };
  }

  const isAgent = op.kind === 'agent';
  const unitLabel = isAgent ? 'agents' : 'wizards';
  const cost = isAgent ? getAgentOperationCost(state, attacker) : getSpellCost(state, attacker);
  const available = isAgent ? getTotalAgents(state, attacker) : getTotalWizards(state, attacker);
  if (isAgent ? attacker.resources.gc < cost : attacker.resources.octarine < cost) {
    return { success: false, message: `Not enough ${isAgent ? 'GC' : 'Octarine'} (${cost} needed)` };
  }
  if (available <= 0) {
    return { success: false, message: `No ${unitLabel} available` };
  }

  const units = requestedUnits ?? available;
  if (!Number.isInteger(units) || units < 1 || units > available) {
    return { success: false, message: `Commit between 1 and ${available} ${unitLabel}` };
  }
  if (getActiveMissionCount(attacker, op.kind) >= MAX_ACTIVE_MISSIONS) {
    return { success: false, message: `Already running ${MAX_ACTIVE_MISSIONS} ${isAgent ? 'agent' : 'wizard'} missions` };
  }

  // Validation complete — mutate.
  if (isAgent) attacker.resources.gc -= cost;
  else attacker.resources.octarine -= cost;
  removeUnitsFromPlanets(state, attacker, isAgent ? 'agent' : 'wizard', units);

  const ticks = getMissionDuration(state, op.kind, attacker, targetEmpire, targetPlanet);
  const base = {
    id: state.nextMissionId,
    targetEmpireId: targetEmpire.id,
    targetPlanetId: targetPlanet?.id,
    units,
    ticksRemaining: ticks,
    launchedTick: state.currentTick,
  };
  attacker.missions.push(op.kind === 'agent' ? { ...base, kind: 'agent', opType: op.opType } : { ...base, kind: 'wizard', opType: op.opType });
  state.nextMissionId += 1;

  const defenderCount = isAgent ? getTotalAgents(state, targetEmpire) : getTotalWizards(state, targetEmpire);
  if (rollFloat(state) < getDetectionChance(units, defenderCount)) {
    notifyDefender(
      state,
      targetEmpire,
      `Enemy ${unitLabel} from ${attacker.empireName} detected! Expected in ${ticks} tick${ticks === 1 ? '' : 's'}.`,
    );
  }

  const name = isAgent ? agentOpName(op.opType as AgentOperationType) : spellName(op.opType as SpellType);
  return {
    success: true,
    message: `${name} mission launched with ${units} ${unitLabel} against ${targetEmpire.empireName}. Arrives in ${ticks} tick${ticks === 1 ? '' : 's'}.`,
  };
}

/** Advance all in-flight missions one tick and resolve the ones that arrive. Called from the tick loop. */
export function advanceOpsMissions(state: GameState): void {
  for (const attacker of state.empires) {
    if (attacker.missions.length === 0) continue;
    const pending: OpsMission[] = [];
    const arrived: OpsMission[] = [];
    for (const mission of attacker.missions) {
      mission.ticksRemaining -= 1;
      (mission.ticksRemaining <= 0 ? arrived : pending).push(mission);
    }
    attacker.missions = pending;
    for (const mission of arrived) {
      resolveMission(state, attacker, mission);
    }
  }
}

function resolveMission(state: GameState, attacker: Empire, mission: OpsMission): void {
  const isAgent = mission.kind === 'agent';
  const unitKey = isAgent ? 'agent' : 'wizard';
  const name = isAgent ? agentOpName(mission.opType) : spellName(mission.opType);
  const targetEmpire = getEmpire(state, mission.targetEmpireId);
  const targetPlanet = mission.targetPlanetId === undefined ? undefined : getPlanet(state, mission.targetPlanetId);

  if (
    targetEmpire === undefined ||
    targetEmpire.isEliminated ||
    (mission.targetPlanetId !== undefined && (targetPlanet === undefined || targetPlanet.ownerId !== targetEmpire.id))
  ) {
    const returned = returnUnitsHome(state, attacker, unitKey, mission.units);
    notifyAttacker(state, attacker, `${name} mission aborted — target no longer valid. ${returned} ${unitKey}${returned === 1 ? '' : 's'} returned.`);
    return;
  }

  const defenderCount = isAgent ? getTotalAgents(state, targetEmpire) : getTotalWizards(state, targetEmpire);
  const chance = getSuccessChance(
    mission.units,
    defenderCount,
    calcEmpireNetworth(state, attacker.id),
    calcEmpireNetworth(state, targetEmpire.id),
    isAgent ? AGENT_OP_DIFFICULTY[mission.opType] : SPELL_DIFFICULTY[mission.opType],
  );

  if (rollFloat(state) > chance) {
    const lost = Math.min(Math.max(Math.trunc(mission.units * FAILURE_LOSS_RATE), 1), mission.units);
    returnUnitsHome(state, attacker, unitKey, mission.units - lost);
    notifyAttacker(
      state,
      attacker,
      `${name} failed against ${targetEmpire.empireName}! (${Math.trunc(chance * 100)}% chance) Lost ${lost} ${unitKey}${lost === 1 ? '' : 's'}.`,
    );
    return;
  }

  returnUnitsHome(state, attacker, unitKey, mission.units);
  const result = mission.kind === 'agent'
    ? applyAgentEffect(state, mission.opType, targetEmpire, targetPlanet)
    : applySpellEffect(state, mission.opType, targetEmpire, targetPlanet);
  notifyAttacker(state, attacker, result.message);
}

function applyAgentEffect(state: GameState, opType: AgentOperationType, target: Empire, targetPlanet?: Planet): OperationResult {
  switch (opType) {
    case 'spy':
      return spy(state, target);
    case 'destroy_cash':
      return destroyCash(state, target);
    case 'destroy_units':
      return targetPlanet === undefined ? { success: false, message: 'No target planet selected' } : destroyUnits(state, targetPlanet);
    case 'sabotage_portal':
      return targetPlanet === undefined ? { success: false, message: 'No target planet selected' } : sabotagePortal(state, target, targetPlanet);
  }
}

function applySpellEffect(state: GameState, spellType: SpellType, target: Empire, targetPlanet?: Planet): OperationResult {
  switch (spellType) {
    case 'vision':
      return vision(state, target);
    case 'hypnotize':
      return targetPlanet === undefined ? { success: false, message: 'No target planet selected' } : hypnotize(state, targetPlanet);
    case 'reduce_food':
      return reduceFood(state, target);
    case 'destroy_iron':
      return destroyIron(state, target);
  }
}

function removeUnitsFromPlanets(state: GameState, empire: Empire, unit: 'agent' | 'wizard', count: number): void {
  let remaining = count;
  for (const planet of getPlanetsForEmpire(state, empire.id)) {
    if (remaining <= 0) break;
    const onPlanet = planet.units[unit] ?? 0;
    if (onPlanet > 0) {
      const take = Math.min(onPlanet, remaining);
      planet.units[unit] = onPlanet - take;
      remaining -= take;
    }
  }
}

/** Return surviving mission units to the home planet (or any owned planet). Returns the count returned. */
function returnUnitsHome(state: GameState, empire: Empire, unit: 'agent' | 'wizard', count: number): number {
  if (count <= 0) return 0;
  const home = getPlanet(state, empire.homePlanetId);
  const destination = home !== undefined && home.ownerId === empire.id ? home : getPlanetsForEmpire(state, empire.id)[0];
  if (destination === undefined) return 0;
  destination.units[unit] = (destination.units[unit] ?? 0) + count;
  return count;
}

function resourceSummary(target: Empire): string {
  return `GC: ${target.resources.gc}, Food: ${target.resources.food}, Iron: ${target.resources.iron}, End: ${target.resources.endurium}, Oct: ${target.resources.octarine}`;
}

function spy(state: GameState, target: Empire): OperationResult {
  const planets = getPlanetsForEmpire(state, target.id);
  return { success: true, message: `SPY on ${target.empireName}: ${planets.length} planets, ${resourceSummary(target)}` };
}

function vision(state: GameState, target: Empire): OperationResult {
  const planets = getPlanetsForEmpire(state, target.id);
  const military: Partial<Record<CombatUnitKey, number>> = {};
  const add = (units: Partial<Record<CombatUnitKey, number>>) => {
    for (const key of COMBAT_UNIT_KEYS) military[key] = (military[key] ?? 0) + (units[key] ?? 0);
  };
  for (const planet of planets) add(planet.units);
  for (const fleet of state.fleets) {
    if (fleet.ownerId === target.id && !fleet.isExploration) add(fleet.units);
  }
  const militaryText = COMBAT_UNIT_KEYS.map((key) => `${military[key] ?? 0} ${UNITS[key].name}`).join(', ');
  const missions = target.missions.length;
  return {
    success: true,
    message: `VISION on ${target.empireName}: ${planets.length} planets, ${resourceSummary(target)}. Military: ${militaryText}. Active ops missions: ${missions}.`,
  };
}

function destroyCash(state: GameState, target: Empire): OperationResult {
  const pct = rollRange(state, 0.03, 0.1);
  const destroyed = Math.trunc(target.resources.gc * pct);
  target.resources.gc -= destroyed;
  notifyDefender(state, target, `Enemy agents destroyed ${destroyed} of your GC!`);
  return { success: true, message: `Destroyed ${destroyed} GC (${Math.trunc(pct * 100)}%) from ${target.empireName}` };
}

function destroyUnits(state: GameState, targetPlanet: Planet): OperationResult {
  const candidates = COMBAT_UNIT_KEYS.filter((unit) => (targetPlanet.units[unit] ?? 0) > 0);
  if (candidates.length === 0) {
    return { success: true, message: `No units found on ${targetPlanet.planetName}` };
  }

  const chosen = candidates[Math.trunc(rollFloat(state) * candidates.length)] ?? candidates[0];
  const count = targetPlanet.units[chosen] ?? 0;
  const destroyed = Math.max(Math.trunc(count * 0.3), 1);
  targetPlanet.units[chosen] = count - destroyed;
  const owner = state.empires.find((empire) => empire.id === targetPlanet.ownerId);
  if (owner !== undefined) {
    notifyDefender(state, owner, `Enemy agents destroyed ${destroyed} ${UNITS[chosen].name} on ${targetPlanet.planetName}!`);
  }
  return { success: true, message: `Destroyed ${destroyed} ${UNITS[chosen].name} on ${targetPlanet.planetName}` };
}

function sabotagePortal(state: GameState, targetEmpire: Empire, targetPlanet: Planet): OperationResult {
  if (!targetPlanet.hasPortal) {
    return { success: true, message: `${targetPlanet.planetName} has no portal to sabotage` };
  }

  targetEmpire.debuffs.push({ type: 'portal_disabled', ticksRemaining: 20, value: 0, planetId: targetPlanet.id });
  targetPlanet.hasPortal = false;
  notifyDefender(state, targetEmpire, `Your portal on ${targetPlanet.planetName} was sabotaged! Disabled for 20 ticks.`);
  return { success: true, message: `Sabotaged portal on ${targetPlanet.planetName} (disabled 20 ticks)` };
}

function hypnotize(state: GameState, targetPlanet: Planet): OperationResult {
  const killed = Math.max(Math.trunc(targetPlanet.population * 0.3), 1);
  targetPlanet.population = Math.max(targetPlanet.population - killed, 0);
  const owner = state.empires.find((empire) => empire.id === targetPlanet.ownerId);
  if (owner !== undefined) {
    notifyDefender(state, owner, `Enemy wizards hypnotized ${targetPlanet.planetName}! ${killed} population killed!`);
  }
  return { success: true, message: `Hypnotized ${targetPlanet.planetName}! ${killed} population killed (30%)` };
}

export const REDUCE_FOOD_PCT = 0.2;
export const REDUCE_FOOD_TICKS = 15;
export const REDUCE_FOOD_MAX_STACKS = 2;

function reduceFood(state: GameState, target: Empire): OperationResult {
  const existing = target.debuffs.filter((debuff) => debuff.type === 'reduced_food').length;
  if (existing >= REDUCE_FOOD_MAX_STACKS) {
    return { success: true, message: `Reduce Food on ${target.empireName} already at max stacks` };
  }

  const pct = Math.trunc(REDUCE_FOOD_PCT * 100);
  target.debuffs.push({ type: 'reduced_food', ticksRemaining: REDUCE_FOOD_TICKS, value: REDUCE_FOOD_PCT });
  notifyDefender(state, target, `Enemy wizards reduced your food production by ${pct}% for ${REDUCE_FOOD_TICKS} ticks!`);
  return { success: true, message: `Reduced food production on ${target.empireName} by ${pct}% for ${REDUCE_FOOD_TICKS} ticks` };
}

function destroyIron(state: GameState, target: Empire): OperationResult {
  const pct = rollRange(state, 0.08, 0.15);
  const destroyed = Math.trunc(target.resources.iron * pct);
  target.resources.iron -= destroyed;
  notifyDefender(state, target, `Enemy wizards destroyed ${destroyed} of your iron!`);
  return { success: true, message: `Destroyed ${destroyed} iron (${Math.trunc(pct * 100)}%) from ${target.empireName}` };
}

function notifyDefender(state: GameState, defender: Empire, message: string): void {
  if (defender.controllerType === 'human') {
    appendEvent(state, { type: 'notification', tick: state.currentTick, category: 'ops', message, empireId: defender.id });
  }
}

function notifyAttacker(state: GameState, attacker: Empire, message: string): void {
  if (attacker.controllerType === 'human') {
    appendEvent(state, { type: 'notification', tick: state.currentTick, category: 'ops', message, empireId: attacker.id });
  }
}

export function agentOpName(opType: AgentOperationType): string {
  return opType === 'spy' ? 'Spy' : opType === 'destroy_cash' ? 'Destroy Cash' : opType === 'destroy_units' ? 'Destroy Units' : 'Sabotage Portal';
}

export function spellName(spellType: SpellType): string {
  return spellType === 'vision' ? 'Vision' : spellType === 'hypnotize' ? 'Hypnotize' : spellType === 'reduce_food' ? 'Reduce Food' : 'Destroy Iron';
}

function isAgentOperationType(opType: string): opType is AgentOperationType {
  return opType === 'spy' || opType === 'destroy_cash' || opType === 'destroy_units' || opType === 'sabotage_portal';
}

function isSpellType(spellType: string): spellType is SpellType {
  return spellType === 'vision' || spellType === 'hypnotize' || spellType === 'reduce_food' || spellType === 'destroy_iron';
}

export function requiresAgentTargetPlanet(opType: AgentOperationType): boolean {
  return opType === 'destroy_units' || opType === 'sabotage_portal';
}

export function requiresSpellTargetPlanet(spellType: SpellType): boolean {
  return spellType === 'hypnotize';
}

function rollFloat(state: GameState): number {
  return state.rng?.float() ?? missingRng();
}

function rollRange(state: GameState, min: number, max: number): number {
  return state.rng?.floatRange(min, max) ?? missingRng();
}

function missingRng(): never {
  throw new Error('GameState RNG is not initialized.');
}
