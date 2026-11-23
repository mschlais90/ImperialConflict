import type { AppController, AppOverlay } from '../app/appController';
import type { BattleReport } from '../core/engines/combatEngine';
import { createNewGame } from '../core/engines/gameManager';
import { setSpeed } from '../core/engines/tickEngine';
import type { GameSpeed } from '../core/events/eventLog';
import type { GameState } from '../core/galaxy/galaxyData';
import { getEmpire } from '../core/selectors/selectors';
import { createLocalCommandProxy } from '../net/commandProxy';
import { createDualCommandProxy } from '../net/remoteCommandProxy';
import { createAttackLog } from './attackLog';
import { renderBattleHistoryPanel } from './battleHistory';
import { renderBattleReport } from './battleReport';
import { createChatPanel } from './chatPanel';
import { clearElement } from './dom';
import { renderEconomyPanel } from './economyPanel';
import { collectEventToasts } from './eventToasts';
import { renderExplorationPanel } from './explorationPanel';
import { renderFleetManagementPanel } from './fleetPanel';
import { eliminatedOverlayPanel, errorPanel, gameOverScreenPanel } from './gameOverScreen';
import { renderHud, type MenuCallbacks } from './hud';
import { createShortcutHelp, installKeybindings, type ViewMode } from './keybindings';
import { renderMassBuildPanel } from './massBuild';
import { createMultiplayerFlow } from './multiplayerFlow';
import { startMusic, stopMusic } from './music';
import { renderNotificationsContent } from './notifications';
import { renderOpsPanel } from './opsPanel';
import { hasFocusedSelect, replacePreservingInputs } from './panelRefresh';
import { renderPlanetPanel } from './planetPanel';
import { renderResearchContent } from './researchPanel';
import { createSaveLoadFlow } from './saveLoadFlow';
import { renderSettingsPanel } from './settingsPanel';
import { renderSimulatorScreen } from './simulatorScreen';
import { renderSinglePlayerSetup } from './singlePlayerSetup';
import { renderStandingsPanel } from './standingsPanel';
import { renderStartScreen } from './startScreen';
import { createToaster } from './toasts';
import { renderTutorialScreen } from './tutorialScreen';
import type { UiContext } from './types';

// The DOM overlay: owns the HUD + left panel render cycle and view mode, and
// composes the persistent pieces (toasts, attack log, chat, battle report,
// game-over) and flows (save/load, multiplayer lobby, keybindings).

export interface OverlayApi {
  render(): void;
  refreshAfterTick(): void;
  showStartScreen(): void;
  showGameOver(playerWon: boolean): void;
}

