import type { GameState } from '../galaxy/galaxyData';
import { createRngFromState } from '../random/rng';

const SAVE_KEY = 'ic_save';
const SAVE_VERSION = 1;

interface SaveData {
  version: number;
  timestamp: number;
  rngState: number;
  gameState: Omit<GameState, 'rng'>;
}

function serialize(state: GameState): string {
  const rngState = state.rng?.getState() ?? 0;
  const { rng: _rng, ...rest } = state;
  const save: SaveData = { version: SAVE_VERSION, timestamp: Date.now(), rngState, gameState: rest };
  return JSON.stringify(save);
}

function deserialize(json: string): GameState {
  const save: SaveData = JSON.parse(json);
  if (save.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${save.version}`);
  }
  return { ...save.gameState, rng: createRngFromState(save.rngState) };
}

export function saveToStorage(state: GameState): void {
  localStorage.setItem(SAVE_KEY, serialize(state));
}

export function loadFromStorage(): GameState | null {
  const json = localStorage.getItem(SAVE_KEY);
  if (json === null) return null;
  return deserialize(json);
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function downloadSave(state: GameState): void {
  const json = serialize(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `imperial-conflict-save-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function uploadSave(file: File): Promise<GameState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(deserialize(reader.result as string));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
