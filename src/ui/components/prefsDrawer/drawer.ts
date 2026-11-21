import { byId } from '../../dom';

export interface Drawer {
  open(): void;
  close(): void;
}

/** The Preferences side panel and its backdrop. */
export function createDrawer(): Drawer {
  const drawer = byId('drawerPrefs');
  const backdrop = byId('backdropPrefs');

  const open = () => {
    drawer.classList.add('abierto');
    backdrop.classList.add('activo');
  };
  const close = () => {
    drawer.classList.remove('abierto');
    backdrop.classList.remove('activo');
  };

  byId('btnAbrirPrefs').addEventListener('click', open);
  byId('btnCerrarPrefs').addEventListener('click', close);
  backdrop.addEventListener('click', close);

  return { open, close };
}
