import type { AppController, AppOverlay } from '../app/appController';
import type { BattleReport } from '../core/engines/combatEngine';
import { createNewGame } from '../core/engines/gameManager';
import type { GameState } from '../core/galaxy/galaxyData';
import { downloadSave, uploadSave, getSavedDirHandle, saveToDirectory, listSavesInDirectory, loadFromDirectory } from '../core/persistence/saveLoad';
import type { GameSpeed } from '../core/events/eventLog';
import { setSpeed, SPEEDS } from '../core/engines/tickEngine';
import { UNITS } from '../core/data/units';
import { getEmpire, getPlanet } from '../core/selectors/selectors';
import { renderBattleReport } from './battleReport';
import { renderBattleHistoryPanel } from './battleHistory';
import { clearElement } from './dom';
import { renderEconomyPanel } from './economyPanel';
import { renderFleetManagementPanel } from './fleetPanel';
import { renderHud, type MenuCallbacks } from './hud';
import { renderMassBuildPanel } from './massBuild';
import { renderNotificationsContent, type NotificationCallbacks } from './notifications';
import { renderOpsPanel } from './opsPanel';
import { renderPlanetPanel } from './planetPanel';
import { renderResearchContent } from './researchPanel';
import { renderSettingsPanel, shouldShowCombatPopups } from './settingsPanel';
import { renderStandingsPanel } from './standingsPanel';
import { renderExplorationPanel } from './explorationPanel';
import { renderStartScreen } from './startScreen';
import type { UiContext } from './types';
import { createLocalCommandProxy } from '../net/commandProxy';
import { MultiplayerClient } from '../net/multiplayerClient';
import { createDualCommandProxy } from '../net/remoteCommandProxy';
import { renderLobbyScreen, type LobbyController } from './lobbyScreen';
import type { PlayerInfo, SerializedGameState } from '../core/protocol/messages';
import { renderSimulatorScreen } from './simulatorScreen';
import { renderSinglePlayerSetup } from './singlePlayerSetup';
import { renderTutorialScreen } from './tutorialScreen';
import { startMusic, stopMusic } from './music';
import { createSeededRng } from '../core/random/rng';

const MP_SESSION_KEY = 'ic_mp_session';

function saveMpSession(roomCode: string, empireId: number): void {
  try {
    localStorage.setItem(MP_SESSION_KEY, JSON.stringify({ roomCode, empireId }));
  } catch { /* storage full or unavailable */ }
}

function loadMpSession(): { roomCode: string; empireId: number } | null {
  try {
    const raw = localStorage.getItem(MP_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.roomCode === 'string' && typeof parsed.empireId === 'number') {
      return parsed;
    }
  } catch { /* corrupt data */ }
  return null;
}

function clearMpSession(): void {
  try {
    localStorage.removeItem(MP_SESSION_KEY);
  } catch { /* ignore */ }
}

export interface OverlayApi {
  render(): void;
  refreshAfterTick(): void;
  showStartScreen(): void;
  showGameOver(playerWon: boolean): void;
}

