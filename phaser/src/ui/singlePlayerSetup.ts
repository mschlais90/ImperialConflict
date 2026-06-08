import { button } from './dom';

type Difficulty = 'easy' | 'normal' | 'hard';

export interface SinglePlayerOptions {
  empireName: string;
  aiCount: number;
  aiDifficulties: Difficulty[];
}

export function renderSinglePlayerSetup(
  root: HTMLElement,
  onStart: (options: SinglePlayerOptions) => void,
  onBack: () => void,
): void {
  const shell = document.createElement('div');
  shell.className = 'start-screen interactive';

  const panel = document.createElement('form');
  panel.className = 'start-panel sp-setup-panel';

  const title = document.createElement('h1');
  title.textContent = 'Single Player';

  // Empire name
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Empire name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = 'Player Empire';
  nameInput.maxLength = 32;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameLabel.append(nameInput);

  // AI players section
  const aiSection = document.createElement('div');
  aiSection.className = 'sp-ai-section';

  const aiHeader = document.createElement('label');
  aiHeader.textContent = 'Computer players';

  const aiCountSelect = document.createElement('select');
  for (let i = 1; i <= 5; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === 3) opt.selected = true;
    aiCountSelect.append(opt);
  }
  aiHeader.append(aiCountSelect);

  const aiRows = document.createElement('div');
  aiRows.className = 'sp-ai-rows';

  const AI_NAMES = ['Crimson Dominion', 'Verdant Collective', 'Golden Accord', 'Obsidian Empire', 'Azure Syndicate'];

  function buildAiRows(count: number): void {
    aiRows.replaceChildren();
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'sp-ai-row';

      const name = document.createElement('span');
      name.className = 'sp-ai-name';
      name.textContent = AI_NAMES[i] ?? `Empire ${i + 1}`;

      const diffSelect = document.createElement('select');
      diffSelect.dataset.aiIndex = String(i);
      for (const [value, text] of [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']] as const) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        if (value === 'normal') opt.selected = true;
        diffSelect.append(opt);
      }

      row.append(name, diffSelect);
      aiRows.append(row);
    }
  }

  buildAiRows(3);
  aiCountSelect.addEventListener('change', () => {
    buildAiRows(Number(aiCountSelect.value));
  });

  aiSection.append(aiHeader, aiRows);

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'start-btn-row';
  btnRow.append(
    button('Start', () => panel.requestSubmit(), 'ui-button primary'),
    button('Back', onBack, 'ui-button'),
  );

  panel.append(title, nameLabel, aiSection, btnRow);
  panel.addEventListener('submit', (e) => {
    e.preventDefault();
    const aiCount = Number(aiCountSelect.value);
    const aiDifficulties: Difficulty[] = [];
    for (let i = 0; i < aiCount; i++) {
      const sel = aiRows.querySelector(`select[data-ai-index="${i}"]`) as HTMLSelectElement | null;
      aiDifficulties.push((sel?.value as Difficulty) ?? 'normal');
    }
    onStart({
      empireName: nameInput.value.trim() || 'Player Empire',
      aiCount,
      aiDifficulties,
    });
  });

  shell.append(panel);
  root.append(shell);
  nameInput.focus();
  nameInput.select();
}
