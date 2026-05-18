import { setResearchAllocation } from '../core/commands/playerCommands';
import type { ScienceKey } from '../core/models/types';
import { button, numberInput, parseIntegerInput } from './dom';
import type { UiContext } from './types';

const SCIENCE_KEYS: ScienceKey[] = ['military', 'welfare', 'economy', 'construction', 'resources'];

export function renderResearchPanel(context: UiContext): HTMLElement {
  const state = context.controller.state;
  if (!state) {
    throw new Error('Research panel requires game state.');
  }

  const panel = document.createElement('section');
  panel.className = 'side-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Research';
  panel.append(title);

  const inputs = new Map<ScienceKey, HTMLInputElement>();
  const total = document.createElement('div');
  total.className = 'form-note';

  const updateTotal = (): void => {
    const parsed = parseAllocation(inputs);
    if (!parsed.ok) {
      total.textContent = 'Total allocation: invalid';
      total.classList.add('error-text');
      return;
    }
    const sum = SCIENCE_KEYS.reduce((value, key) => value + parsed.allocation[key], 0);
    total.textContent = `Total allocation: ${sum}%`;
    total.classList.toggle('error-text', sum !== 100);
  };

  for (const science of SCIENCE_KEYS) {
    const row = document.createElement('label');
    row.className = 'form-row';
    row.append(labelText(science));
    const input = numberInput(context.player.researchAllocation[science], { min: 0, max: 100 });
    input.addEventListener('input', updateTotal);
    inputs.set(science, input);
    row.append(input);
    panel.append(row);
  }

  const apply = button('Apply research', () => {
    const parsed = parseAllocation(inputs);
    if (!parsed.ok) {
      context.setNotice(parsed.message, true);
      return;
    }
    const allocation = parsed.allocation;
    const sum = SCIENCE_KEYS.reduce((value, key) => value + allocation[key], 0);
    if (sum !== 100) {
      context.setNotice('Research allocation must total 100.', true);
      return;
    }
    context.runCommand(() => setResearchAllocation(state, { empireId: context.player.id, allocation }));
  });

  panel.append(total, apply);
  updateTotal();
  return panel;
}

function labelText(value: string): Text {
  return document.createTextNode(value.replace('_', ' '));
}

function parseAllocation(
  inputs: Map<ScienceKey, HTMLInputElement>,
): { ok: true; allocation: Record<ScienceKey, number> } | { ok: false; message: string } {
  const allocation = {} as Record<ScienceKey, number>;
  for (const science of SCIENCE_KEYS) {
    const parsed = parseIntegerInput(inputs.get(science)?.value ?? '', {
      label: `${displayScience(science)} allocation`,
      min: 0,
      max: 100,
    });
    if (!parsed.ok) {
      return parsed;
    }
    allocation[science] = parsed.value;
  }
  return { ok: true, allocation };
}

function displayScience(science: ScienceKey): string {
  return science.charAt(0).toUpperCase() + science.slice(1).replace('_', ' ');
}
