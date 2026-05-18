import { calcEmpireNetworth, getPlanetsForEmpire } from '../core/selectors/selectors';
import { setSpeed, SPEEDS } from '../core/engines/tickEngine';
import { button, formatNumber } from './dom';
import type { UiContext } from './types';

const SPEED_OPTIONS = [
  { label: 'Pause', value: SPEEDS.PAUSED },
  { label: '1x', value: SPEEDS.NORMAL },
  { label: '2x', value: SPEEDS.FAST },
  { label: '4x', value: SPEEDS.FASTEST },
] as const;

export function renderHud(context: UiContext): HTMLElement {
  const { controller, player } = context;
  const state = controller.state;
  if (!state) {
    throw new Error('HUD requires game state.');
  }

  const panel = document.createElement('section');
  panel.className = 'hud-panel interactive';

  const resources = document.createElement('div');
  resources.className = 'hud-resources';
  for (const resource of ['gc', 'food', 'iron', 'endurium', 'octarine'] as const) {
    const item = document.createElement('div');
    item.className = 'hud-stat';
    item.innerHTML = `<span>${resource === 'gc' ? 'GC' : resource}</span><strong>${formatNumber(player.resources[resource])}</strong>`;
    resources.append(item);
  }

  const meta = document.createElement('div');
  meta.className = 'hud-meta';
  meta.append(
    stat('Tick', formatNumber(state.currentTick)),
    stat('Speed', `${state.currentSpeed}x`),
    stat('Net worth', formatNumber(calcEmpireNetworth(state, player.id))),
    stat('Planets', formatNumber(getPlanetsForEmpire(state, player.id).length)),
  );

  const speeds = document.createElement('div');
  speeds.className = 'speed-controls';
  for (const speed of SPEED_OPTIONS) {
    const speedButton = button(speed.label, () => {
      setSpeed(state, speed.value);
      controller.overlay.render();
    });
    speedButton.classList.toggle('active', state.currentSpeed === speed.value);
    speeds.append(speedButton);
  }

  panel.append(resources, meta, speeds);
  return panel;
}

function stat(label: string, value: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'hud-stat';
  element.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return element;
}
