import { appendEvent, type GameSpeed } from '../events/eventLog';
import type { GameState } from '../galaxy/galaxyData';
import { processEconomyTick } from './economyEngine';

export const SPEEDS = {
  PAUSED: 0,
  NORMAL: 1,
  FAST: 2,
  FASTEST: 4,
  TURBO: 8,
} as const satisfies Record<string, GameSpeed>;

export function setSpeed(state: GameState, speed: GameSpeed): void {
  state.currentSpeed = speed;
  appendEvent(state, { type: 'speed_changed', tick: state.currentTick, speed });
}

export function advanceTick(state: GameState): void {
  state.currentTick += 1;
  processEconomyTick(state);
  appendEvent(state, { type: 'tick_processed', tick: state.currentTick });
}
