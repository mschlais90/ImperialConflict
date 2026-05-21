import type { AppController, AppOverlay } from '../app/appController';
import type { BattleReport } from '../core/engines/combatEngine';
import { createNewGame } from '../core/engines/gameManager';
import { setSpeed, SPEEDS } from '../core/engines/tickEngine';
import { getEmpire, getPlayerEmpire } from '../core/selectors/selectors';
import { renderBattleReport } from './battleReport';
import { renderBattleHistoryPanel } from './battleHistory';
import { clearElement, collapsible } from './dom';
import { renderEconomyPanel } from './economyPanel';
import { renderFleetContent } from './fleetPanel';
import { renderHud } from './hud';
import { renderMassBuildPanel } from './massBuild';
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
  let battleReportScreen: HTMLElement | null = null;
  let battleReportQueue: BattleReport[] = [];
  let lastSeenBattleEventId = -1;
  let speedBeforeBattle: number | null = null;
  let viewMode: 'normal' | 'economy' | 'standings' | 'history' | 'massBuild' = 'normal';

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
      case 'h':
        viewMode = viewMode === 'history' ? 'normal' : 'history';
        render();
        break;
      case 'b':
        viewMode = viewMode === 'massBuild' ? 'normal' : 'massBuild';
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
      battleReportQueue = [];
      lastSeenBattleEventId = -1;
      speedBeforeBattle = null;
      battleReportScreen?.remove();
      battleReportScreen = null;
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
      const leftScroll = leftPanel.querySelector('.main-panel')?.scrollTop ?? 0;
      const nextLeftPanel = document.createElement('div');
      nextLeftPanel.className = 'overlay-left';
      if (controller.activeScene !== 'galaxy') {
        nextLeftPanel.append(renderLeftContent(context));
      }
      leftPanel.replaceWith(nextLeftPanel);
      leftPanel = nextLeftPanel;
      const nextMainPanel = leftPanel.querySelector('.main-panel');
      if (nextMainPanel) nextMainPanel.scrollTop = leftScroll;
    }

    // Refresh right panel only if no input focus
    if (!rightHasFocus) {
      const rightScroll = rightPanel.querySelector('.side-panel')?.scrollTop ?? 0;
      const nextRightPanel = document.createElement('div');
      nextRightPanel.className = 'overlay-right';
      if (controller.activeScene !== 'galaxy') {
        nextRightPanel.append(renderRightPanel(context, state));
      }
      rightPanel.replaceWith(nextRightPanel);
      rightPanel = nextRightPanel;
      const nextSidePanel = rightPanel.querySelector('.side-panel');
      if (nextSidePanel) nextSidePanel.scrollTop = rightScroll;
    }

    syncGameOverPanel();
    checkForNewBattles();
  }

  function checkForNewBattles(): void {
    const state = controller.state;
    if (!state) return;
    const player = getPlayerEmpire(state);
    if (!player) return;

    const newBattles = state.events.filter(
      (e) => e.type === 'battle_resolved' && e.id > lastSeenBattleEventId
        && (e.attackerId === player.id || e.defenderId === player.id),
    );

    if (newBattles.length > 0) {
      lastSeenBattleEventId = newBattles[newBattles.length - 1].id;
      for (const event of newBattles) {
        if (event.type === 'battle_resolved') {
          battleReportQueue.push(event.report);
        }
      }
      if (!battleReportScreen) {
        showNextBattleReport();
      }
    }
  }

  function showNextBattleReport(): void {
    const state = controller.state;
    if (!state || battleReportQueue.length === 0) {
      battleReportScreen?.remove();
      battleReportScreen = null;
      if (speedBeforeBattle !== null && state) {
        setSpeed(state, speedBeforeBattle as 0 | 1 | 2 | 4);
        speedBeforeBattle = null;
        render();
      }
      return;
    }

    if (speedBeforeBattle === null) {
      speedBeforeBattle = state.currentSpeed;
      setSpeed(state, SPEEDS.PAUSED);
    }

    const report = battleReportQueue.shift()!;
    const player = getPlayerEmpire(state);
    const isPlayerAttacker = player !== undefined && report.attackerId === player.id;
    const attackerEmpire = getEmpire(state, report.attackerId);
    const defenderEmpire = getEmpire(state, report.defenderId);
    const attackerName = attackerEmpire?.empireName ?? 'Unknown';
    const defenderName = defenderEmpire?.empireName ?? 'Unknown';

    const reportEl = renderBattleReport(report, attackerName, defenderName, isPlayerAttacker, () => {
      showNextBattleReport();
    });

    if (battleReportScreen) {
      battleReportScreen.replaceWith(reportEl);
    } else {
      root.append(reportEl);
    }
    battleReportScreen = reportEl;
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
      case 'history':
        return renderBattleHistoryPanel(context);
      case 'massBuild':
        return renderMassBuildPanel(context);
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
