import type { ResourceKey } from '../core/models/types';

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  gc: 'GC',
  food: 'food',
  iron: 'iron',
  endurium: 'endurium',
  octarine: 'octarine',
};

const RESOURCE_ORDER: ResourceKey[] = ['gc', 'food', 'iron', 'endurium', 'octarine'];

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

export function resourceCostText(cost: Partial<Record<ResourceKey, number>>): string {
  const parts = RESOURCE_ORDER.flatMap((resource) => {
    const amount = cost[resource] ?? 0;
    return amount > 0 ? [`${formatNumber(amount)} ${RESOURCE_LABELS[resource]}`] : [];
  });

  return parts.length > 0 ? parts.join(', ') : 'Free';
}
