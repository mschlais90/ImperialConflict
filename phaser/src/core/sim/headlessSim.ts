import type { AiStrategy } from '../galaxy/galaxyData';
import { createNewGame } from '../engines/gameManager';
import { advanceTick } from '../engines/tickEngine';
import type { GameState } from '../galaxy/galaxyData';
import type { UnitKey } from '../models/types';
import { calcEmpireNetworth, getPlanetsForEmpire } from '../selectors/selectors';

// Headless all-AI game runner for balance and AI work. Pure and deterministic:
// the same options always produce the same result, so A/B comparisons over a
// batch of seeds are meaningful. Used by src/tools/simulate.ts and tests.

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface SimEmpireConfig {
  difficulty?: Difficulty;
  strategy?: AiStrategy;
}

export interface SimOptions {
  seed: number;
  /** One entry per empire; length = empire count. */
  empires: SimEmpireConfig[];
  /** Stop after this many ticks even if several empires survive. */
  maxTicks: number;
}

export interface EmpireSimResult {
  empireId: number;
  difficulty: Difficulty;
  strategy: AiStrategy;
  /** 1 = winner / highest networth at the end. */
  rank: number;
  eliminatedTick: number | null;
  finalPlanets: number;
  peakPlanets: number;
  finalNetworth: number;
  attacksLaunched: number;
  attacksWon: number;
  defencesHeld: number;
  planetsCaptured: number;
  planetsLost: number;
  colonized: number;
  unitsBuilt: Partial<Record<UnitKey, number>>;
  opsLaunched: Record<string, number>;
}

export interface SimResult {
  seed: number;
  ticksPlayed: number;
  /** Empire id that eliminated everyone else, or null if time ran out. */
  conquestWinnerId: number | null;
  firstEliminationTick: number | null;
  empires: EmpireSimResult[];
  /** networth of each empire sampled every 50 ticks, for snowball analysis. */
  networthCurve: Array<{ tick: number; networth: number[] }>;
}

export function runAiGame(options: SimOptions): SimResult {
  const state = createNewGame({ seed: options.seed, empireCount: options.empires.length, empireName: 'AI 0' });
  configureEmpires(state, options.empires);

  const stats = state.empires.map((empire) => ({
    empireId: empire.id,
    eliminatedTick: null as number | null,
    peakPlanets: getPlanetsForEmpire(state, empire.id).length,
    attacksLaunched: 0,
    attacksWon: 0,
    defencesHeld: 0,
    planetsCaptured: 0,
    planetsLost: 0,
    colonized: 0,
    unitsBuilt: {} as Partial<Record<UnitKey, number>>,
    opsLaunched: {} as Record<string, number>,
  }));
  const seenMissionIds = new Set<number>();
  const networthCurve: SimResult['networthCurve'] = [];
  let nextEventId = state.nextEventId;
  let firstEliminationTick: number | null = null;

  while (state.currentTick < options.maxTicks) {
    advanceTick(state);

    // Events can be pruned from the log; read only the ones appended this tick.
    for (const event of state.events) {
      if (event.id < nextEventId) continue;
      switch (event.type) {
        case 'battle_resolved':
          stats[event.attackerId].attacksLaunched += 1;
          if (event.report.attackerWon) {
            stats[event.attackerId].attacksWon += 1;
            stats[event.attackerId].planetsCaptured += 1;
            if (event.defenderId >= 0) stats[event.defenderId].planetsLost += 1;
          } else if (event.defenderId >= 0) {
            stats[event.defenderId].defencesHeld += 1;
          }
          break;
        case 'planet_colonized':
          stats[event.empireId].colonized += 1;
          break;
        case 'unit_completed':
          for (const [unit, n] of Object.entries(event.counts)) {
            const key = unit as UnitKey;
            stats[event.empireId].unitsBuilt[key] = (stats[event.empireId].unitsBuilt[key] ?? 0) + (n ?? 0);
          }
          break;
        case 'empire_eliminated':
          stats[event.empireId].eliminatedTick = event.tick;
          firstEliminationTick ??= event.tick;
          break;
      }
    }
    nextEventId = state.nextEventId;

    for (const empire of state.empires) {
      for (const mission of empire.missions) {
        if (seenMissionIds.has(mission.id)) continue;
        seenMissionIds.add(mission.id);
        stats[empire.id].opsLaunched[mission.opType] = (stats[empire.id].opsLaunched[mission.opType] ?? 0) + 1;
      }
      const planets = getPlanetsForEmpire(state, empire.id).length;
      stats[empire.id].peakPlanets = Math.max(stats[empire.id].peakPlanets, planets);
    }

    if (state.currentTick % 50 === 0) {
      networthCurve.push({ tick: state.currentTick, networth: state.empires.map((e) => Math.floor(calcEmpireNetworth(state, e.id))) });
    }

    if (state.empires.filter((e) => !e.isEliminated).length <= 1) break;
  }

  const survivors = state.empires.filter((e) => !e.isEliminated);
  const ranked = [...state.empires].sort((a, b) => {
    // Survivors rank above eliminated empires; survivors by networth, the
    // eliminated by how long they lasted.
    if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
    if (!a.isEliminated) return calcEmpireNetworth(state, b.id) - calcEmpireNetworth(state, a.id);
    return (stats[b.id].eliminatedTick ?? 0) - (stats[a.id].eliminatedTick ?? 0);
  });

  return {
    seed: options.seed,
    ticksPlayed: state.currentTick,
    conquestWinnerId: survivors.length === 1 ? survivors[0].id : null,
    firstEliminationTick,
    networthCurve,
    empires: stats.map((s) => {
      const controller = state.aiControllers[s.empireId];
      return {
        ...s,
        difficulty: controller.difficulty,
        strategy: controller.strategy ?? 'adaptive',
        rank: ranked.findIndex((e) => e.id === s.empireId) + 1,
        finalPlanets: getPlanetsForEmpire(state, s.empireId).length,
        finalNetworth: Math.floor(calcEmpireNetworth(state, s.empireId)),
      };
    }),
  };
}

function configureEmpires(state: GameState, configs: SimEmpireConfig[]): void {
  for (const empire of state.empires) {
    const config = configs[empire.id] ?? {};
    empire.controllerType = 'ai';
    state.aiControllers[empire.id] = {
      empireId: empire.id,
      difficulty: config.difficulty ?? 'hard',
      strategy: config.strategy,
      recentAttacks: {},
    };
  }
}
