import './styles.css';
import Phaser from 'phaser';
import { APP_CONTROLLER_KEY, type AppController } from './app/appController';
import { advanceTick } from './core/engines/tickEngine';
import { BootScene } from './scenes/BootScene';
import { GalaxyScene } from './scenes/GalaxyScene';
import { SystemScene } from './scenes/SystemScene';
import { createOverlay } from './ui/overlay';

const BASE_TICK_SECONDS = 8;
const MAX_FRAME_SECONDS = 0.25;

declare global {
  interface Window {
    imperialConflictDebug?: { controller: AppController; game: Phaser.Game };
    imperialConflictCleanup?: () => void;
  }
}

window.imperialConflictCleanup?.();

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
  clientState: null,
  overlay: {
    render: () => undefined,
    refreshAfterTick: () => undefined,
    showStartScreen: () => undefined,
    showGameOver: () => undefined,
  },
  refreshScene: null,
  startNewGame: null,
  loadGame: null,
  activeScene: 'galaxy',
  switchToGalaxy: null,
  isMultiplayer: false,
  isHost: false,
  multiplayerClient: null,
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
if (import.meta.env.DEV) {
  window.imperialConflictDebug = { controller, game };
}

const stopAppTimer = startAppTimer(controller);
const cleanup = () => {
  stopAppTimer();
  game.destroy(true);
  if (window.imperialConflictDebug?.game === game) {
    delete window.imperialConflictDebug;
  }
  if (window.imperialConflictCleanup === cleanup) {
    delete window.imperialConflictCleanup;
  }
};
window.imperialConflictCleanup = cleanup;
import.meta.hot?.dispose(cleanup);

function startAppTimer(appController: AppController): () => void {
  let lastTimestamp: number | null = null;
  let accumulatedScaledSeconds = 0;
  let animationFrameId = 0;
  let isStopped = false;

  const scheduleNextFrame = () => {
    animationFrameId = requestAnimationFrame(frame);
  };

  const frame = (timestamp: number) => {
    if (isStopped) {
      return;
    }

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
      scheduleNextFrame();
      return;
    }

    const elapsedSeconds = Math.min((timestamp - lastTimestamp) / 1_000, MAX_FRAME_SECONDS);
    lastTimestamp = timestamp;

    const state = appController.state;
    if (!state || state.currentState !== 'playing' || state.currentSpeed <= 0 || appController.isMultiplayer) {
      accumulatedScaledSeconds = 0;
      scheduleNextFrame();
      return;
    }

    accumulatedScaledSeconds += elapsedSeconds * state.currentSpeed;

    if (accumulatedScaledSeconds >= BASE_TICK_SECONDS) {
      accumulatedScaledSeconds -= BASE_TICK_SECONDS;
      advanceTick(state);
      appController.overlay.refreshAfterTick();
      appController.refreshScene?.();
    }

    scheduleNextFrame();
  };

  scheduleNextFrame();

  return () => {
    isStopped = true;
    cancelAnimationFrame(animationFrameId);
  };
}
