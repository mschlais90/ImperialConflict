import { appendEvent, type GameSpeed } from '../events/eventLog';
import type { GameState } from '../galaxy/galaxyData';
import type { CombatUnitKey } from '../models/types';
import { calcEmpireNetworth, getPlanetsForEmpire } from '../selectors/selectors';
import { processEconomyTick } from './economyEngine';

export const SPEEDS = {
  PAUSED: 0,
  NORMAL: 1,
  FAST: 2,
  FASTEST: 4,
  TURBO: 8,
} as const satisfies Record<string, GameSpeed>;

const COMBAT_KEYS: CombatUnitKey[] = ['fighter', 'bomber', 'soldier', 'droid', 'transport'];

export function setSpeed(state: GameState, speed: GameSpeed): void {
  state.currentSpeed = speed;
  appendEvent(state, { type: 'speed_changed', tick: state.currentTick, speed });
}

export function advanceTick(state: GameState): void {
  state.currentTick += 1;
  processEconomyTick(state);
  recordSnapshot(state);
}

function recordSnapshot(state: GameState): void {
  const empires = state.empires.map((empire) => {
    const empirePlanets = getPlanetsForEmpire(state, empire.id);

    let buildings = 0;
    let military = 0;
    for (const p of empirePlanets) {
      for (const count of Object.values(p.buildings)) buildings += count ?? 0;
      for (const k of COMBAT_KEYS) military += p.units[k] ?? 0;
    }
    for (const f of state.fleets) {
      if (f.ownerId !== empire.id || f.isExploration) continue;
      for (const k of COMBAT_KEYS) military += f.units[k] ?? 0;
    }

    return {
      empireId: empire.id,
      planets: empirePlanets.length,
      networth: Math.floor(calcEmpireNetworth(state, empire.id)),
      buildings,
      military,
    };
  });

  state.tickSnapshots.push({ tick: state.currentTick, empires });
}
