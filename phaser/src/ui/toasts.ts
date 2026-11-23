// Persistent toast container. Lives outside the overlay's render cycle so
// toasts survive full re-renders.

const TOAST_DURATION_MS = 3000;
const TOAST_EXIT_MS = 350;

export interface Toaster {
  /** The container element; re-append it after clearing the root. */
  readonly element: HTMLElement;
  show(message: string, isError: boolean): void;
}

export function createToaster(root: HTMLElement): Toaster {
  const element = document.createElement('div');
  element.className = 'toast-container';

  return {
    element,
    show(message, isError) {
      if (!element.parentElement) {
        root.append(element);
      }
      const toast = document.createElement('div');
      toast.className = isError ? 'toast toast-error' : 'toast';
      toast.textContent = message;
      element.append(toast);
      // Trigger enter animation on next frame
      requestAnimationFrame(() => toast.classList.add('toast-visible'));
      // Each toast manages its own removal independently
      setTimeout(() => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), TOAST_EXIT_MS);
      }, TOAST_DURATION_MS);
    },
  };
}
