import type { AgentOperationType, SpellType } from '../core/engines/opsEngine';
import type { GameState } from '../core/galaxy/galaxyData';
import type { BuildingKey, CombatUnitKey, ScienceKey, UnitKey } from '../core/models/types';
import {
  type CommandResult,
  performAgentOperation,
  performSpell,
  queueBuilding,
  queueExplorer,
  recallToPortal,
  sendExplorer,
  sendFleet,
  sendPortalFleet,
  setResearchAllocation,
  trainUnits,
} from '../core/commands/playerCommands';

export interface CommandProxy {
  queueBuilding(input: { empireId: number; planetId: number; buildingType: BuildingKey; count: number }): CommandResult;
  queueExplorer(input: { empireId: number; planetId: number; count: number }): CommandResult;
  trainUnits(input: { empireId: number; planetId: number; unitType: Exclude<UnitKey, 'explorer'>; count: number }): CommandResult;
  sendFleet(input: { empireId: number; sourcePlanetId: number; targetPlanetId: number; units: Partial<Record<CombatUnitKey, number>> }): CommandResult;
  sendPortalFleet(input: { empireId: number; targetPlanetId: number; units: Partial<Record<CombatUnitKey, number>> }): CommandResult;
  sendExplorer(input: { empireId: number; sourcePlanetId: number; targetPlanetId: number }): CommandResult;
  recallToPortal(input: { empireId: number; sourcePlanetId: number }): CommandResult;
  setResearchAllocation(input: { empireId: number; allocation: Record<ScienceKey, number> }): CommandResult;
  performAgentOperation(input: { empireId: number; targetEmpireId: number; operationType: AgentOperationType; targetPlanetId?: number }): CommandResult;
  performSpell(input: { empireId: number; targetEmpireId: number; spellType: SpellType; targetPlanetId?: number }): CommandResult;
}

export function createLocalCommandProxy(getState: () => GameState): CommandProxy {
  return {
    queueBuilding: (input) => queueBuilding(getState(), input),
    queueExplorer: (input) => queueExplorer(getState(), input),
    trainUnits: (input) => trainUnits(getState(), input),
    sendFleet: (input) => sendFleet(getState(), input),
    sendPortalFleet: (input) => sendPortalFleet(getState(), input),
    sendExplorer: (input) => sendExplorer(getState(), input),
    recallToPortal: (input) => recallToPortal(getState(), input),
    setResearchAllocation: (input) => setResearchAllocation(getState(), input),
    performAgentOperation: (input) => performAgentOperation(getState(), input),
    performSpell: (input) => performSpell(getState(), input),
  };
}
