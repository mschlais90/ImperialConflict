import { button } from './dom';

export function renderStartScreen(root: HTMLElement, onStart: (empireName: string, difficulty: 'easy' | 'normal' | 'hard') => void, onLoad?: () => void, onMultiplayer?: () => void, onTutorial?: () => void): void {
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

  const diffLabel = document.createElement('label');
  diffLabel.textContent = 'Difficulty';
  const diffSelect = document.createElement('select');
  for (const [value, text] of [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    if (value === 'normal') opt.selected = true;
    diffSelect.append(opt);
  }
  diffLabel.append(diffSelect);

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

  panel.append(title, label, diffLabel, btnRow);
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    onStart(input.value.trim() || 'Player Empire', diffSelect.value as 'easy' | 'normal' | 'hard');
  });

  shell.append(panel);
  root.append(shell);
  input.focus();
  input.select();
}
