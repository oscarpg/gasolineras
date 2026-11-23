/**
 * Shows the "offline: showing saved prices" banner while the browser has no network.
 * Cached prices keep working; the banner only explains why they may be old.
 */
export function bindOfflineBanner(
  banner: HTMLElement,
  win: Pick<Window, 'addEventListener'> & { navigator: Pick<Navigator, 'onLine'> } = window,
): void {
  const sync = () => {
    banner.hidden = win.navigator.onLine;
  };
  win.addEventListener('online', sync);
  win.addEventListener('offline', sync);
  sync();
}
