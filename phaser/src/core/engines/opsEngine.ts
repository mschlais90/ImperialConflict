import { UNITS } from '../data/units';
import { appendEvent } from '../events/eventLog';
import type { GameState } from '../galaxy/galaxyData';
import type { CombatUnitKey, Empire, Planet } from '../models/types';
import { calcEmpireNetworth, getPlanetsForEmpire } from '../selectors/selectors';

export type AgentOperationType = 'spy' | 'destroy_cash' | 'destroy_units' | 'sabotage_portal';
export type SpellType = 'vision' | 'hypnotize' | 'reduce_food' | 'destroy_iron';
export type OperationResult = { success: true; message: string } | { success: false; message: string };

const COMBAT_UNIT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];

export function getAgentOperationCost(state: GameState, attacker: Empire): number {
  return Math.max(Math.trunc(calcEmpireNetworth(state, attacker.id) / 15), 10);
}

export function getSpellCost(state: GameState, attacker: Empire): number {
  return Math.max(Math.trunc(calcEmpireNetworth(state, attacker.id) / 20), 5);
}

export function getSuccessChance(attackerCount: number, defenderCount: number, attackerNetworth: number, defenderNetworth: number): number {
  if (attackerCount <= 0) {
    return 0;
  }

  const networthFactor = Math.max(1, defenderNetworth / Math.max(attackerNetworth, 1));
  const chance = attackerCount / (attackerCount + defenderCount * networthFactor);
  return Math.min(Math.max(chance, 0.1), 0.9);
}

export function getTotalAgents(state: GameState, empire: Empire): number {
  return getPlanetsForEmpire(state, empire.id).reduce((total, planet) => total + (planet.units.agent ?? 0), 0);
}

export function getTotalWizards(state: GameState, empire: Empire): number {
  return getPlanetsForEmpire(state, empire.id).reduce((total, planet) => total + (planet.units.wizard ?? 0), 0);
}

export function performAgentOp(
  state: GameState,
  opType: AgentOperationType,
  attacker: Empire,
  targetEmpire: Empire,
  targetPlanet?: Planet,
): OperationResult {
  if (!isAgentOperationType(opType)) {
    return { success: false, message: 'Unknown operation' };
  }

  const cost = getAgentOperationCost(state, attacker);
  if (attacker.resources.gc < cost) {
    return { success: false, message: `Not enough GC (${cost} needed)` };
  }

  const attackerAgents = getTotalAgents(state, attacker);
  if (attackerAgents <= 0) {
    return { success: false, message: 'No agents available' };
  }

  attacker.resources.gc -= cost;
  const chance = getSuccessChance(
    attackerAgents,
    getTotalAgents(state, targetEmpire),
    calcEmpireNetworth(state, attacker.id),
    calcEmpireNetworth(state, targetEmpire.id),
  );

  if (rollFloat(state) > chance) {
    return { success: false, message: `${agentOpName(opType)} failed! (${Math.trunc(chance * 100)}% chance)` };
  }

  switch (opType) {
    case 'spy':
      return spy(state, targetEmpire, 'SPY');
    case 'destroy_cash':
      return destroyCash(state, targetEmpire);
    case 'destroy_units':
      return targetPlanet === undefined ? { success: false, message: 'No target planet selected' } : destroyUnits(state, targetPlanet);
    case 'sabotage_portal':
      return targetPlanet === undefined
        ? { success: false, message: 'No target planet selected' }
        : sabotagePortal(state, targetEmpire, targetPlanet);
  }
}

