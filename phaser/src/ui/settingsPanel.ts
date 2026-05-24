import { isFileSystemAccessSupported, getSavedDirHandle, pickSaveDirectory, clearDirHandle } from '../core/persistence/saveLoad';
import { button } from './dom';
import type { UiContext } from './types';

const SETTINGS_KEY = 'ic_settings';

interface Settings {
  showCombatPopups: boolean;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { showCombatPopups: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { showCombatPopups: true };
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function shouldShowCombatPopups(): boolean {
  return loadSettings().showCombatPopups;
}

export function renderSettingsPanel(context: UiContext): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Settings';
  const hint = document.createElement('p');
  hint.className = 'empty-text';
  hint.textContent = 'Press S to return';
  panel.append(title, hint);

  const settings = loadSettings();

  // Combat popup toggle
  const row = document.createElement('label');
  row.className = 'settings-row';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = settings.showCombatPopups;
  checkbox.addEventListener('change', () => {
    settings.showCombatPopups = checkbox.checked;
    saveSettings(settings);
    context.setNotice(checkbox.checked ? 'Combat popups enabled.' : 'Combat popups disabled.');
  });
  row.append(checkbox, document.createTextNode(' Show combat report popups'));
  panel.append(row);

  const note = document.createElement('p');
  note.className = 'empty-text';
  note.textContent = 'Battles are always recorded in History (H) regardless of this setting.';
  panel.append(note);

  // Save directory setting
  if (isFileSystemAccessSupported()) {
    const dirSection = document.createElement('div');
    dirSection.className = 'settings-section';
    const dirLabel = document.createElement('h3');
    dirLabel.textContent = 'Save Folder';
    dirSection.append(dirLabel);

    const dirStatus = document.createElement('p');
    dirStatus.className = 'empty-text';
    dirStatus.textContent = 'Loading...';
    dirSection.append(dirStatus);

    const btnRow = document.createElement('div');
    btnRow.className = 'settings-btn-row';

    const chooseBtn = button('Choose Folder', () => {
      pickSaveDirectory().then((handle) => {
        if (handle) {
          dirStatus.textContent = `Folder: ${handle.name}`;
          clearBtn.style.display = '';
          context.setNotice(`Save folder set: ${handle.name}`);
        }
      });
    });
    btnRow.append(chooseBtn);

    const clearBtn = button('Clear', () => {
      clearDirHandle().then(() => {
        dirStatus.textContent = 'No folder set — saves download as files.';
        clearBtn.style.display = 'none';
        context.setNotice('Save folder cleared.');
      });
    });
    clearBtn.style.display = 'none';
    btnRow.append(clearBtn);

    dirSection.append(btnRow);

    const dirNote = document.createElement('p');
    dirNote.className = 'empty-text';
    dirNote.textContent = 'When set, Save writes directly to this folder and Load shows files from it.';
    dirSection.append(dirNote);

    panel.append(dirSection);

    // Load current state
    getSavedDirHandle().then((handle) => {
      if (handle) {
        dirStatus.textContent = `Folder: ${handle.name}`;
        clearBtn.style.display = '';
      } else {
        dirStatus.textContent = 'No folder set — saves download as files.';
      }
    });
  }

  return panel;
}
