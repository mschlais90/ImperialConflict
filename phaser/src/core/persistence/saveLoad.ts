import type { GameState } from '../galaxy/galaxyData';
import { createRngFromState } from '../random/rng';

const SAVE_KEY = 'ic_save';
const SAVE_VERSION = 2;
const IDB_NAME = 'ic_save_dir';
const IDB_STORE = 'handles';
const IDB_KEY = 'saveDir';

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
  if (save.version === 1) {
    migrateV1toV2(save);
    save.version = 2;
  }
  if (save.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${save.version}`);
  }
  return { ...save.gameState, rng: createRngFromState(save.rngState) };
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

// --- File System Access API: persistent save directory ---

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getSavedDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

export async function clearDirHandle(): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function pickSaveDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await storeDirHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if (await handle.queryPermission(opts) === 'granted') return true;
  if (await handle.requestPermission(opts) === 'granted') return true;
  return false;
}

export async function saveToDirectory(state: GameState): Promise<string> {
  const dir = await getSavedDirHandle();
  if (!dir) throw new Error('No save directory set.');
  if (!await verifyPermission(dir)) throw new Error('Permission denied for save directory.');

  const filename = `imperial-conflict-save-${Date.now()}.json`;
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(serialize(state));
  await writable.close();
  return filename;
}

export interface SaveFileEntry {
  name: string;
  handle: FileSystemFileHandle;
  lastModified: number;
}

export async function listSavesInDirectory(): Promise<SaveFileEntry[]> {
  const dir = await getSavedDirHandle();
  if (!dir) return [];
  if (!await verifyPermission(dir)) return [];

  const entries: SaveFileEntry[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json') && name.startsWith('imperial-conflict-save')) {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      entries.push({ name, handle: fileHandle, lastModified: file.lastModified });
    }
  }
  entries.sort((a, b) => b.lastModified - a.lastModified);
  return entries;
}

export async function loadFromDirectory(entry: SaveFileEntry): Promise<GameState> {
  const file = await entry.handle.getFile();
  const json = await file.text();
  return deserialize(json);
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}
