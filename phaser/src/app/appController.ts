import type { GameState } from '../core/galaxy/galaxyData';

export interface AppOverlay {
  render: () => void;
}

export interface AppController {
  playerName: string;
  state: GameState | null;
  overlay: AppOverlay;
}

export const APP_CONTROLLER_KEY = 'appController';
