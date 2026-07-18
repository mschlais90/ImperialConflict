import type { GameState } from '../galaxy/galaxyData';
import type { Empire } from '../models/types';

/** Empires that were under human control when the game was saved. */
export function listHumanEmpires(state: Pick<GameState, 'empires'>): Empire[] {
  return state.empires.filter((e) => e.controllerType === 'human' && !e.isEliminated);
}

/** A save from a multiplayer session has more than one human empire. */
export function isMultiplayerSave(state: Pick<GameState, 'empires'>): boolean {
  return listHumanEmpires(state).length > 1;
}

/** Hand an empire to the AI, creating its controller state if missing. */
export function demoteEmpireToAi(state: GameState, empireId: number): void {
  const empire = state.empires[empireId];
  if (!empire) return;
  empire.controllerType = 'ai';
  if (!state.aiControllers[empireId]) {
    state.aiControllers[empireId] = {
      empireId,
      difficulty: state.difficulty ?? 'normal',
      recentAttacks: {},
    };
  }
}

/**
 * Convert a multiplayer save into a single-player game: the saving player's
 * empire (selectedEmpireId, falling back to the first human) stays human and
 * every other human empire is handed to the AI. Returns the kept empire's id.
 */
export function convertToSinglePlayer(state: GameState): number {
  const humans = listHumanEmpires(state);
  const selected = humans.find((e) => e.id === state.selectedEmpireId);
  const kept = selected ?? humans[0];
  for (const empire of humans) {
    if (empire.id !== kept.id) demoteEmpireToAi(state, empire.id);
  }
  state.selectedEmpireId = kept.id;
  return kept.id;
}
