// Re-render a panel without losing what the user is typing: carries over
// every <input> value (matched by position), the focused input and its
// cursor, and the .main-panel scroll position.

export function replacePreservingInputs(oldPanel: HTMLElement, newPanel: HTMLElement): void {
  const activeEl = document.activeElement;
  const focusedInput = oldPanel.contains(activeEl) && activeEl instanceof HTMLInputElement ? activeEl : null;
  const scrollTop = oldPanel.querySelector('.main-panel')?.scrollTop ?? 0;

  const savedValues = new Map<number, string>();
  let focusedIdx = -1;
  let selectionStart: number | null = null;
  let selectionEnd: number | null = null;
  oldPanel.querySelectorAll('input').forEach((input, idx) => {
    if (input.value && input.value !== '0') {
      savedValues.set(idx, input.value);
    }
    if (input === focusedInput) {
      focusedIdx = idx;
      selectionStart = input.selectionStart;
      selectionEnd = input.selectionEnd;
    }
  });

  // Restore values and fire input events so dependent displays update.
  newPanel.querySelectorAll('input').forEach((input, idx) => {
    const saved = savedValues.get(idx);
    if (saved !== undefined) {
      input.value = saved;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  oldPanel.replaceWith(newPanel);
  const mainPanel = newPanel.querySelector('.main-panel');
  if (mainPanel) mainPanel.scrollTop = scrollTop;

  if (focusedIdx >= 0) {
    const target = newPanel.querySelectorAll('input')[focusedIdx];
    if (target) {
      target.focus();
      if (selectionStart !== null && selectionEnd !== null) {
        try { target.setSelectionRange(selectionStart, selectionEnd); } catch { /* number inputs */ }
      }
    }
  }
}

/** True when a native <select> dropdown inside `panel` has focus (re-rendering would close it). */
export function hasFocusedSelect(panel: HTMLElement): boolean {
  const activeEl = document.activeElement;
  return panel.contains(activeEl) && activeEl instanceof HTMLSelectElement;
}
