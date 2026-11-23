import { downloadSave, getSavedDirHandle, listSavesInDirectory, loadFromDirectory, saveToDirectory, uploadSave } from '../app/savePersistence';
import type { GameState } from '../core/galaxy/galaxyData';
import { convertToSinglePlayer, isMultiplayerSave, listHumanEmpires } from '../core/persistence/multiplayerSave';
import { button } from './dom';

// Save and load UI: save to the chosen directory (or download), pick a save
// from the directory or a file, and route multiplayer saves to host/solo.

type Notify = (message: string, isError?: boolean) => void;

export interface SaveLoadFlowDeps {
  root: HTMLElement;
  /** Apply a loaded single-player game. */
  finishLoad(loaded: GameState, sourceName: string): void;
  /** Open the multiplayer lobby to host a loaded multiplayer save. */
  hostLoadedGame(loaded: GameState): void;
}

export interface SaveLoadFlow {
  save(state: GameState, notify: Notify): void;
  /** Directory picker if a save directory is set, otherwise a file picker. */
  load(notify: Notify): void;
}

export function createSaveLoadFlow(deps: SaveLoadFlowDeps): SaveLoadFlow {
  const { root } = deps;

  /** Route a freshly loaded save: multiplayer saves offer host/solo, others load directly. */
  function applyLoadedSave(loaded: GameState, sourceName: string): void {
    if (isMultiplayerSave(loaded)) {
      showMultiplayerSaveChoice(loaded, sourceName);
    } else {
      deps.finishLoad(loaded, sourceName);
    }
  }

  function showMultiplayerSaveChoice(loaded: GameState, sourceName: string): void {
    const choiceOverlay = document.createElement('div');
    choiceOverlay.className = 'load-picker-overlay interactive';
    const panel = document.createElement('div');
    panel.className = 'load-picker-panel';

    const title = document.createElement('h3');
    title.textContent = 'Multiplayer Save';

    const info = document.createElement('p');
    info.className = 'empty-text';
    const names = listHumanEmpires(loaded).map((e) => e.empireName).join(', ');
    info.textContent = `This save is from a multiplayer game (${names}). `
      + 'Host it so the other players can rejoin with their empire names, or continue solo with the other empires handed to the AI.';

    const hostBtn = button('Host Multiplayer Game', () => {
      choiceOverlay.remove();
      deps.hostLoadedGame(loaded);
    }, 'ui-button primary lobby-action-btn');

    const soloBtn = button('Continue Solo', () => {
      choiceOverlay.remove();
      convertToSinglePlayer(loaded);
      deps.finishLoad(loaded, sourceName);
    }, 'ui-button lobby-action-btn');

    panel.append(title, info, hostBtn, soloBtn);
    choiceOverlay.addEventListener('click', (e) => {
      if (e.target === choiceOverlay) choiceOverlay.remove();
    });
    choiceOverlay.append(panel);
    root.append(choiceOverlay);
  }

  function openFilePicker(notify: Notify): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      uploadSave(file).then((loaded) => {
        applyLoadedSave(loaded, file.name);
      }).catch(() => {
        notify('Failed to load save file.', true);
      });
    });
    input.click();
  }

  function showLoadPicker(notify: Notify): void {
    listSavesInDirectory().then((entries) => {
      if (entries.length === 0) {
        notify('No save files found in directory.', true);
        return;
      }
      const overlay = document.createElement('div');
      overlay.className = 'load-picker-overlay interactive';
      const panel = document.createElement('div');
      panel.className = 'load-picker-panel';
      const title = document.createElement('h3');
      title.textContent = 'Load Save';
      panel.append(title);

      for (const entry of entries) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'load-picker-item';
        const name = document.createElement('span');
        name.textContent = entry.name;
        const date = document.createElement('span');
        date.className = 'load-picker-date';
        date.textContent = new Date(entry.lastModified).toLocaleString();
        row.append(name, date);
        row.addEventListener('click', () => {
          loadFromDirectory(entry).then((loaded) => {
            overlay.remove();
            applyLoadedSave(loaded, entry.name);
          }).catch(() => {
            notify('Failed to load save file.', true);
          });
        });
        panel.append(row);
      }

      // Browse button to use file picker instead
      const browseBtn = document.createElement('button');
      browseBtn.type = 'button';
      browseBtn.className = 'load-picker-item load-picker-browse';
      browseBtn.textContent = 'Browse other files...';
      browseBtn.addEventListener('click', () => {
        overlay.remove();
        openFilePicker(notify);
      });
      panel.append(browseBtn);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });
      overlay.append(panel);
      root.append(overlay);
    }).catch(() => {
      // Fallback to file picker if directory listing fails
      openFilePicker(notify);
    });
  }

  return {
    save(state, notify) {
      getSavedDirHandle().then((dir) => {
        if (dir) {
          saveToDirectory(state).then((filename) => {
            notify(`Saved: ${filename}`);
          }).catch(() => {
            downloadSave(state);
            notify('Save file downloaded.');
          });
        } else {
          downloadSave(state);
          notify('Save file downloaded.');
        }
      });
    },
    load(notify) {
      getSavedDirHandle().then((dir) => {
        if (dir) {
          showLoadPicker(notify);
        } else {
          openFilePicker(notify);
        }
      });
    },
  };
}
