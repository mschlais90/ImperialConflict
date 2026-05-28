import type { CommandResult } from '../core/commands/playerCommands';
import {
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
import type { GameState } from '../core/galaxy/galaxyData';
import type { SerializedCommand } from '../core/protocol/messages';

export function executeCommand(state: GameState, command: SerializedCommand): CommandResult {
  switch (command.type) {
    case 'queueBuilding':
      return queueBuilding(state, command);
    case 'queueExplorer':
      return queueExplorer(state, command);
    case 'trainUnits':
      return trainUnits(state, command);
    case 'sendFleet':
      return sendFleet(state, command);
    case 'sendPortalFleet':
      return sendPortalFleet(state, command);
    case 'sendExplorer':
      return sendExplorer(state, command);
    case 'recallToPortal':
      return recallToPortal(state, command);
    case 'setResearchAllocation':
      return setResearchAllocation(state, command);
    case 'performAgentOperation':
      return performAgentOperation(state, command);
    case 'performSpell':
      return performSpell(state, command);
  }
}
