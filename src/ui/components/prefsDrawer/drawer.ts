import { byId } from '../../dom';

export interface Drawer {
  open(): void;
  close(): void;
}

/** Elements outside the drawer that are made inert (unfocusable, hidden from screen readers) while it is open. */
const BACKGROUND_IDS = ['topbar', 'map', 'results-panel'];

/** Element ids of one drawer. */
export interface DrawerIds {
  drawer: string;
  backdrop: string;
  /** The button that opens it (its aria-expanded is kept in sync). */
  opener: string;
  close: string;
}

export const PREFERENCES_DRAWER: DrawerIds = {
  drawer: 'preferences-drawer',
  backdrop: 'preferences-backdrop',
  opener: 'open-preferences',
  close: 'close-preferences',
};

export const FILTERS_DRAWER: DrawerIds = {
  drawer: 'filters-drawer',
  backdrop: 'filters-backdrop',
  opener: 'open-filters',
  close: 'close-filters',
};

/**
 * A side panel as a modal dialog (Preferences, Filters): while open, the rest of
 * the page is inert, focus moves into the panel and Escape closes it. On close,
 * focus goes back to the button that opened it (if focus was inside the panel).
 */
export function createDrawer(ids: DrawerIds = PREFERENCES_DRAWER): Drawer {
  const drawer = byId(ids.drawer);
  const backdrop = byId(ids.backdrop);
  const opener = byId(ids.opener);
  const closeButton = byId<HTMLButtonElement>(ids.close);
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
