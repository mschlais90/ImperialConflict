import { button } from './dom';

export function renderStartScreen(root: HTMLElement, onStart: (empireName: string) => void, onLoad?: () => void, onMultiplayer?: () => void, onTutorial?: () => void): void {
  const shell = document.createElement('div');
  shell.className = 'start-screen interactive';

  const panel = document.createElement('form');
  panel.className = 'start-panel';

  const title = document.createElement('h1');
  title.textContent = 'Imperial Conflict';

  const label = document.createElement('label');
  label.textContent = 'Empire name';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = 'Player Empire';
  input.maxLength = 32;
  input.autocomplete = 'off';
  input.spellcheck = false;

  label.append(input);

  const btnRow = document.createElement('div');
  btnRow.className = 'start-btn-row';
  btnRow.append(button('Start', () => panel.requestSubmit(), 'ui-button primary'));
  if (onLoad) {
    const loadBtn = button('Load', () => onLoad(), 'ui-button');
    loadBtn.type = 'button';
    btnRow.append(loadBtn);
  }
  if (onMultiplayer) {
    const mpBtn = button('Multiplayer', () => onMultiplayer(), 'ui-button');
    mpBtn.type = 'button';
    btnRow.append(mpBtn);
  }
  if (onTutorial) {
    const tutBtn = button('Tutorial', () => onTutorial(), 'ui-button');
    tutBtn.type = 'button';
    btnRow.append(tutBtn);
  }

  panel.append(title, label, btnRow);
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    onStart(input.value.trim() || 'Player Empire');
  });

  shell.append(panel);
  root.append(shell);
  input.focus();
  input.select();
}
