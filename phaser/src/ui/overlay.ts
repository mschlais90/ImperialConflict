import type { AppController, AppOverlay } from '../app/appController';
import type { BattleReport } from '../core/engines/combatEngine';
import { createNewGame } from '../core/engines/gameManager';
import { downloadSave, uploadSave, getSavedDirHandle, saveToDirectory, listSavesInDirectory, loadFromDirectory } from '../core/persistence/saveLoad';
import { setSpeed, SPEEDS } from '../core/engines/tickEngine';
import { BUILDINGS } from '../core/data/buildings';
import { UNITS } from '../core/data/units';
import { getEmpire, getPlanet, getPlayerEmpire } from '../core/selectors/selectors';
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
  let forcedGameOver: boolean | null = null;

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
      case '0':
        setSpeed(state, SPEEDS.PAUSED);
        refreshAfterTick();
        break;
      case '1':
        setSpeed(state, SPEEDS.NORMAL);
        refreshAfterTick();
        break;
      case '2':
        setSpeed(state, SPEEDS.FAST);
        refreshAfterTick();
        break;
      case '3':
      case '4':
        setSpeed(state, SPEEDS.FASTEST);
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
      ['E', 'Economy'],
      ['A', 'Standings'],
      ['H', 'Battle History'],
      ['B', 'Planet Builder'],
      ['F', 'Fleet Management'],
      ['R', 'Research'],
      ['N', 'Notifications'],
      ['O', 'Special Ops'],
      ['S', 'Settings'],
      ['0', 'Pause'],
      ['1–4', 'Set speed'],
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
    clearElement(root);
    root.append(toastContainer);
    renderStartScreen(root, (empireName) => {
      forcedGameOver = null;
      viewMode = 'normal';
      battleReportQueue = [];
      speedBeforeBattle = null;
      battleReportScreen?.remove();
      battleReportScreen = null;
      if (controller.startNewGame) {
        controller.startNewGame(empireName);
        syncLastSeenEventIds();
        return;
      }
      controller.playerName = empireName;
      controller.state = createNewGame({ empireName });
      syncLastSeenEventIds();
      render();
    }, () => {
      getSavedDirHandle().then((dir) => {
        if (dir) {
          showLoadPicker({
            controller,
            player: undefined as never,
            runCommand: () => {},
            setNotice: (msg, isError) => showToast(msg, isError ?? false),
          });
        } else {
          openFilePicker({
            controller,
            player: undefined as never,
            runCommand: () => {},
            setNotice: (msg, isError) => showToast(msg, isError ?? false),
          });
        }
      });
    });
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
    const nextHudPanel = renderHud(context, createMenuCallbacks(state, context));
    hudPanel.replaceWith(nextHudPanel);
    hudPanel = nextHudPanel;

    // Refresh left panel only if no input focus
    if (!leftHasFocus) {
      const leftScroll = leftPanel.querySelector('.main-panel')?.scrollTop ?? 0;
      const nextLeftPanel = document.createElement('div');
      nextLeftPanel.className = isFullPage ? 'overlay-left overlay-left-full' : 'overlay-left';
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
    checkForNewEvents();
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

  function checkForNewEvents(): void {
    const state = controller.state;
    if (!state) return;
    const player = getPlayerEmpire(state);
    if (!player) return;

    const newEvents = state.events.filter((e) => e.id > lastSeenEventId);
    if (newEvents.length === 0) return;
    lastSeenEventId = newEvents[newEvents.length - 1].id;

    // Group building/unit completions by type for concise toasts
    const buildingCounts = new Map<string, number>();
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
          const isPlayer = event.empireId === player.id;
          toasts.push({ message: `${name} has been eliminated!`, isError: isPlayer });
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
          const planet = state.planets.find((p) => p.id === event.planetId);
          if (!planet || planet.ownerId !== player.id) break;
          const name = (BUILDINGS as Record<string, { name: string }>)[event.buildingType]?.name ?? event.buildingType;
          buildingCounts.set(name, (buildingCounts.get(name) ?? 0) + 1);
          break;
        }
        case 'unit_completed': {
          const planet = state.planets.find((p) => p.id === event.planetId);
          if (!planet || planet.ownerId !== player.id) break;
          const name = (UNITS as Record<string, { name: string }>)[event.unitType]?.name ?? event.unitType;
          unitCounts.set(name, (unitCounts.get(name) ?? 0) + 1);
          break;
        }
        case 'notification':
          toasts.push({ message: event.message, isError: false });
          break;
      }
    }

    for (const [name, count] of buildingCounts) {
      toasts.push({ message: count > 1 ? `${count}x ${name} completed` : `${name} completed`, isError: false });
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

    const player = getPlayerEmpire(state);
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
    const state = controller.state!;
    const panel = document.createElement('section');
    panel.className = 'main-panel interactive';
    const title = document.createElement('h2');
    title.textContent = 'Notifications';
    panel.append(title, renderNotificationsContent(state));
    return panel;
  }

  function createContext(player: NonNullable<ReturnType<typeof getPlayerEmpire>>): UiContext {
    return {
      controller,
      player,
      runCommand(command) {
        const result = command();
        showToast(result.message, !result.ok);
        if (result.ok) {
          controller.refreshScene?.();
        }
        render();
      },
      setNotice(message, isError = false, rerender = false) {
        showToast(message, isError);
        if (rerender) render();
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
