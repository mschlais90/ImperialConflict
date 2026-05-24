import type { AppController, AppOverlay } from '../app/appController';
import type { BattleReport } from '../core/engines/combatEngine';
import { createNewGame } from '../core/engines/gameManager';
import { saveToStorage, loadFromStorage, hasSave } from '../core/persistence/saveLoad';
import { setSpeed, SPEEDS } from '../core/engines/tickEngine';
import { getEmpire, getPlayerEmpire } from '../core/selectors/selectors';
import { renderBattleReport } from './battleReport';
import { renderBattleHistoryPanel } from './battleHistory';
import { clearElement } from './dom';
import { renderEconomyPanel } from './economyPanel';
import { renderFleetManagementPanel } from './fleetPanel';
import { renderHud, type MenuCallbacks } from './hud';
import { renderMassBuildPanel } from './massBuild';
import { renderNotificationsContent } from './notifications';
import { renderOpsPanel } from './opsPanel';
import { renderPlanetPanel } from './planetPanel';
import { renderResearchContent } from './researchPanel';
import { renderSettingsPanel, shouldShowCombatPopups } from './settingsPanel';
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
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  let forcedGameOver: boolean | null = null;
  let hudPanel: HTMLElement | null = null;
  let leftPanel: HTMLElement | null = null;
  let gameOverScreen: HTMLElement | null = null;
  let battleReportScreen: HTMLElement | null = null;
  let battleReportQueue: BattleReport[] = [];
  let lastSeenBattleEventId = -1;
  let speedBeforeBattle: number | null = null;
  let viewMode: 'normal' | 'economy' | 'standings' | 'history' | 'massBuild' | 'ops' | 'fleet' | 'settings' | 'research' | 'notifications' = 'normal';
  let menuOpen = false;

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
        menuOpen = false;
        controller.switchToGalaxy?.();
        break;
      case 'e':
        viewMode = viewMode === 'economy' ? 'normal' : 'economy';
        menuOpen = false;
        render();
        break;
      case 'a':
        viewMode = viewMode === 'standings' ? 'normal' : 'standings';
        menuOpen = false;
        render();
        break;
      case 'h':
        viewMode = viewMode === 'history' ? 'normal' : 'history';
        menuOpen = false;
        render();
        break;
      case 'b':
        viewMode = viewMode === 'massBuild' ? 'normal' : 'massBuild';
        menuOpen = false;
        render();
        break;
      case 'o':
        viewMode = viewMode === 'ops' ? 'normal' : 'ops';
        menuOpen = false;
        render();
        break;
      case 'f':
        viewMode = viewMode === 'fleet' ? 'normal' : 'fleet';
        menuOpen = false;
        render();
        break;
      case 'r':
        viewMode = viewMode === 'research' ? 'normal' : 'research';
        menuOpen = false;
        render();
        break;
      case 'n':
        viewMode = viewMode === 'notifications' ? 'normal' : 'notifications';
        menuOpen = false;
        render();
        break;
      case 's':
        viewMode = viewMode === 'settings' ? 'normal' : 'settings';
        menuOpen = false;
        render();
        break;
      case 'escape':
        if (menuOpen) {
          menuOpen = false;
          render();
          break;
        }
        if (viewMode !== 'normal') {
          viewMode = 'normal';
          render();
          break;
        }
        break;
      case '?':
        toggleShortcutHelp();
        break;
    }
  });

  let shortcutHelpEl: HTMLElement | null = null;

  function toggleShortcutHelp(): void {
    if (shortcutHelpEl) {
      shortcutHelpEl.remove();
      shortcutHelpEl = null;
      return;
    }
    const shortcuts = [
      ['G', 'Galaxy view'],
      ['E', 'Economy'],
      ['A', 'Standings'],
      ['H', 'Battle History'],
      ['B', 'Planet Builder'],
      ['F', 'Fleet Management'],
      ['R', 'Research'],
      ['N', 'Notifications'],
      ['O', 'Operations'],
      ['S', 'Settings'],
      ['ESC', 'Close / Galaxy'],
      ['?', 'This help'],
    ];
    const overlay = document.createElement('div');
    overlay.className = 'shortcut-help interactive';
    const panel = document.createElement('div');
    panel.className = 'shortcut-help-panel';
    const title = document.createElement('h3');
    title.textContent = 'Keyboard Shortcuts';
    panel.append(title);
    for (const [key, desc] of shortcuts) {
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      row.innerHTML = `<kbd>${key}</kbd><span>${desc}</span>`;
      panel.append(row);
    }
    overlay.append(panel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) toggleShortcutHelp();
    });
    root.append(overlay);
    shortcutHelpEl = overlay;
  }

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

  function createMenuCallbacks(state: NonNullable<typeof controller.state>, context: UiContext): MenuCallbacks {
    return {
      isOpen: menuOpen,
      toggle: () => {
        menuOpen = !menuOpen;
        render();
      },
      selectView: (mode) => {
        viewMode = mode as typeof viewMode;
        menuOpen = false;
        render();
      },
      save: () => {
        saveToStorage(state);
        menuOpen = false;
        context.setNotice('Game saved.');
      },
      load: () => {
        if (!hasSave()) {
          menuOpen = false;
          context.setNotice('No saved game found.', true);
          return;
        }
        const loaded = loadFromStorage();
        if (loaded) {
          controller.state = loaded;
          menuOpen = false;
          controller.overlay.render();
        }
      },
    };
  }

  function refreshAfterTick(): void {
    const state = controller.state;
    const player = state ? getPlayerEmpire(state) : undefined;
    if (!state || state.currentState === 'main_menu' || !player || !hudPanel || !leftPanel) {
      render();
      return;
    }

    const isFullPage = viewMode !== 'normal';

    // Input focus preservation: skip panel re-render when user is typing
    const activeEl = document.activeElement;
    const leftHasFocus = leftPanel.contains(activeEl) && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLSelectElement);

    const context = createContext(player);

    // Always refresh HUD
    const nextHudPanel = renderHud(context, createMenuCallbacks(state, context), notice);
    hudPanel.replaceWith(nextHudPanel);
    hudPanel = nextHudPanel;

    // Refresh left panel only if no input focus
    if (!leftHasFocus) {
      const leftScroll = leftPanel.querySelector('.main-panel')?.scrollTop ?? 0;
      const nextLeftPanel = document.createElement('div');
      nextLeftPanel.className = 'overlay-left overlay-left-full';
      if (controller.activeScene !== 'galaxy' || isFullPage) {
        nextLeftPanel.append(renderLeftContent(context));
      }
      leftPanel.replaceWith(nextLeftPanel);
      leftPanel = nextLeftPanel;
      const nextMainPanel = leftPanel.querySelector('.main-panel');
      if (nextMainPanel) nextMainPanel.scrollTop = leftScroll;
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
      if (shouldShowCombatPopups()) {
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
    const isFullPage = viewMode !== 'normal';

    const shell = document.createElement('div');
    shell.className = 'overlay-shell';
    hudPanel = renderHud(context, createMenuCallbacks(state, context), notice);
    shell.append(hudPanel);

    const body = document.createElement('div');
    body.className = 'overlay-body overlay-body-full';

    leftPanel = document.createElement('div');
    leftPanel.className = 'overlay-left overlay-left-full';

    // Only populate panels when NOT in galaxy view (or when a menu view is active)
    if (controller.activeScene !== 'galaxy' || isFullPage) {
      leftPanel.append(renderLeftContent(context));
    }

    body.append(leftPanel);
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
      case 'ops':
        return renderOpsPanel(context);
      case 'fleet':
        return renderFleetManagementPanel(context);
      case 'settings':
        return renderSettingsPanel(context);
      case 'research':
        return renderResearchFullPanel(context);
      case 'notifications':
        return renderNotificationsFullPanel(context);
      default:
        return renderPlanetPanel(context);
    }
  }

  function renderResearchFullPanel(context: UiContext): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'main-panel interactive';
    const title = document.createElement('h2');
    title.textContent = 'Research';
    panel.append(title, renderResearchContent(context));
    return panel;
  }

  function renderNotificationsFullPanel(_context: UiContext): HTMLElement {
    const state = controller.state;
    const panel = document.createElement('section');
    panel.className = 'main-panel interactive';
    const title = document.createElement('h2');
    title.textContent = 'Notifications';
    panel.append(title, renderNotificationsContent(state!.events, notice));
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
        if (noticeTimer) clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => {
          notice = null;
          noticeTimer = null;
          render();
        }, 3000);
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
