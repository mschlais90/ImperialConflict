import type { GameState } from '../core/galaxy/galaxyData';
import type { MultiplayerClient } from '../net/multiplayerClient';

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
  startNewGame: ((empireName: string, difficulty: 'easy' | 'normal' | 'hard') => void) | null;
  loadGame: ((state: GameState) => void) | null;
  activeScene: 'galaxy' | 'system';
  switchToGalaxy: (() => void) | null;
  navigateToSystem: ((systemId: number) => void) | null;
  isMultiplayer: boolean;
  isHost: boolean;
  multiplayerClient: MultiplayerClient | null;
}

export const APP_CONTROLLER_KEY = 'appController';
