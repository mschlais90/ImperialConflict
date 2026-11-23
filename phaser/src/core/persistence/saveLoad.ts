import type { GameState } from '../galaxy/galaxyData';
import { createRngFromState } from '../random/rng';

/**
 * Pure save (de)serialization and version migrations. Browser storage
 * (localStorage, file download/upload, File System Access API) lives in
 * `app/savePersistence.ts` so the core stays free of DOM APIs.
 */

const SAVE_VERSION = 3;

interface SaveData {
  version: number;
  timestamp: number;
  rngState: number;
  gameState: Omit<GameState, 'rng'>;
}

export function serializeSave(state: GameState, timestamp: number): string {
  const rngState = state.rng?.getState() ?? 0;
  const { rng: _rng, ...rest } = state;
  const save: SaveData = { version: SAVE_VERSION, timestamp, rngState, gameState: rest };
  return JSON.stringify(save);
}

export function deserializeSave(json: string): GameState {
  const save: SaveData = JSON.parse(json);
  if (save.version === 1) {
    migrateV1toV2(save);
    save.version = 2;
  }
  if (save.version === 2) {
    migrateV2toV3(save);
    save.version = 3;
  }
  if (save.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${save.version}`);
  }
  return { ...save.gameState, tickSnapshots: save.gameState.tickSnapshots ?? [], rng: createRngFromState(save.rngState) };
}

function migrateV1toV2(save: SaveData): void {
  for (const empire of save.gameState.empires) {
    const legacy = empire as unknown as Record<string, unknown>;
    if ('isPlayer' in legacy) {
      legacy.controllerType = legacy.isPlayer ? 'human' : 'ai';
      delete legacy.isPlayer;
    }
  }
}

/** v3 adds timed ops missions. */
function migrateV2toV3(save: SaveData): void {
  for (const empire of save.gameState.empires) {
    empire.missions ??= [];
  }
  save.gameState.nextMissionId ??= 0;
}
