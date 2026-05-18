import { button } from './dom';

export function renderStartScreen(root: HTMLElement, onStart: (empireName: string) => void): void {
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
  panel.append(title, label, button('Start', () => panel.requestSubmit(), 'ui-button primary'));
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    onStart(input.value.trim() || 'Player Empire');
  });

  shell.append(panel);
  root.append(shell);
  input.focus();
  input.select();
}
