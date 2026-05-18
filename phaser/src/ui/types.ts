import type { AppController } from '../app/appController';
import type { CommandResult } from '../core/commands/playerCommands';
import type { Empire } from '../core/models/types';

export interface UiContext {
  controller: AppController;
  player: Empire;
  runCommand: (command: () => CommandResult) => void;
  setNotice: (message: string, isError?: boolean) => void;
}