export function createOverlay(root: HTMLElement, controller: AppController): OverlayApi {
  let forcedGameOver: boolean | null = null;
  let lastNonZeroSpeed: GameSpeed = SPEEDS.NORMAL;

  // Persistent toast container — lives outside the render cycle
  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  let hudPanel: HTMLElement | null = null;
  let leftPanel: HTMLElement | null = null;
  let gameOverScreen: HTMLElement | null = null;
  let battleReportScreen: HTMLElement | null = null;
  let battleReportQueue: BattleReport[] = [];
  let lastSeenBattleEventId = -1;
  let lastSeenEventId = -1;
  let speedBeforeBattle: number | null = null;
  let viewMode: 'normal' | 'economy' | 'standings' | 'history' | 'massBuild' | 'ops' | 'fleet' | 'settings' | 'research' | 'notifications' | 'exploration' = 'normal';
  let menuOpen = false;

  /** Find this client's empire using clientState.empireId (multiplayer-safe). */
  function getLocalPlayer() {
    const state = controller.state;
    if (!state) return undefined;
    const empireId = controller.clientState?.empireId ?? 0;
    return state.empires[empireId];
  }

  // Multiplayer state
  const disconnectedPlayers = new Set<number>();
  const chatMessages: Array<{ sender: string; text: string; isSystem: boolean }> = [];
  let chatPanel: HTMLElement | null = null;

  const overlay: AppOverlay = {
    render,
    refreshAfterTick,
    showStartScreen,
    showGameOver,
  };

  function changeSpeed(state: NonNullable<typeof controller.state>, speed: GameSpeed): void {
    if (controller.isMultiplayer && !controller.isHost) return;
    if (controller.isMultiplayer && controller.multiplayerClient) {
      controller.multiplayerClient.setSpeed(speed);
      state.currentSpeed = speed;
    } else {
      setSpeed(state, speed);
    }
  }

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
        viewMode = viewMode === 'exploration' ? 'normal' : 'exploration';
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
        viewMode = viewMode === 'economy' ? 'normal' : 'economy';
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
      case 'enter':
        if (controller.isMultiplayer) {
          focusChatInput();
          event.preventDefault();
        }
        break;
      case ' ':
        if (!controller.isMultiplayer) {
          if (state.currentSpeed === 0) {
            changeSpeed(state, lastNonZeroSpeed);
          } else {
            lastNonZeroSpeed = state.currentSpeed;
            changeSpeed(state, SPEEDS.PAUSED);
          }
          refreshAfterTick();
          event.preventDefault();
        }
        break;
      case '0':
        changeSpeed(state, SPEEDS.PAUSED);
        refreshAfterTick();
        break;
      case '1':
        changeSpeed(state, SPEEDS.NORMAL);
        refreshAfterTick();
        break;
      case '2':
        changeSpeed(state, SPEEDS.FAST);
        refreshAfterTick();
        break;
      case '3':
        changeSpeed(state, SPEEDS.FASTEST);
        refreshAfterTick();
        break;
      case '4':
        changeSpeed(state, SPEEDS.TURBO);
        refreshAfterTick();
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
      ['E', 'Exploration'],
      ['R', 'Resource Management'],
      ['A', 'Standings'],
      ['H', 'Battle History'],
      ['B', 'Planet Builder'],
      ['F', 'Fleet Management'],
      ['N', 'Notifications'],
      ['O', 'Special Ops'],
      ['S', 'Settings'],
      ['Space', 'Pause / Resume (single-player)'],
      ['0', 'Pause'],
      ['1\u20134', 'Set speed (1x\u20138x)'],
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

  function syncLastSeenEventIds(): void {
    const state = controller.state;
    if (state && state.events.length > 0) {
      const lastId = state.events[state.events.length - 1].id;
      lastSeenBattleEventId = lastId;
      lastSeenEventId = lastId;
    } else {
      lastSeenBattleEventId = -1;
      lastSeenEventId = -1;
    }
  }

  function showStartScreen(): void {
    stopMusic();
    clearElement(root);
    chatPanel = null;
    root.append(toastContainer);
    renderStartScreen(root, {
      onSinglePlayer: () => showSinglePlayerSetup(),
      onMultiplayer: () => showMultiplayerLobby(),
      onTutorial: () => showTutorial(),
      onSimulator: () => showSimulator(),
      onLoad: () => {
        getSavedDirHandle().then((dir) => {
          if (dir) {
            showLoadPicker({
              controller,
              player: undefined as never,
              commands: undefined as never,
              runCommand: () => {},
              setNotice: (msg, isError) => showToast(msg, isError ?? false),
              disconnectedPlayers,
            });
          } else {
            openFilePicker({
              controller,
              player: undefined as never,
              commands: undefined as never,
              runCommand: () => {},
              setNotice: (msg, isError) => showToast(msg, isError ?? false),
              disconnectedPlayers,
            });
          }
        });
      },
    });
  }

  function showSinglePlayerSetup(): void {
    clearElement(root);
    root.append(toastContainer);
    renderSinglePlayerSetup(root, (options) => {
      forcedGameOver = null;
      viewMode = 'normal';
      battleReportQueue = [];
      speedBeforeBattle = null;
      battleReportScreen?.remove();
      battleReportScreen = null;
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

  function showSimulator(): void {
    clearElement(root);
    root.append(toastContainer);
    renderSimulatorScreen(root, () => {
      showStartScreen();
    });
  }

  function showTutorial(): void {
    clearElement(root);
    root.append(toastContainer);
    renderTutorialScreen(root, () => {
      showStartScreen();
    });
  }

  function showMultiplayerLobby(): void {
    clearElement(root);
    root.append(toastContainer);

    let lobbyCtrl: LobbyController | null = null;
    let players: PlayerInfo[] = [];
    let roomCode = '';
    let isHost = false;

    const mpClient = new MultiplayerClient({
      onRoomCreated(code) {
        roomCode = code;
        mpClient.roomCode = code;
      },
      onJoined(empireId, joinedPlayers) {
        players = joinedPlayers;
        isHost = joinedPlayers.find((p) => p.empireId === empireId)?.isHost ?? false;
        controller.isHost = isHost;
        controller.clientState = {
          empireId,
          selectedSystemId: null,
          selectedPlanetId: null,
          selectedFleetId: null,
        };
        lobbyCtrl?.showLobby(roomCode, players, isHost);
      },
      onPlayerJoined(player) {
        players = [...players, player];
        lobbyCtrl?.updatePlayers(players);
      },
      onPlayerLeft(empireId) {
        players = players.filter((p) => p.empireId !== empireId);
        lobbyCtrl?.updatePlayers(players);
        disconnectedPlayers.add(empireId);
      },
      onPlayerReconnected(empireId) {
        disconnectedPlayers.delete(empireId);
        const empire = controller.state?.empires[empireId];
        showToast(`${empire?.empireName ?? `Player ${empireId}`} reconnected.`, false);
      },
      onGameStarted(state) {
        startMultiplayerGame(mpClient, state);
      },
      onTick(state) {
        applyServerState(state);
      },
      onCommandResult(ok, message) {
        showToast(message, !ok);
      },
      onReconnected(empireId, state) {
        controller.clientState = {
          empireId,
          selectedSystemId: null,
          selectedPlanetId: null,
          selectedFleetId: null,
        };
        startMultiplayerGame(mpClient, state);
        showToast('Reconnected to game.', false);
      },
      onChat(empireId, playerName, text) {
        chatMessages.push({ sender: playerName, text, isSystem: empireId < 0 });
        if (chatMessages.length > 100) chatMessages.shift();
        refreshChatPanel();
      },
      onError(message) {
        showToast(message, true);
        // If the room is gone, clear saved session so the rejoin button disappears
        if (message === 'Room not found.' || message === 'Cannot reconnect to this empire.') {
          clearMpSession();
        }
      },
      onDisconnect() {
        controller.isMultiplayer = false;
        controller.multiplayerClient = null;
        // Go straight to multiplayer lobby so the rejoin button is visible
        if (loadMpSession()) {
          showMultiplayerLobby();
          showToast('Disconnected from server. Click Rejoin to reconnect.', true);
        } else {
          showToast('Disconnected from server.', true);
          showStartScreen();
        }
      },
    });

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const serverUrl = import.meta.env.DEV
      ? `ws://${window.location.hostname || 'localhost'}:3001`
      : `${wsProtocol}//${window.location.host}`;

    lobbyCtrl = renderLobbyScreen(root, {
      savedSession: loadMpSession(),
      onCreateRoom(playerName) {
        mpClient.connect(serverUrl);
        const waitForOpen = setInterval(() => {
          if (mpClient.isConnected) {
            clearInterval(waitForOpen);
            mpClient.createRoom(playerName, { empireName: playerName });
          }
        }, 100);
        setTimeout(() => clearInterval(waitForOpen), 5000);
      },
      onJoinRoom(code, playerName) {
        roomCode = code;
        mpClient.roomCode = code;
        mpClient.connect(serverUrl);
        const waitForOpen = setInterval(() => {
          if (mpClient.isConnected) {
            clearInterval(waitForOpen);
            mpClient.joinRoom(code, playerName);
          }
        }, 100);
        setTimeout(() => clearInterval(waitForOpen), 5000);
      },
      onRejoinGame(code, empireId) {
        roomCode = code;
        mpClient.roomCode = code;
        mpClient.setReconnectInfo(code, empireId);
        mpClient.connect(serverUrl);
        // reconnectInfo is set, so doConnect will auto-send the reconnect message on open
      },
      onStartGame() {
        mpClient.startGame();
      },
      onLeave() {
        clearMpSession();
        mpClient.disconnect();
        showStartScreen();
      },
    });
  }

  function startMultiplayerGame(mpClient: MultiplayerClient, serverState: SerializedGameState): void {
    controller.isMultiplayer = true;
    controller.multiplayerClient = mpClient;
    controller.state = { ...serverState, rng: createSeededRng(Date.now()) };
    const empireId = controller.clientState?.empireId ?? 0;
    controller.playerName = controller.state.empires[empireId]?.empireName ?? 'Player';

    // Store reconnect info so the client can auto-rejoin on disconnect
    if (mpClient.roomCode) {
      mpClient.setReconnectInfo(mpClient.roomCode, empireId);
      saveMpSession(mpClient.roomCode, empireId);
    }

    forcedGameOver = null;
    viewMode = 'normal';
    battleReportQueue = [];
    speedBeforeBattle = null;
    battleReportScreen?.remove();
    battleReportScreen = null;

    syncLastSeenEventIds();
    chatMessages.length = 0;

    if (controller.startNewGame) {
      // BootScene handles state setup via loadGame (skips clientState reset in MP)
      controller.loadGame?.(controller.state);
    } else {
      render();
    }

    startMusic();

    // Show chat panel for multiplayer games
    ensureChatPanel();
  }

  function applyServerState(serverState: SerializedGameState): void {
    if (!controller.state) return;

    // Preserve local selection state
    const cs = controller.clientState;

    // Replace game state with server's authoritative copy (keep local RNG for optimistic commands)
    const localRng = controller.state.rng;
    Object.assign(controller.state, serverState);
    controller.state.rng = localRng;

    // Restore selection
    if (cs) {
      controller.state.selectedEmpireId = cs.empireId;
      controller.state.selectedSystemId = cs.selectedSystemId;
      controller.state.selectedPlanetId = cs.selectedPlanetId;
      controller.state.selectedFleetId = cs.selectedFleetId;
    }

    refreshAfterTick();
    controller.refreshScene?.();
  }

  function showGameOver(playerWon: boolean): void {
    forcedGameOver = playerWon;
    render();
  }

  function createMenuCallbacks(state: NonNullable<typeof controller.state>, context: UiContext): MenuCallbacks {
    return {
      isOpen: menuOpen,
      currentViewMode: viewMode,
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
        menuOpen = false;
        syncClientStateToGameState();
        getSavedDirHandle().then((dir) => {
          if (dir) {
            saveToDirectory(state).then((filename) => {
              context.setNotice(`Saved: ${filename}`);
            }).catch(() => {
              downloadSave(state);
              context.setNotice('Save file downloaded.');
            });
          } else {
            downloadSave(state);
            context.setNotice('Save file downloaded.');
          }
        });
      },
      load: () => {
        menuOpen = false;
        getSavedDirHandle().then((dir) => {
          if (dir) {
            showLoadPicker(context);
          } else {
            openFilePicker(context);
          }
        });
      },
    };
  }

  function refreshAfterTick(): void {
    const state = controller.state;
    const player = state ? getLocalPlayer() : undefined;
    if (!state || state.currentState === 'main_menu' || !player || !hudPanel || !leftPanel) {
      render();
      return;
    }

    const isFullPage = viewMode !== 'normal';
    const activeEl = document.activeElement;

    // If a <select> inside the left panel has focus (native dropdown is open),
    // skip re-rendering the left panel so the dropdown is not dismissed.
    const selectFocused = leftPanel.contains(activeEl) && activeEl instanceof HTMLSelectElement;

    // Track which <input> has focus for value/cursor restoration after re-render.
    const focusedInput = !selectFocused && leftPanel.contains(activeEl) && activeEl instanceof HTMLInputElement
      ? activeEl
      : null;

    const context = createContext(player);

    // Always refresh HUD (separate element, does not disturb left panel focus).
    const nextHudPanel = renderHud(context, createMenuCallbacks(state, context));
    hudPanel.replaceWith(nextHudPanel);
    hudPanel = nextHudPanel;

    if (selectFocused) {
      // Leave the left panel untouched so the native dropdown stays open.
      syncGameOverPanel();
      checkForNewBattles();
      checkForNewEvents();
      return;
    }

    // Re-render the left panel, preserving all input values and restoring focus.
    {
      const leftScroll = leftPanel.querySelector('.main-panel')?.scrollTop ?? 0;

      // Save every input's value and locate the focused input by positional index.
      const savedInputValues = new Map<number, string>();
      let focusedInputIdx = -1;
      let focusedSelectionStart: number | null = null;
      let focusedSelectionEnd: number | null = null;
      leftPanel.querySelectorAll('input').forEach((el, idx) => {
        const input = el as HTMLInputElement;
        if (input.value && input.value !== '0') {
          savedInputValues.set(idx, input.value);
        }
        if (input === focusedInput) {
          focusedInputIdx = idx;
          focusedSelectionStart = input.selectionStart;
          focusedSelectionEnd = input.selectionEnd;
        }
      });

      const nextLeftPanel = document.createElement('div');
      nextLeftPanel.className = isFullPage ? 'overlay-left overlay-left-full' : 'overlay-left';
      if (controller.activeScene !== 'galaxy' || isFullPage) {
        nextLeftPanel.append(renderLeftContent(context));
      }

      // Restore all input values and fire input events so dependent displays update.
      nextLeftPanel.querySelectorAll('input').forEach((el, idx) => {
        const saved = savedInputValues.get(idx);
        if (saved !== undefined) {
          const input = el as HTMLInputElement;
          input.value = saved;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      leftPanel.replaceWith(nextLeftPanel);
      leftPanel = nextLeftPanel;
      const nextMainPanel = leftPanel.querySelector('.main-panel');
      if (nextMainPanel) nextMainPanel.scrollTop = leftScroll;

      // Re-focus the previously focused input and restore cursor position.
      if (focusedInputIdx >= 0) {
        const target = nextLeftPanel.querySelectorAll('input')[focusedInputIdx] as HTMLInputElement | undefined;
        if (target) {
          target.focus();
          if (focusedSelectionStart !== null && focusedSelectionEnd !== null) {
            try { target.setSelectionRange(focusedSelectionStart, focusedSelectionEnd); } catch { /* number inputs */ }
          }
        }
      }
    }

    syncGameOverPanel();
    checkForNewBattles();
    checkForNewEvents();
  }

  function checkForNewBattles(): void {
    const state = controller.state;
    if (!state) return;
    const player = getLocalPlayer();
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

  function checkForNewEvents(): void {
    const state = controller.state;
    if (!state) return;
    const player = getLocalPlayer();
    if (!player) return;

    const newEvents = state.events.filter((e) => e.id > lastSeenEventId);
    if (newEvents.length === 0) return;
    lastSeenEventId = newEvents[newEvents.length - 1].id;

    // Group unit completions by type for concise toasts
    const unitCounts = new Map<string, number>();
    const toasts: Array<{ message: string; isError: boolean }> = [];

    for (const event of newEvents) {
      switch (event.type) {
        case 'planet_colonized': {
          if (event.empireId !== player.id) break;
          const planet = getPlanet(state, event.planetId);
          toasts.push({ message: `Colonized ${planet?.planetName ?? 'a planet'}!`, isError: false });
          break;
        }
        case 'empire_eliminated': {
          const empire = getEmpire(state, event.empireId);
          const name = empire?.empireName ?? `Empire ${event.empireId}`;
          const isLocalPlayer = event.empireId === player.id;
          toasts.push({ message: `${name} has been eliminated!`, isError: isLocalPlayer });
          if (isLocalPlayer && controller.isMultiplayer) {
            showEliminatedOverlay();
          }
          break;
        }
        case 'fleet_arrived': {
          // Fleet is removed before event is appended, so check if target planet is ours
          const arrivalPlanet = getPlanet(state, event.targetPlanetId);
          if (!arrivalPlanet || arrivalPlanet.ownerId !== player.id) break;
          toasts.push({ message: `Fleet arrived at ${arrivalPlanet.planetName}`, isError: false });
          break;
        }
        case 'building_completed': {
          break;
        }
        case 'unit_completed': {
          if (event.empireId !== player.id) break;
          for (const [unitType, count] of Object.entries(event.counts)) {
            if (!count || count <= 0) continue;
            const name = (UNITS as Record<string, { name: string }>)[unitType]?.name ?? unitType;
            unitCounts.set(name, (unitCounts.get(name) ?? 0) + count);
          }
          break;
        }
        case 'notification':
          toasts.push({ message: event.message, isError: false });
          break;
      }
    }

    for (const [name, count] of unitCounts) {
      toasts.push({ message: count > 1 ? `${count}x ${name} completed` : `${name} completed`, isError: false });
    }

    for (const toast of toasts) {
      showToast(toast.message, toast.isError);
    }
  }

  function showNextBattleReport(): void {
    const state = controller.state;
    if (!state || battleReportQueue.length === 0) {
      battleReportScreen?.remove();
      battleReportScreen = null;
      if (speedBeforeBattle !== null && state) {
        changeSpeed(state, speedBeforeBattle as 0 | 1 | 2 | 4);
        speedBeforeBattle = null;
        render();
      }
      return;
    }

    if (speedBeforeBattle === null) {
      speedBeforeBattle = state.currentSpeed;
      changeSpeed(state, SPEEDS.PAUSED);
    }

    const report = battleReportQueue.shift()!;
    const player = getLocalPlayer();
    const isPlayerAttacker = player !== undefined && report.attackerId === player.id;
    const attackerEmpire = getEmpire(state, report.attackerId);
    const defenderEmpire = getEmpire(state, report.defenderId);
    const attackerName = attackerEmpire?.empireName ?? 'Unknown';
    const defenderName = defenderEmpire?.empireName ?? 'Unknown';

    const skipAll = battleReportQueue.length > 0 ? () => {
      battleReportQueue.length = 0;
      showNextBattleReport();
    } : undefined;

    const reportEl = renderBattleReport(report, attackerName, defenderName, isPlayerAttacker, () => {
      showNextBattleReport();
    }, skipAll);

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

    const player = getLocalPlayer();
    if (!player) {
      root.append(errorPanel('Player empire not found.'));
      return;
    }

    const context = createContext(player);
    const isFullPage = viewMode !== 'normal';

    const shell = document.createElement('div');
    shell.className = 'overlay-shell';
    hudPanel = renderHud(context, createMenuCallbacks(state, context));
    shell.append(hudPanel);

    const body = document.createElement('div');
    body.className = isFullPage ? 'overlay-body overlay-body-full' : 'overlay-body';

    leftPanel = document.createElement('div');
    leftPanel.className = isFullPage ? 'overlay-left overlay-left-full' : 'overlay-left';

    // Only populate panels when NOT in galaxy view (or when a menu view is active)
    if (controller.activeScene !== 'galaxy' || isFullPage) {
      leftPanel.append(renderLeftContent(context));
    }

    body.append(leftPanel);
    shell.append(body);
    root.append(shell, toastContainer);
    syncGameOverPanel();

    // Re-attach battle report popup if one was showing before render cleared root
    if (battleReportScreen) {
      root.append(battleReportScreen);
    }
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
        panel = renderResearchFullPanel(context);
        break;
      case 'notifications':
        panel = renderNotificationsFullPanel(context);
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
    closeBtn.addEventListener('click', () => {
      viewMode = 'normal';
      menuOpen = false;
      render();
    });
    panel.style.position = 'relative';
    panel.prepend(closeBtn);

    return panel;
  }

  function renderResearchFullPanel(context: UiContext): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'main-panel interactive';
    const title = document.createElement('h2');
    title.textContent = 'Research';
    panel.append(title, renderResearchContent(context));
    return panel;
  }

  function createNotificationCallbacks(context: UiContext): NotificationCallbacks {
    return {
      onNavigateToPlanet: (systemId, planetId) => {
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
      },
      onViewBattle: (report, attackerId, defenderId) => {
        const state = controller.state!;
        const attackerEmpire = getEmpire(state, attackerId);
        const defenderEmpire = getEmpire(state, defenderId);
        const attackerName = attackerEmpire?.empireName ?? 'Unknown';
        const defenderName = defenderEmpire?.empireName ?? 'Unknown';
        const isPlayerAttacker = context.player.id === attackerId;

        const reportEl = renderBattleReport(report, attackerName, defenderName, isPlayerAttacker, () => {
          battleReportScreen?.remove();
          battleReportScreen = null;
        });

        if (battleReportScreen) {
          battleReportScreen.replaceWith(reportEl);
        } else {
          root.append(reportEl);
        }
        battleReportScreen = reportEl;
      },
    };
  }

  function renderNotificationsFullPanel(context: UiContext): HTMLElement {
    const state = controller.state!;
    const panel = document.createElement('section');
    panel.className = 'main-panel interactive';
    const title = document.createElement('h2');
    title.textContent = 'Notifications';
    const callbacks = createNotificationCallbacks(context);
    panel.append(title, renderNotificationsContent(state, context.player.id, callbacks));
    return panel;
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
      disconnectedPlayers,
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

    const nextGameOverScreen = gameOverScreenPanel(playerWon ?? false, state);
    if (gameOverScreen) {
      gameOverScreen.replaceWith(nextGameOverScreen);
    } else {
      root.append(nextGameOverScreen);
    }
    gameOverScreen = nextGameOverScreen;
  }

  function showToast(message: string, isError: boolean): void {
    // Ensure toast container is in the DOM
    if (!toastContainer.parentElement) {
      root.append(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = isError ? 'toast toast-error' : 'toast';
    toast.textContent = message;
    toastContainer.append(toast);
    // Trigger enter animation on next frame
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    // Each toast manages its own removal independently
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  }

  let eliminatedOverlay: HTMLElement | null = null;

  function showEliminatedOverlay(): void {
    if (eliminatedOverlay) return;
    eliminatedOverlay = document.createElement('div');
    eliminatedOverlay.className = 'eliminated-overlay interactive';
    const banner = document.createElement('div');
    banner.className = 'eliminated-banner';
    const title = document.createElement('h2');
    title.textContent = 'Defeated';
    const msg = document.createElement('p');
    msg.textContent = 'Your empire has been eliminated. You can continue watching or leave.';
    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'ui-button';
    leaveBtn.textContent = 'Leave Game';
    leaveBtn.addEventListener('click', () => {
      controller.multiplayerClient?.disconnect();
      controller.isMultiplayer = false;
      controller.multiplayerClient = null;
      eliminatedOverlay?.remove();
      eliminatedOverlay = null;
      showStartScreen();
    });
    const watchBtn = document.createElement('button');
    watchBtn.type = 'button';
    watchBtn.className = 'ui-button primary';
    watchBtn.textContent = 'Keep Watching';
    watchBtn.addEventListener('click', () => {
      eliminatedOverlay?.remove();
      eliminatedOverlay = null;
    });
    banner.append(title, msg, watchBtn, leaveBtn);
    eliminatedOverlay.append(banner);
    root.append(eliminatedOverlay);
  }

  function ensureChatPanel(): HTMLElement {
    if (chatPanel && chatPanel.parentElement) return chatPanel;
    chatPanel = document.createElement('div');
    chatPanel.className = 'chat-panel interactive';

    const history = document.createElement('div');
    history.className = 'chat-history';
    chatPanel.append(history);

    const inputRow = document.createElement('div');
    inputRow.className = 'chat-input-row';
    const chatInput = document.createElement('input');
    chatInput.type = 'text';
    chatInput.className = 'chat-input';
    chatInput.placeholder = 'Type a message...';
    chatInput.maxLength = 200;
    chatInput.autocomplete = 'off';
    chatInput.spellcheck = false;
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && chatInput.value.trim()) {
        controller.multiplayerClient?.sendChat(chatInput.value.trim());
        chatInput.value = '';
      }
      if (e.key === 'Escape') {
        chatInput.blur();
      }
      e.stopPropagation();
    });
    inputRow.append(chatInput);
    chatPanel.append(inputRow);

    root.append(chatPanel);
    refreshChatPanel();
    return chatPanel;
  }

  function refreshChatPanel(): void {
    if (!chatPanel) return;
    const history = chatPanel.querySelector('.chat-history');
    if (!history) return;
    history.innerHTML = '';
    for (const msg of chatMessages) {
      const line = document.createElement('div');
      line.className = msg.isSystem ? 'chat-msg chat-system' : 'chat-msg';
      line.textContent = msg.isSystem ? msg.text : `${msg.sender}: ${msg.text}`;
      history.append(line);
    }
    history.scrollTop = history.scrollHeight;
  }

  function focusChatInput(): void {
    const panel = ensureChatPanel();
    const input = panel.querySelector<HTMLInputElement>('.chat-input');
    input?.focus();
  }

  function openFilePicker(context: UiContext): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      uploadSave(file).then((loaded) => {
        if (controller.loadGame) {
          controller.loadGame(loaded);
        } else {
          controller.state = loaded;
          controller.overlay.render();
        }
        syncLastSeenEventIds();
        startMusic();
        showToast(`Loaded: ${file.name}`, false);
      }).catch(() => {
        context.setNotice('Failed to load save file.', true);
      });
    });
    input.click();
  }

  function showLoadPicker(context: UiContext): void {
    listSavesInDirectory().then((entries) => {
      if (entries.length === 0) {
        context.setNotice('No save files found in directory.', true);
        return;
      }
      // Show a modal with the list of saves
      const overlay = document.createElement('div');
      overlay.className = 'load-picker-overlay interactive';
      const panel = document.createElement('div');
      panel.className = 'load-picker-panel';
      const title = document.createElement('h3');
      title.textContent = 'Load Save';
      panel.append(title);

      for (const entry of entries) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'load-picker-item';
        const name = document.createElement('span');
        name.textContent = entry.name;
        const date = document.createElement('span');
        date.className = 'load-picker-date';
        date.textContent = new Date(entry.lastModified).toLocaleString();
        row.append(name, date);
        row.addEventListener('click', () => {
          loadFromDirectory(entry).then((loaded) => {
            overlay.remove();
            if (controller.loadGame) {
              controller.loadGame(loaded);
            } else {
              controller.state = loaded;
              controller.overlay.render();
            }
            syncLastSeenEventIds();
            startMusic();
            showToast(`Loaded: ${entry.name}`, false);
          }).catch(() => {
            context.setNotice('Failed to load save file.', true);
          });
        });
        panel.append(row);
      }

      // Browse button to use file picker instead
      const browseBtn = document.createElement('button');
      browseBtn.type = 'button';
      browseBtn.className = 'load-picker-item load-picker-browse';
      browseBtn.textContent = 'Browse other files...';
      browseBtn.addEventListener('click', () => {
        overlay.remove();
        openFilePicker(context);
      });
      panel.append(browseBtn);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });
      overlay.append(panel);
      root.append(overlay);
    }).catch(() => {
      // Fallback to file picker if directory listing fails
      openFilePicker(context);
    });
  }

  return overlay;
}

