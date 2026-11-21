import { byId } from '../../dom';

export interface Drawer {
  open(): void;
  close(): void;
}

/** Elements outside the drawer that are made inert (unfocusable, hidden from screen readers) while it is open. */
const BACKGROUND_IDS = ['topbar', 'map', 'results-panel'];

/**
 * The Preferences side panel, as a modal dialog: while open, the rest of the page
 * is inert, focus moves into the panel and Escape closes it. On close, focus goes
 * back to the button that opened it (if focus was inside the panel).
 */
export function createDrawer(): Drawer {
  const drawer = byId('preferences-drawer');
  const backdrop = byId('preferences-backdrop');
  const opener = byId('open-preferences');
  const closeButton = byId<HTMLButtonElement>('close-preferences');
  const background = BACKGROUND_IDS.map((id) => byId(id));
  let isOpen = false;
  let returnFocusTo: HTMLElement | null = null;

  const setOpen = (open: boolean) => {
    isOpen = open;
    drawer.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-active', open);
    drawer.inert = !open;
    for (const el of background) el.inert = open;
    opener.setAttribute('aria-expanded', String(open));
  };

  const open = () => {
    if (isOpen) return;
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : opener;
    setOpen(true);
    closeButton.focus();
  };

  const close = () => {
    if (!isOpen) return;
    const focusWasInside = drawer.contains(document.activeElement);
    setOpen(false);
    if (focusWasInside) (returnFocusTo?.isConnected ? returnFocusTo : opener).focus();
    returnFocusTo = null;
  };

  opener.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      close();
    }
  });

  return { open, close };
}
