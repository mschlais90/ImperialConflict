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

/**
 * Dual proxy: runs the command locally for instant UI feedback, then sends
 * it to the server for authoritative processing. Server state reconciles
 * on the next tick broadcast.
 */
export function createDualCommandProxy(local: CommandProxy, client: MultiplayerClient): CommandProxy {
  function dual<T>(localFn: (input: T) => CommandResult, sendFn: (input: T) => CommandResult): (input: T) => CommandResult {
    return (input: T) => {
      const result = localFn(input);
      if (result.ok) {
        sendFn(input);
      }
      return result;
    };
  }

  const remote = createRemoteCommandProxy(client);
  return {
    queueBuilding: dual(local.queueBuilding, remote.queueBuilding),
    queueExplorer: dual(local.queueExplorer, remote.queueExplorer),
    trainUnits: dual(local.trainUnits, remote.trainUnits),
    sendFleet: dual(local.sendFleet, remote.sendFleet),
    sendPortalFleet: dual(local.sendPortalFleet, remote.sendPortalFleet),
    sendExplorer: dual(local.sendExplorer, remote.sendExplorer),
    recallToPortal: dual(local.recallToPortal, remote.recallToPortal),
    setResearchAllocation: dual(local.setResearchAllocation, remote.setResearchAllocation),
    performAgentOperation: dual(local.performAgentOperation, remote.performAgentOperation),
    performSpell: dual(local.performSpell, remote.performSpell),
  };
}
