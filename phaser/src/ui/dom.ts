import type { ResourceKey } from '../core/models/types';
import { resourceIcon } from './resourceIcons';

export const RESOURCE_ORDER: ResourceKey[] = ['gc', 'food', 'iron', 'endurium', 'octarine'];

export function clearElement(element: HTMLElement): void {
  element.replaceChildren();
}

export function button(label: string, onClick: () => void, className = 'ui-button'): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

export function numberInput(value: number, options: { min?: number; max?: number; step?: number } = {}): HTMLInputElement {
  const element = document.createElement('input');
  element.type = 'number';
  element.value = String(value);
  element.min = String(options.min ?? 0);
  element.step = String(options.step ?? 1);
  if (options.max !== undefined) {
    element.max = String(options.max);
  }
  return element;
}

export function labeledControl(label: string, control: HTMLElement): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'form-row';
  row.append(document.createTextNode(label), control);
  return row;
}

export type IntegerInputResult = { ok: true; value: number } | { ok: false; message: string };

export function parseIntegerInput(
  rawValue: string,
  options: { label: string; min?: number; max?: number } = { label: 'Value' },
): IntegerInputResult {
  const trimmed = rawValue.trim();
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, message: `${options.label} must be a whole number.` };
  }
  if (options.min !== undefined && value < options.min) {
    return { ok: false, message: `${options.label} must be at least ${options.min}.` };
  }
  if (options.max !== undefined && value > options.max) {
    return { ok: false, message: `${options.label} must be at most ${options.max}.` };
  }
  return { ok: true, value };
}

export function select<T extends string | number>(
  options: Array<{ label: string; value: T }>,
  currentValue: T,
): HTMLSelectElement {
  const element = document.createElement('select');
  for (const option of options) {
    const child = document.createElement('option');
    child.value = String(option.value);
    child.textContent = option.label;
    child.selected = option.value === currentValue;
    element.append(child);
  }
  return element;
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function resourceCostHtml(cost: Partial<Record<ResourceKey, number>>): string {
  const parts = RESOURCE_ORDER.flatMap((resource) => {
    const amount = cost[resource] ?? 0;
    return amount > 0 ? [`${formatNumber(amount)}\u00a0${resourceIcon(resource)}`] : [];
  });

  return parts.length > 0 ? parts.join(', ') : 'Free';
}

const collapsibleState = new Map<string, boolean>();

export function collapsible(id: string, title: string | HTMLElement, contentFn: () => HTMLElement, defaultExpanded: boolean): HTMLElement {
  const details = document.createElement('details');
  details.className = 'collapsible';
  const isOpen = collapsibleState.get(id) ?? defaultExpanded;
  details.open = isOpen;

  const summary = document.createElement('summary');
  if (typeof title === 'string') {
    summary.textContent = title;
  } else {
    summary.append(title);
  }
  details.append(summary, contentFn());

  details.addEventListener('toggle', () => {
    collapsibleState.set(id, details.open);
  });

  return details;
}

export function maxAffordable(resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>): number {
  let max = Infinity;
  for (const resource of RESOURCE_ORDER) {
    const amount = cost[resource];
    if (amount !== undefined && amount > 0) {
      max = Math.min(max, Math.floor(resources[resource] / amount));
    }
  }
  return max === Infinity ? 0 : Math.max(max, 0);
}
