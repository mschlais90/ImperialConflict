import type { AppController, AppOverlay } from '../app/appController';
import { createNewGame } from '../core/engines/gameManager';
import { getPlayerEmpire } from '../core/selectors/selectors';
import { clearElement } from './dom';
import { renderFleetPanel } from './fleetPanel';
import { renderHud } from './hud';
import { renderNotifications } from './notifications';
import { renderPlanetPanel } from './planetPanel';
import { renderResearchPanel } from './researchPanel';
import { renderStartScreen } from './startScreen';
import type { UiContext } from './types';

export interface OverlayApi {
  render(): void;
  refreshAfterTick(): void;
  showStartScreen(): void;
  showGameOver(playerWon: boolean): void;
}

export function createOverlay(root: HTMLElement, controller: AppController): OverlayApi {
  let notice: { message: string; isError: boolean } | null = null;
  let forcedGameOver: boolean | null = null;
  let hudPanel: HTMLElement | null = null;
  let leftPanel: HTMLElement | null = null;
  let rightPanel: HTMLElement | null = null;
  let notificationsPanel: HTMLElement | null = null;
  let gameOverScreen: HTMLElement | null = null;

  const overlay: AppOverlay = {
    render,
    refreshAfterTick,
    showStartScreen,
    showGameOver,
  };

  function showStartScreen(): void {
    clearElement(root);
    renderStartScreen(root, (empireName) => {
      notice = null;
      forcedGameOver = null;
      if (controller.startNewGame) {
        controller.startNewGame(empireName);
        return;
      }
      controller.playerName = empireName;
      controller.state = createNewGame({ empireName });
      render();
    });
  }

  function showGameOver(playerWon: boolean): void {
    forcedGameOver = playerWon;
    render();
  }

  function refreshAfterTick(): void {
    const state = controller.state;
    const player = state ? getPlayerEmpire(state) : undefined;
    if (!state || state.currentState === 'main_menu' || !player || !hudPanel || !notificationsPanel || !leftPanel || !rightPanel) {
      render();
      return;
    }

    const context = createContext(player);
    const nextHudPanel = renderHud(context);
    hudPanel.replaceWith(nextHudPanel);
    hudPanel = nextHudPanel;

    const nextLeftPanel = document.createElement('div');
    nextLeftPanel.className = 'overlay-left';
    nextLeftPanel.append(renderPlanetPanel(context));
    leftPanel.replaceWith(nextLeftPanel);
    leftPanel = nextLeftPanel;

    const nextNotificationsPanel = renderNotifications(state.events, notice);
    const nextRightPanel = document.createElement('div');
    nextRightPanel.className = 'overlay-right';
    nextRightPanel.append(renderFleetPanel(context), renderResearchPanel(context), nextNotificationsPanel);
    rightPanel.replaceWith(nextRightPanel);
    rightPanel = nextRightPanel;
    notificationsPanel = nextNotificationsPanel;

    syncGameOverPanel();
  }

  function render(): void {
    hudPanel = null;
    leftPanel = null;
    rightPanel = null;
    notificationsPanel = null;
    gameOverScreen = null;
    clearElement(root);
    const state = controller.state;

    if (!state || state.currentState === 'main_menu') {
      showStartScreen();
      return;
    }

    const player = getPlayerEmpire(state);
    if (!player) {
      root.append(errorPanel('Player empire not found.'));
      return;
    }

    const context = createContext(player);

    const shell = document.createElement('div');
    shell.className = 'overlay-shell';
    hudPanel = renderHud(context);
    shell.append(hudPanel);

    const body = document.createElement('div');
    body.className = 'overlay-body';
    leftPanel = document.createElement('div');
    leftPanel.className = 'overlay-left';
    leftPanel.append(renderPlanetPanel(context));
    rightPanel = document.createElement('div');
    rightPanel.className = 'overlay-right';
    notificationsPanel = renderNotifications(state.events, notice);
    rightPanel.append(renderFleetPanel(context), renderResearchPanel(context), notificationsPanel);
    body.append(leftPanel, rightPanel);
    shell.append(body);
    root.append(shell);
    syncGameOverPanel();
  }

  function createContext(player: NonNullable<ReturnType<typeof getPlayerEmpire>>): UiContext {
    return {
      controller,
      player,
      runCommand(command) {
        const result = command();
        notice = { message: result.message, isError: !result.ok };
        if (result.ok) {
          controller.refreshScene?.();
        }
        render();
      },
      setNotice(message, isError = false) {
        notice = { message, isError };
        render();
      },
    };
  }

  function syncGameOverPanel(): void {
    const state = controller.state;
    const gameOverEvent = state ? [...state.events].reverse().find((event) => event.type === 'game_over') : undefined;
    const playerWon = forcedGameOver ?? (gameOverEvent?.type === 'game_over' ? gameOverEvent.playerWon : null);

    if (playerWon === null && state?.currentState !== 'game_over') {
      gameOverScreen?.remove();
      gameOverScreen = null;
      return;
    }

    const nextGameOverScreen = gameOverPanel(playerWon ?? false);
    if (gameOverScreen) {
      gameOverScreen.replaceWith(nextGameOverScreen);
    } else {
      root.append(nextGameOverScreen);
    }
    gameOverScreen = nextGameOverScreen;
  }

  return overlay;
}

function errorPanel(message: string): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'game-over-panel interactive';
  panel.textContent = message;
  return panel;
}

function gameOverPanel(playerWon: boolean): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'game-over-screen interactive';
  const panel = document.createElement('div');
  panel.className = 'game-over-panel';
  const title = document.createElement('h2');
  title.textContent = playerWon ? 'Victory' : 'Defeat';
  const message = document.createElement('p');
  message.textContent = playerWon ? 'Your empire controls the galaxy.' : 'Your empire has fallen.';
  panel.append(title, message);
  shell.append(panel);
  return shell;
}
