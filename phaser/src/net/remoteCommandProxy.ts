import type { CommandResult } from '../core/commands/playerCommands';
import type { SerializedCommand } from '../core/protocol/messages';
import type { MultiplayerClient } from './multiplayerClient';
import type { CommandProxy } from './commandProxy';

/**
 * CommandProxy that serializes commands and sends them to the server.
 * Returns an optimistic "sent" result immediately; the actual result
 * arrives asynchronously via the onCommandResult callback.
 */
export function createRemoteCommandProxy(client: MultiplayerClient): CommandProxy {
  function send(command: SerializedCommand): CommandResult {
    client.sendCommand(command);
    return { ok: true, message: 'Command sent.' };
  }

  return {
    queueBuilding: (input) => send({ type: 'queueBuilding', ...input }),
    queueExplorer: (input) => send({ type: 'queueExplorer', ...input }),
    trainUnits: (input) => send({ type: 'trainUnits', ...input }),
    sendFleet: (input) => send({ type: 'sendFleet', ...input }),
    sendPortalFleet: (input) => send({ type: 'sendPortalFleet', ...input }),
    sendExplorer: (input) => send({ type: 'sendExplorer', ...input }),
    recallToPortal: (input) => send({ type: 'recallToPortal', ...input }),
    setResearchAllocation: (input) => send({ type: 'setResearchAllocation', ...input }),
    performAgentOperation: (input) => send({ type: 'performAgentOperation', ...input }),
    performSpell: (input) => send({ type: 'performSpell', ...input }),
  };
}
