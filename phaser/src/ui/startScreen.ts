import { button } from './dom';

export interface StartScreenCallbacks {
  onSinglePlayer: () => void;
  onMultiplayer: () => void;
  onTutorial: () => void;
  onSimulator: () => void;
  onLoad: () => void;
}

export function renderStartScreen(root: HTMLElement, callbacks: StartScreenCallbacks): void {
  const shell = document.createElement('div');
  shell.className = 'start-screen interactive';

  const panel = document.createElement('div');
  panel.className = 'start-panel';

  const title = document.createElement('h1');
  title.textContent = 'Imperial Conflict';

  const btnRow = document.createElement('div');
  btnRow.className = 'start-btn-row start-btn-col';
  btnRow.append(
    button('Single Player', callbacks.onSinglePlayer, 'ui-button primary'),
    button('Multiplayer', callbacks.onMultiplayer, 'ui-button'),
    button('Tutorial', callbacks.onTutorial, 'ui-button'),
    button('Simulator', callbacks.onSimulator, 'ui-button'),
  );

  panel.append(title, btnRow);
  shell.append(panel);
  root.append(shell);

  // Hidden load hotkey (developer tool)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'l' || e.key === 'L') {
      callbacks.onLoad();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  // Clean up listener when screen is removed
  const observer = new MutationObserver(() => {
    if (!root.contains(shell)) {
      document.removeEventListener('keydown', onKeyDown);
      observer.disconnect();
    }
  });
  observer.observe(root, { childList: true });
}
