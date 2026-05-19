import type { AppController, AppOverlay } from '../app/appController';
import { createNewGame } from '../core/engines/gameManager';
import { getPlayerEmpire } from '../core/selectors/selectors';
import { clearElement, collapsible } from './dom';
import { renderEconomyPanel } from './economyPanel';
import { renderFleetContent } from './fleetPanel';
import { renderHud } from './hud';
import { renderNotificationsContent } from './notifications';
import { renderPlanetPanel } from './planetPanel';
import { renderResearchContent } from './researchPanel';
import { renderStandingsPanel } from './standingsPanel';
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
  let gameOverScreen: HTMLElement | null = null;
  let viewMode: 'normal' | 'economy' | 'standings' = 'normal';

  const overlay: AppOverlay = {
    render,
    refreshAfterTick,
    showStartScreen,
    showGameOver,
  };

  // Global keybindings
  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement) {
      return;
    }

    const state = controller.state;
    if (!state || state.currentState === 'main_menu') return;

    switch (event.key.toLowerCase()) {
      case 'g':
        viewMode = 'normal';
        controller.switchToGalaxy?.();
        break;
      case 'e':
        viewMode = viewMode === 'economy' ? 'normal' : 'economy';
        render();
        break;
      case 'a':
        viewMode = viewMode === 'standings' ? 'normal' : 'standings';
        render();
        break;
    }
  });

  function showStartScreen(): void {
    clearElement(root);
    renderStartScreen(root, (empireName) => {
      notice = null;
      forcedGameOver = null;
      viewMode = 'normal';
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
    if (!state || state.currentState === 'main_menu' || !player || !hudPanel || !leftPanel || !rightPanel) {
      render();
      return;
    }

    // Input focus preservation: skip panel re-render when user is typing
    const activeEl = document.activeElement;
    const leftHasFocus = leftPanel.contains(activeEl) && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLSelectElement);
    const rightHasFocus = rightPanel.contains(activeEl) && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLSelectElement);

    const context = createContext(player);

    // Always refresh HUD
    const nextHudPanel = renderHud(context);
    hudPanel.replaceWith(nextHudPanel);
    hudPanel = nextHudPanel;

    // Refresh left panel only if no input focus
    if (!leftHasFocus) {
      const nextLeftPanel = document.createElement('div');
      nextLeftPanel.className = 'overlay-left';
      if (controller.activeScene !== 'galaxy') {
        nextLeftPanel.append(renderLeftContent(context));
      }
      leftPanel.replaceWith(nextLeftPanel);
      leftPanel = nextLeftPanel;
    }

    // Refresh right panel only if no input focus
    if (!rightHasFocus) {
      const nextRightPanel = document.createElement('div');
      nextRightPanel.className = 'overlay-right';
      if (controller.activeScene !== 'galaxy') {
        nextRightPanel.append(renderRightPanel(context, state));
      }
      rightPanel.replaceWith(nextRightPanel);
      rightPanel = nextRightPanel;
    }

    syncGameOverPanel();
  }

  function render(): void {
    hudPanel = null;
    leftPanel = null;
    rightPanel = null;
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

    rightPanel = document.createElement('div');
    rightPanel.className = 'overlay-right';

    // Only populate panels when NOT in galaxy view
    if (controller.activeScene !== 'galaxy') {
      leftPanel.append(renderLeftContent(context));
      rightPanel.append(renderRightPanel(context, state));
    }

    body.append(leftPanel, rightPanel);
    shell.append(body);
    root.append(shell);
    syncGameOverPanel();
  }

  function renderLeftContent(context: UiContext): HTMLElement {
    switch (viewMode) {
      case 'economy':
        return renderEconomyPanel(context);
      case 'standings':
        return renderStandingsPanel(context);
      default:
        return renderPlanetPanel(context);
    }
  }

  function renderRightPanel(context: UiContext, state: typeof controller.state): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'side-panel interactive';
    panel.append(
      collapsible('fleet-mgmt', 'Fleet Management', () => renderFleetContent(context), true),
      collapsible('research', 'Research', () => renderResearchContent(context), false),
      collapsible('notifications', 'Notifications', () => renderNotificationsContent(state!.events, notice), false),
    );
    return panel;
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

    const nextGameOverScreen = gameOverScreenPanel(playerWon ?? false);
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

function gameOverScreenPanel(playerWon: boolean): HTMLElement {
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
