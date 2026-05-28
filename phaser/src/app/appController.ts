import type { GameState } from '../core/galaxy/galaxyData';

export interface ClientState {
  empireId: number;
  selectedSystemId: number | null;
  selectedPlanetId: number | null;
  selectedFleetId: number | null;
}

export interface AppOverlay {
  render: () => void;
  refreshAfterTick: () => void;
  showStartScreen: () => void;
  showGameOver: (playerWon: boolean) => void;
}

export interface AppController {
  playerName: string;
  state: GameState | null;
  clientState: ClientState | null;
  overlay: AppOverlay;
  refreshScene: (() => void) | null;
  startNewGame: ((empireName: string) => void) | null;
  loadGame: ((state: GameState) => void) | null;
  activeScene: 'galaxy' | 'system';
  switchToGalaxy: (() => void) | null;
}

export const APP_CONTROLLER_KEY = 'appController';
