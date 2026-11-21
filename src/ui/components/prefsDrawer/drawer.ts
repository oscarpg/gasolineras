import { byId } from '../../dom';

export interface Drawer {
  open(): void;
  close(): void;
}

/** The Preferences side panel and its backdrop. */
export function createDrawer(): Drawer {
  const drawer = byId('preferences-drawer');
  const backdrop = byId('preferences-backdrop');

  const open = () => {
    drawer.classList.add('is-open');
    backdrop.classList.add('is-active');
  };
  const close = () => {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-active');
  };

  byId('open-preferences').addEventListener('click', open);
  byId('close-preferences').addEventListener('click', close);
  backdrop.addEventListener('click', close);

  return { open, close };
}
