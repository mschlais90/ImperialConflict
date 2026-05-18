import type { GameState } from '../core/galaxy/galaxyData';

export interface AppOverlay {
  render: () => void;
  renderAfterTick: () => void;
  showStartScreen: () => void;
  showGameOver: (playerWon: boolean) => void;
}

export interface AppController {
  playerName: string;
  state: GameState | null;
  overlay: AppOverlay;
  refreshScene: (() => void) | null;
  startNewGame: ((empireName: string) => void) | null;
}

export const APP_CONTROLLER_KEY = 'appController';