export function createOverlay(root: HTMLElement, controller: AppController): OverlayApi {
  let forcedGameOver: boolean | null = null;
  let hudPanel: HTMLElement | null = null;
  let leftPanel: HTMLElement | null = null;
  let gameOverScreen: HTMLElement | null = null;
  let battleReportScreen: HTMLElement | null = null;
  let eliminatedOverlay: HTMLElement | null = null;
  let lastSeenEventId = -1;
  let viewMode: ViewMode = 'normal';
  let menuOpen = false;
  let suppressCommandToasts = false;
  const disconnectedPlayers = new Set<number>();

  const toaster = createToaster(root);
  const showToast = toaster.show;
  const chat = createChatPanel(root, (text) => controller.multiplayerClient?.sendChat(text));
  const toggleShortcutHelp = createShortcutHelp(root);

  const overlay: AppOverlay = { render, refreshAfterTick, showStartScreen, showGameOver };

  /** Find this client's empire using clientState.empireId (multiplayer-safe). */
  function getLocalPlayer() {
    const state = controller.state;
    if (!state) return undefined;
    const empireId = controller.clientState?.empireId ?? 0;
    return state.empires[empireId];
  }

  // ---------------------------------------------------------------------------
  // Persistent windows
  // ---------------------------------------------------------------------------

  /** Jump to a planet from the attack log or notifications. */
  function navigateToPlanet(systemId: number, planetId: number): void {
    viewMode = 'normal';
    if (controller.navigateToSystem) {
      controller.navigateToSystem(systemId);
      // navigateToSystem clears selectedPlanetId — set it after
      controller.clientState!.selectedPlanetId = planetId;
      controller.overlay.render();
    } else {
      controller.clientState!.selectedSystemId = systemId;
      controller.clientState!.selectedPlanetId = planetId;
      render();
    }
  }

  // Lives outside the render cycle so its checkboxes and collapse state
  // survive per-tick refreshes.
  const attackLog = createAttackLog({
    onNavigate: navigateToPlanet,
    onViewReport: (report) => showBattleReportPopup(report),
  });

  function showBattleReportPopup(report: BattleReport): void {
    const state = controller.state;
    if (!state) return;
    const player = getLocalPlayer();
    const attackerName = getEmpire(state, report.attackerId)?.empireName ?? 'Unknown';
    const defenderName = getEmpire(state, report.defenderId)?.empireName ?? 'Unknown';
    const isPlayerAttacker = player !== undefined && report.attackerId === player.id;

    const reportEl = renderBattleReport(report, attackerName, defenderName, isPlayerAttacker, dismissBattleReport);
    if (battleReportScreen) {
      battleReportScreen.replaceWith(reportEl);
    } else {
      root.append(reportEl);
    }
    battleReportScreen = reportEl;
  }

  function dismissBattleReport(): boolean {
    if (!battleReportScreen) return false;
    battleReportScreen.remove();
    battleReportScreen = null;
    return true;
  }

  function updateAttackLog(): void {
    const state = controller.state;
    const player = getLocalPlayer();
    if (!state || !player) return;
    attackLog.update(state, player.id);
  }

  function showEliminatedOverlay(): void {
    if (eliminatedOverlay) return;
    const close = (): void => {
      eliminatedOverlay?.remove();
      eliminatedOverlay = null;
    };
    eliminatedOverlay = eliminatedOverlayPanel(close, () => {
      controller.multiplayerClient?.disconnect();
      controller.isMultiplayer = false;
      controller.multiplayerClient = null;
      close();
      showStartScreen();
    });
    root.append(eliminatedOverlay);
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

    const nextGameOverScreen = gameOverScreenPanel(playerWon ?? false, state, controller.clientState?.empireId ?? 0);
    if (gameOverScreen) {
      gameOverScreen.replaceWith(nextGameOverScreen);
    } else {
      root.append(nextGameOverScreen);
    }
    gameOverScreen = nextGameOverScreen;
  }

  // ---------------------------------------------------------------------------
  // Game lifecycle
  // ---------------------------------------------------------------------------

  function syncLastSeenEventIds(): void {
    const state = controller.state;
    lastSeenEventId = state && state.events.length > 0 ? state.events[state.events.length - 1].id : -1;
  }

  function resetForNewGame(): void {
    forcedGameOver = null;
    viewMode = 'normal';
    dismissBattleReport();
    syncLastSeenEventIds();
  }

  function changeSpeed(state: GameState, speed: GameSpeed): void {
    if (controller.isMultiplayer && !controller.isHost) return;
    if (controller.isMultiplayer && controller.multiplayerClient) {
      controller.multiplayerClient.setSpeed(speed);
      state.currentSpeed = speed;
    } else {
      setSpeed(state, speed);
    }
  }

  function syncClientStateToGameState(): void {
    const state = controller.state;
    const cs = controller.clientState;
    if (!state || !cs) return;
    state.selectedEmpireId = cs.empireId;
    state.selectedSystemId = cs.selectedSystemId;
    state.selectedPlanetId = cs.selectedPlanetId;
    state.selectedFleetId = cs.selectedFleetId;
  }

  function finishLoad(loaded: GameState, sourceName: string): void {
    if (controller.loadGame) {
      controller.loadGame(loaded);
    } else {
      controller.state = loaded;
      controller.overlay.render();
    }
    syncLastSeenEventIds();
    startMusic();
    showToast(`Loaded: ${sourceName}`, false);
  }

  const multiplayer = createMultiplayerFlow({
    root,
    controller,
    toastElement: toaster.element,
    chat,
    disconnectedPlayers,
    showToast,
    showStartScreen,
    isSuppressingCommandToasts: () => suppressCommandToasts,
    resetForNewGame,
    render,
    refreshAfterTick,
  });

  const saveLoad = createSaveLoadFlow({
    root,
    finishLoad,
    hostLoadedGame: (loaded) => multiplayer.showLobby(loaded),
  });

  const notify = (message: string, isError = false): void => showToast(message, isError);

  // ---------------------------------------------------------------------------
  // Menu screens
  // ---------------------------------------------------------------------------

  /** Clear the root for a full-screen menu, keeping the toast container. */
  function clearForScreen(): void {
    clearElement(root);
    root.append(toaster.element);
  }

  function showStartScreen(): void {
    stopMusic();
    clearForScreen();
    chat.detach();
    renderStartScreen(root, {
      onSinglePlayer: () => showSinglePlayerSetup(),
      onMultiplayer: () => multiplayer.showLobby(),
      onTutorial: () => {
        clearForScreen();
        renderTutorialScreen(root, () => showStartScreen());
      },
      onSimulator: () => {
        clearForScreen();
        renderSimulatorScreen(root, () => showStartScreen());
      },
      onLoad: () => saveLoad.load(notify),
    });
  }

  function showSinglePlayerSetup(): void {
    clearForScreen();
    renderSinglePlayerSetup(root, (options) => {
      resetForNewGame();
      const empireCount = 1 + options.aiCount;
      const difficulty = options.aiDifficulties[0] ?? 'normal';
      if (controller.startNewGame) {
        controller.startNewGame(options.empireName, difficulty, empireCount, options.aiDifficulties);
        syncLastSeenEventIds();
        startMusic();
        return;
      }
      controller.playerName = options.empireName;
      controller.state = createNewGame({
        empireName: options.empireName,
        difficulty,
        empireCount,
        aiDifficulties: options.aiDifficulties,
      });
      syncLastSeenEventIds();
      startMusic();
      render();
    }, () => showStartScreen());
  }

  function showGameOver(playerWon: boolean): void {
    forcedGameOver = playerWon;
    render();
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  function setView(mode: ViewMode): void {
    viewMode = mode;
    menuOpen = false;
    render();
  }

  installKeybindings({
    getState: () => controller.state,
    isMultiplayer: () => controller.isMultiplayer ?? false,
    getViewMode: () => viewMode,
    isMenuOpen: () => menuOpen,
    setView,
    closeMenu: () => {
      menuOpen = false;
      render();
    },
    switchToGalaxy: () => {
      viewMode = 'normal';
      menuOpen = false;
      controller.switchToGalaxy?.();
    },
    dismissBattleReport,
    toggleShortcutHelp,
    focusChat: () => chat.focusInput(),
    changeSpeed,
    afterSpeedChange: () => refreshAfterTick(),
  });

  // ---------------------------------------------------------------------------
  // Render cycle
  // ---------------------------------------------------------------------------

  function createMenuCallbacks(state: GameState): MenuCallbacks {
    return {
      isOpen: menuOpen,
      currentViewMode: viewMode,
      toggle: () => {
        menuOpen = !menuOpen;
        render();
      },
      selectView: (mode) => setView(mode as ViewMode),
      save: () => {
        menuOpen = false;
        syncClientStateToGameState();
        saveLoad.save(state, notify);
      },
      load: () => {
        menuOpen = false;
        saveLoad.load(notify);
      },
    };
  }

  function createContext(player: NonNullable<ReturnType<typeof getLocalPlayer>>): UiContext {
    return {
      controller,
      player,
      commands: controller.isMultiplayer && controller.multiplayerClient
        ? createDualCommandProxy(createLocalCommandProxy(() => controller.state!), controller.multiplayerClient)
        : createLocalCommandProxy(() => controller.state!),
      runCommand(command) {
        const result = command();
        if (!controller.isMultiplayer) {
          showToast(result.message, !result.ok);
        }
        if (result.ok) {
          controller.refreshScene?.();
        }
        refreshAfterTick();
      },
      setNotice(message, isError = false, rerender = false) {
        showToast(message, isError);
        if (rerender) render();
      },
      suppressCommandToasts(suppress) {
        suppressCommandToasts = suppress;
      },
      disconnectedPlayers,
    };
  }

  function renderLeftContent(context: UiContext): HTMLElement {
    let panel: HTMLElement;
    switch (viewMode) {
      case 'economy':
        panel = renderEconomyPanel(context);
        break;
      case 'standings':
        panel = renderStandingsPanel(context);
        break;
      case 'history':
        panel = renderBattleHistoryPanel(context);
        break;
      case 'massBuild':
        panel = renderMassBuildPanel(context);
        break;
      case 'ops':
        panel = renderOpsPanel(context);
        break;
      case 'fleet':
        panel = renderFleetManagementPanel(context);
        break;
      case 'exploration':
        panel = renderExplorationPanel(context);
        break;
      case 'settings':
        panel = renderSettingsPanel(context);
        break;
      case 'research':
        panel = titledPanel('Research', renderResearchContent(context));
        break;
      case 'notifications':
        panel = titledPanel('Notifications', renderNotificationsContent(controller.state!, context.player.id, {
          onNavigateToPlanet: navigateToPlanet,
          onViewBattle: (report) => showBattleReportPopup(report),
        }));
        break;
      default:
        return renderPlanetPanel(context);
    }

    // Add close button to all overlay panels
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'panel-close-btn';
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.title = 'Close (Esc)';
    closeBtn.addEventListener('click', () => setView('normal'));
    panel.style.position = 'relative';
    panel.prepend(closeBtn);

    return panel;
  }

  function buildLeftPanel(context: UiContext): HTMLElement {
    const isFullPage = viewMode !== 'normal';
    const panel = document.createElement('div');
    panel.className = isFullPage ? 'overlay-left overlay-left-full' : 'overlay-left';
    // Only populate panels when NOT in galaxy view (or when a menu view is active)
    if (controller.activeScene !== 'galaxy' || isFullPage) {
      panel.append(renderLeftContent(context));
    }
    return panel;
  }

  function checkForNewEvents(): void {
    const state = controller.state;
    const player = getLocalPlayer();
    if (!state || !player) return;

    const newEvents = state.events.filter((e) => e.id > lastSeenEventId);
    if (newEvents.length === 0) return;
    lastSeenEventId = newEvents[newEvents.length - 1].id;

    const { toasts, localPlayerEliminated } = collectEventToasts(state, player.id, newEvents);
    if (localPlayerEliminated && controller.isMultiplayer) {
      showEliminatedOverlay();
    }
    for (const toast of toasts) {
      showToast(toast.message, toast.isError);
    }
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

    const player = getLocalPlayer();
    if (!player) {
      root.append(errorPanel('Player empire not found.'));
      return;
    }

    const context = createContext(player);
    const shell = document.createElement('div');
    shell.className = 'overlay-shell';
    hudPanel = renderHud(context, createMenuCallbacks(state));
    shell.append(hudPanel);

    const body = document.createElement('div');
    body.className = viewMode !== 'normal' ? 'overlay-body overlay-body-full' : 'overlay-body';
    leftPanel = buildLeftPanel(context);
    body.append(leftPanel);
    shell.append(body);
    root.append(shell, toaster.element, attackLog.element);
    updateAttackLog();
    syncGameOverPanel();

    // Re-attach battle report popup if one was showing before render cleared root
    if (battleReportScreen) {
      root.append(battleReportScreen);
    }
  }

  /** Per-tick refresh: rebuilds HUD and left panel in place without losing input state. */
  function refreshAfterTick(): void {
    const state = controller.state;
    const player = state ? getLocalPlayer() : undefined;
    if (!state || state.currentState === 'main_menu' || !player || !hudPanel || !leftPanel) {
      render();
      return;
    }

    const context = createContext(player);

    // Always refresh HUD (separate element, does not disturb left panel focus).
    const nextHudPanel = renderHud(context, createMenuCallbacks(state));
    hudPanel.replaceWith(nextHudPanel);
    hudPanel = nextHudPanel;

    // If a native <select> dropdown is open in the left panel, leave the panel
    // untouched so the dropdown is not dismissed.
    if (!hasFocusedSelect(leftPanel)) {
      const nextLeftPanel = buildLeftPanel(context);
      replacePreservingInputs(leftPanel, nextLeftPanel);
      leftPanel = nextLeftPanel;
    }

    syncGameOverPanel();
    updateAttackLog();
    checkForNewEvents();
  }

  return overlay;
}

function titledPanel(titleText: string, content: HTMLElement): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';
  const title = document.createElement('h2');
  title.textContent = titleText;
  panel.append(title, content);
  return panel;
}
