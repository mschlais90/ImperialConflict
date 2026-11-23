import type { GameState } from '../core/galaxy/galaxyData';
import { deserializeSave, serializeSave } from '../core/persistence/saveLoad';

// Browser-side save storage: localStorage, file download/upload, and the
// File System Access API save directory. Pure serialization lives in core.

const SAVE_KEY = 'ic_save';
const IDB_NAME = 'ic_save_dir';
const IDB_STORE = 'handles';
const IDB_KEY = 'saveDir';

export function saveToStorage(state: GameState): void {
  localStorage.setItem(SAVE_KEY, serializeSave(state, Date.now()));
}

export function loadFromStorage(): GameState | null {
  const json = localStorage.getItem(SAVE_KEY);
  if (json === null) return null;
  return deserializeSave(json);
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function downloadSave(state: GameState): void {
  const json = serializeSave(state, Date.now());
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
        resolve(deserializeSave(reader.result as string));
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
  await writable.write(serializeSave(state, Date.now()));
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
  return deserializeSave(json);
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}
