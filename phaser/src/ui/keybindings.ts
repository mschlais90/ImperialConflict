import type { GameSpeed } from '../core/events/eventLog';
import type { GameState } from '../core/galaxy/galaxyData';
import { SPEEDS } from '../core/engines/tickEngine';

// Global keyboard shortcuts. The overlay supplies callbacks; this module only
// maps keys to intents. Keep SHORTCUTS (the "?" help) in sync with the
// handler below, and update tutorialScreen.ts when hotkeys change.

export type ViewMode =
  | 'normal' | 'economy' | 'standings' | 'history' | 'massBuild' | 'ops' | 'fleet'
  | 'settings' | 'research' | 'notifications' | 'exploration';

/** Hotkeys that toggle a full-page panel on/off. */
const VIEW_HOTKEYS: Record<string, ViewMode> = {
  e: 'exploration',
  a: 'standings',
  h: 'history',
  b: 'massBuild',
  o: 'ops',
  f: 'fleet',
  r: 'economy',
  n: 'notifications',
  s: 'settings',
};

const SPEED_HOTKEYS: Record<string, GameSpeed> = {
  '0': SPEEDS.PAUSED,
  '1': SPEEDS.NORMAL,
  '2': SPEEDS.FAST,
  '3': SPEEDS.FASTEST,
  '4': SPEEDS.TURBO,
};

const SHORTCUTS: Array<[string, string]> = [
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
  ['1–4', 'Set speed (1x–8x)'],
  ['ESC', 'Close / Galaxy'],
  ['?', 'This help'],
];

export interface KeybindingHandlers {
  getState(): GameState | null | undefined;
  isMultiplayer(): boolean;
  getViewMode(): ViewMode;
  isMenuOpen(): boolean;
  /** Set view + close the menu, then re-render. */
  setView(mode: ViewMode): void;
  closeMenu(): void;
  switchToGalaxy(): void;
  /** Close the battle report if open; returns true if one was open. */
  dismissBattleReport(): boolean;
  toggleShortcutHelp(): void;
  focusChat(): void;
  changeSpeed(state: GameState, speed: GameSpeed): void;
  /** Called after a speed change so the HUD updates. */
  afterSpeedChange(): void;
}

export function installKeybindings(handlers: KeybindingHandlers): void {
  let lastNonZeroSpeed: GameSpeed = SPEEDS.NORMAL;

  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement) {
      return;
    }

    const state = handlers.getState();
    if (!state || state.currentState === 'main_menu') return;

    const key = event.key.toLowerCase();

    // Close battle report on any hotkey press
    if (handlers.dismissBattleReport() && key === 'escape') return;

    const view = VIEW_HOTKEYS[key];
    if (view !== undefined) {
      handlers.setView(handlers.getViewMode() === view ? 'normal' : view);
      return;
    }

    const speed = SPEED_HOTKEYS[key];
    if (speed !== undefined) {
      handlers.changeSpeed(state, speed);
      handlers.afterSpeedChange();
      return;
    }

    switch (key) {
      case 'g':
        handlers.switchToGalaxy();
        break;
      case 'escape':
        if (handlers.isMenuOpen()) {
          handlers.closeMenu();
        } else if (handlers.getViewMode() !== 'normal') {
          handlers.setView('normal');
        }
        break;
      case '?':
        handlers.toggleShortcutHelp();
        break;
      case 'enter':
        if (handlers.isMultiplayer()) {
          handlers.focusChat();
          event.preventDefault();
        }
        break;
      case ' ':
        if (!handlers.isMultiplayer()) {
          if (state.currentSpeed === 0) {
            handlers.changeSpeed(state, lastNonZeroSpeed);
          } else {
            lastNonZeroSpeed = state.currentSpeed;
            handlers.changeSpeed(state, SPEEDS.PAUSED);
          }
          handlers.afterSpeedChange();
          event.preventDefault();
        }
        break;
    }
  });
}

/** Returns a toggle for the "?" keyboard shortcut help overlay. */
export function createShortcutHelp(root: HTMLElement): () => void {
  let helpEl: HTMLElement | null = null;

  const toggle = (): void => {
    if (helpEl) {
      helpEl.remove();
      helpEl = null;
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'shortcut-help interactive';
    const panel = document.createElement('div');
    panel.className = 'shortcut-help-panel';
    const title = document.createElement('h3');
    title.textContent = 'Keyboard Shortcuts';
    panel.append(title);
    for (const [key, desc] of SHORTCUTS) {
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      row.innerHTML = `<kbd>${key}</kbd><span>${desc}</span>`;
      panel.append(row);
    }
    overlay.append(panel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) toggle();
    });
    root.append(overlay);
    helpEl = overlay;
  };

  return toggle;
}
