import './styles.css';
import Phaser from 'phaser';
import { APP_CONTROLLER_KEY, type AppController } from './app/appController';
import { BootScene } from './scenes/BootScene';
import { GalaxyScene } from './scenes/GalaxyScene';
import { SystemScene } from './scenes/SystemScene';
import { createOverlay } from './ui/overlay';

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
    showStartScreen: () => undefined,
    showGameOver: () => undefined,
  },
  refreshScene: null,
  startNewGame: null,
};

controller.overlay = createOverlay(uiRoot, controller);

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