export function performWizardSpell(
  state: GameState,
  spellType: SpellType,
  attacker: Empire,
  targetEmpire: Empire,
  targetPlanet?: Planet,
): OperationResult {
  if (!isSpellType(spellType)) {
    return { success: false, message: 'Unknown spell' };
  }

  const cost = getSpellCost(state, attacker);
  if (attacker.resources.octarine < cost) {
    return { success: false, message: `Not enough Octarine (${cost} needed)` };
  }

  const attackerWizards = getTotalWizards(state, attacker);
  if (attackerWizards <= 0) {
    return { success: false, message: 'No wizards available' };
  }

  attacker.resources.octarine -= cost;
  const chance = getSuccessChance(
    attackerWizards,
    getTotalWizards(state, targetEmpire),
    calcEmpireNetworth(state, attacker.id),
    calcEmpireNetworth(state, targetEmpire.id),
  );

  if (rollFloat(state) > chance) {
    return { success: false, message: `${spellName(spellType)} failed! (${Math.trunc(chance * 100)}% chance)` };
  }

  switch (spellType) {
    case 'vision':
      return spy(state, targetEmpire, 'VISION');
    case 'hypnotize':
      return targetPlanet === undefined ? { success: false, message: 'No target planet selected' } : hypnotize(state, targetPlanet);
    case 'reduce_food':
      return reduceFood(state, targetEmpire);
    case 'destroy_iron':
      return destroyIron(state, targetEmpire);
  }
}

function spy(state: GameState, target: Empire, label: 'SPY' | 'VISION'): OperationResult {
  const planets = getPlanetsForEmpire(state, target.id);
  return {
    success: true,
    message: `${label} on ${target.empireName}: ${planets.length} planets, GC: ${target.resources.gc}, Food: ${target.resources.food}, Iron: ${target.resources.iron}, End: ${target.resources.endurium}, Oct: ${target.resources.octarine}`,
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

function reduceFood(state: GameState, target: Empire): OperationResult {
  const existing = target.debuffs.filter((debuff) => debuff.type === 'reduced_food').length;
  if (existing >= 3) {
    return { success: true, message: `Reduce Food on ${target.empireName} already at max stacks` };
  }

  target.debuffs.push({ type: 'reduced_food', ticksRemaining: 8, value: 0.1 });
  notifyDefender(state, target, 'Enemy wizards reduced your food production by 10% for 8 ticks!');
  return { success: true, message: `Reduced food production on ${target.empireName} by 10% for 8 ticks` };
}

function destroyIron(state: GameState, target: Empire): OperationResult {
  const pct = rollRange(state, 0.03, 0.1);
  const destroyed = Math.trunc(target.resources.iron * pct);
  target.resources.iron -= destroyed;
  notifyDefender(state, target, `Enemy wizards destroyed ${destroyed} of your iron!`);
  return { success: true, message: `Destroyed ${destroyed} iron (${Math.trunc(pct * 100)}%) from ${target.empireName}` };
}

function notifyDefender(state: GameState, defender: Empire, message: string): void {
  if (defender.isPlayer) {
    appendEvent(state, { type: 'notification', tick: state.currentTick, category: 'ops', message });
  }
}

function agentOpName(opType: AgentOperationType): string {
  return opType === 'spy' ? 'Spy' : opType === 'destroy_cash' ? 'Destroy Cash' : opType === 'destroy_units' ? 'Destroy Units' : 'Sabotage Portal';
}

function spellName(spellType: SpellType): string {
  return spellType === 'vision' ? 'Vision' : spellType === 'hypnotize' ? 'Hypnotize' : spellType === 'reduce_food' ? 'Reduce Food' : 'Destroy Iron';
}

function isAgentOperationType(opType: string): opType is AgentOperationType {
  return opType === 'spy' || opType === 'destroy_cash' || opType === 'destroy_units' || opType === 'sabotage_portal';
}

function isSpellType(spellType: string): spellType is SpellType {
  return spellType === 'vision' || spellType === 'hypnotize' || spellType === 'reduce_food' || spellType === 'destroy_iron';
}

function rollFloat(state: GameState): number {
  return state.rng?.float() ?? 0;
}

function rollRange(state: GameState, min: number, max: number): number {
  return state.rng?.floatRange(min, max) ?? min;
}
