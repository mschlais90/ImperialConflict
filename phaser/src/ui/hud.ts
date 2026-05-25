import { calcEmpireNetworth, getPlanetsForEmpire } from '../core/selectors/selectors';
import { calcEconomyBreakdown } from '../core/selectors/economySelectors';
import { setSpeed, SPEEDS } from '../core/engines/tickEngine';
import { button, formatNumber } from './dom';
import type { UiContext } from './types';

export interface MenuCallbacks {
  isOpen: boolean;
  toggle: () => void;
  selectView: (mode: string) => void;
  save: () => void;
  load: () => void;
}

const SPEED_OPTIONS = [
  { label: 'Pause', value: SPEEDS.PAUSED },
  { label: '1x', value: SPEEDS.NORMAL },
  { label: '2x', value: SPEEDS.FAST },
  { label: '4x', value: SPEEDS.FASTEST },
] as const;

const MENU_ITEMS: Array<{ label: string; key: string; mode: string | null }> = [
  { label: 'Planet Builder', key: 'B', mode: 'massBuild' },
  { label: 'Fleet Management', key: 'F', mode: 'fleet' },
  { label: 'Special Ops', key: 'O', mode: 'ops' },
  { label: 'Research', key: 'R', mode: 'research' },
  { label: 'Notifications', key: 'N', mode: 'notifications' },
  { label: 'Save', key: '', mode: null },
  { label: 'Load', key: '', mode: null },
];

export function renderHud(context: UiContext, menu?: MenuCallbacks): HTMLElement {
  const { controller, player } = context;
  const state = controller.state;
  if (!state) {
    throw new Error('HUD requires game state.');
  }

  const panel = document.createElement('section');
  panel.className = 'hud-panel interactive';

  const breakdown = calcEconomyBreakdown(state, player.id);
  const netGc = breakdown.isStarving
    ? Math.trunc(breakdown.income.total / 2) - breakdown.upkeep.total
    : breakdown.income.total - breakdown.upkeep.total;
  const perTick: Record<string, number> = {
    gc: netGc,
    food: breakdown.production.food.total - breakdown.foodConsumption.total - (breakdown.decay.food ?? 0),
    iron: breakdown.production.iron.total - (breakdown.decay.iron ?? 0),
    endurium: breakdown.production.endurium.total - (breakdown.decay.endurium ?? 0),
    octarine: breakdown.production.octarine.total - (breakdown.decay.octarine ?? 0),
  };

  const resources = document.createElement('div');
  resources.className = 'hud-resources';
  for (const resource of ['gc', 'food', 'iron', 'endurium', 'octarine'] as const) {
    const net = perTick[resource];
    const sign = net >= 0 ? '+' : '';
    const colorClass = net >= 0 ? 'tick-positive' : 'tick-negative';
    const item = document.createElement('div');
    item.className = 'hud-stat';
    item.innerHTML = `<span>${resource === 'gc' ? 'GC' : resource}</span><strong>${formatNumber(player.resources[resource])} <span class="${colorClass}">(${sign}${formatNumber(net)})</span></strong>`;
    resources.append(item);
  }

  const meta = document.createElement('div');
  meta.className = 'hud-meta';
  meta.append(
    stat('Tick', formatNumber(state.currentTick)),
    stat('Net worth', formatNumber(calcEmpireNetworth(state, player.id))),
    stat('Planets', formatNumber(getPlanetsForEmpire(state, player.id).length)),
  );

  const speeds = document.createElement('div');
  speeds.className = 'speed-controls';
  for (const speed of SPEED_OPTIONS) {
    const speedButton = button(speed.label, () => {
      setSpeed(state, speed.value);
      controller.overlay.refreshAfterTick();
    });
    const isActive = state.currentSpeed === speed.value;
    speedButton.classList.toggle('active', isActive);
    speedButton.setAttribute('aria-pressed', String(isActive));
    speeds.append(speedButton);
  }

  // Menu button
  const menuWrapper = document.createElement('div');
  menuWrapper.className = 'menu-wrapper';

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'menu-button interactive';
  menuBtn.innerHTML = menu?.isOpen ? '&#x2715;' : '&#9776;';
  menuBtn.title = 'Menu';
  if (menu) {
    menuBtn.addEventListener('click', menu.toggle);
  }
  menuWrapper.append(menuBtn);

  if (menu?.isOpen) {
    const dropdown = document.createElement('div');
    dropdown.className = 'menu-dropdown interactive';
    for (const item of MENU_ITEMS) {
      const menuItem = document.createElement('button');
      menuItem.type = 'button';
      menuItem.className = 'menu-item';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      menuItem.append(labelSpan);
      if (item.key) {
        const kbd = document.createElement('kbd');
        kbd.textContent = item.key;
        menuItem.append(kbd);
      }
      if (item.mode) {
        const mode = item.mode;
        menuItem.addEventListener('click', () => menu.selectView(mode));
      } else if (item.label === 'Save') {
        menuItem.addEventListener('click', () => menu.save());
      } else if (item.label === 'Load') {
        menuItem.addEventListener('click', () => menu.load());
      }
      dropdown.append(menuItem);
    }
    menuWrapper.append(dropdown);
  }

  panel.append(menuWrapper, resources, meta, speeds);

  return panel;
}

function stat(label: string, value: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'hud-stat';
  element.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return element;
}
