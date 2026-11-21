export interface Toaster {
  /** Shows a short message at the bottom of the screen (replaces alert()). */
  show(message: string, options?: { durationMs?: number }): void;
}

export function createToaster(root: HTMLElement = document.body): Toaster {
  let element: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    show(message, { durationMs = 4000 } = {}) {
      if (!element) {
        element = document.createElement('div');
        element.className = 'toast';
        element.setAttribute('role', 'alert');
        root.appendChild(element);
      }
      element.textContent = message;
      element.hidden = false;
      clearTimeout(timer);
      const shown = element;
      timer = setTimeout(() => (shown.hidden = true), durationMs);
    },
  };
}