function errorPanel(message: string): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'game-over-panel interactive';
  panel.textContent = message;
  return panel;
}

function gameOverScreenPanel(playerWon: boolean, state?: GameState | null): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'game-over-screen interactive';
  const panel = document.createElement('div');
  panel.className = 'game-over-panel';
  const title = document.createElement('h2');
  title.textContent = playerWon ? 'Victory' : 'Defeat';
  const message = document.createElement('p');
  message.textContent = playerWon ? 'Your empire controls the galaxy.' : 'Your empire has fallen.';
  panel.append(title, message);

  if (state && state.empires.length > 0) {
    const results = document.createElement('div');
    results.className = 'game-over-results';
    const header = document.createElement('div');
    header.className = 'game-over-results-header';
    header.innerHTML = '<span>Empire</span><span>Planets</span><span>Networth</span>';
    results.append(header);

    const ranked = state.empires
      .map((empire) => {
        const planets = state.planets.filter((p) => p.ownerId === empire.id).length;
        let nw = planets * 100;
        for (const p of state.planets.filter((p) => p.ownerId === empire.id)) {
          for (const key of Object.keys(p.buildings) as Array<keyof typeof p.buildings>) {
            nw += (p.buildings[key] ?? 0) * 50;
          }
        }
        return { empire, planets, nw };
      })
      .sort((a, b) => b.nw - a.nw);

    for (const row of ranked) {
      const rowEl = document.createElement('div');
      rowEl.className = 'game-over-results-row';
      const name = document.createElement('span');
      name.textContent = row.empire.empireName;
      name.style.color = row.empire.color;
      const planets = document.createElement('span');
      planets.textContent = String(row.planets);
      const nw = document.createElement('span');
      nw.textContent = String(row.nw);
      rowEl.append(name, planets, nw);
      results.append(rowEl);
    }
    panel.append(results);
  }

  shell.append(panel);
  return shell;
}
