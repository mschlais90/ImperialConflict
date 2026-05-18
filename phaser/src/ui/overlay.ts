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
  renderAfterTick(): void;
  showStartScreen(): void;
  showGameOver(playerWon: boolean): void;
}

export function createOverlay(root: HTMLElement, controller: AppController): OverlayApi {
  let notice: { message: string; isError: boolean } | null = null;
  let forcedGameOver: boolean | null = null;

  const overlay: AppOverlay = {
    render,
    renderAfterTick,
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

  function renderAfterTick(): void {
    notice = null;
    render();
  }

  function render(): void {
    clearElement(root);
    const state = controller.state;
    const gameOverEvent = state ? [...state.events].reverse().find((event) => event.type === 'game_over') : undefined;
    const playerWon = forcedGameOver ?? (gameOverEvent?.type === 'game_over' ? gameOverEvent.playerWon : null);

    if (!state || state.currentState === 'main_menu') {
      showStartScreen();
      return;
    }

    const player = getPlayerEmpire(state);
    if (!player) {
      root.append(errorPanel('Player empire not found.'));
      return;
    }

    const context: UiContext = {
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

    const shell = document.createElement('div');
    shell.className = 'overlay-shell';
    shell.append(renderHud(context));

    const body = document.createElement('div');
    body.className = 'overlay-body';
    const left = document.createElement('div');
    left.className = 'overlay-left';
    left.append(renderPlanetPanel(context));
    const right = document.createElement('div');
    right.className = 'overlay-right';
    right.append(renderFleetPanel(context), renderResearchPanel(context), renderNotifications(state.events, notice));
    body.append(left, right);
    shell.append(body);
    root.append(shell);

    if (playerWon !== null || state.currentState === 'game_over') {
      root.append(gameOverPanel(playerWon ?? false));
    }
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
