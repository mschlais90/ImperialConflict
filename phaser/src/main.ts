import './styles.css';
import Phaser from 'phaser';
import type { GameState } from './core/galaxy/galaxyData';
import { BootScene } from './scenes/BootScene';
import { GalaxyScene } from './scenes/GalaxyScene';
import { SystemScene } from './scenes/SystemScene';

export interface AppOverlay {
  render: () => void;
}

export interface AppController {
  playerName: string;
  state: GameState | null;
  overlay: AppOverlay;
}

export const APP_CONTROLLER_KEY = 'appController';

const gameRoot = document.querySelector<HTMLDivElement>('#game');
const uiRoot = document.querySelector<HTMLDivElement>('#ui-root');

if (!gameRoot) {
  throw new Error('Missing #game');
}

if (!uiRoot) {
  throw new Error('Missing #ui-root');
}

uiRoot.innerHTML = '';

const controller: AppController = {
  playerName: 'Player Empire',
  state: null,
  overlay: {
    render: () => undefined,
  },
};

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: gameRoot,
  width: 1280,
  height: 720,
  backgroundColor: '#030610',
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: gameRoot,
    width: 1280,
    height: 720,
  },
  scene: [BootScene, GalaxyScene, SystemScene],
};

const game = new Phaser.Game(config);
game.registry.set(APP_CONTROLLER_KEY, controller);
