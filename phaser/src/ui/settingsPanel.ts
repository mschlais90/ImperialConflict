import { isFileSystemAccessSupported, getSavedDirHandle, pickSaveDirectory, clearDirHandle } from '../core/persistence/saveLoad';
import { button } from './dom';
import { isMusicEnabled, setMusicEnabled } from './music';
import type { UiContext } from './types';

export function renderSettingsPanel(context: UiContext): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'main-panel interactive';

  const title = document.createElement('h2');
  title.textContent = 'Settings';
  const hint = document.createElement('p');
  hint.className = 'empty-text';
  hint.textContent = 'Press S to return';
  panel.append(title, hint);

  // Music toggle
  const musicRow = document.createElement('label');
  musicRow.className = 'settings-row';
  const musicCheckbox = document.createElement('input');
  musicCheckbox.type = 'checkbox';
  musicCheckbox.checked = isMusicEnabled();
  musicCheckbox.addEventListener('change', () => {
    setMusicEnabled(musicCheckbox.checked);
    context.setNotice(musicCheckbox.checked ? 'Music enabled.' : 'Music disabled.');
  });
  musicRow.append(musicCheckbox, document.createTextNode(' Background music'));
  panel.append(musicRow);

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
