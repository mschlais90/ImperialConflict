import type { AppController } from '../app/appController';
import type { CommandResult } from '../core/commands/playerCommands';
import type { Empire } from '../core/models/types';
import type { CommandProxy } from '../net/commandProxy';

export interface UiContext {
  controller: AppController;
  player: Empire;
  commands: CommandProxy;
  runCommand: (command: () => CommandResult) => void;
  setNotice: (message: string, isError?: boolean, rerender?: boolean) => void;
  /** Empire IDs of players currently disconnected (multiplayer only). */
  disconnectedPlayers: ReadonlySet<number>;
}
