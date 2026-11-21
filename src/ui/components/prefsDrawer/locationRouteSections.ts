import type { AppState } from '../../../state/appState';
import type { Store } from '../../../state/store';
import { setPreferences } from '../../../state/transitions';
import type { LocationController } from '../../locationController';
import { byId, syncChecked, syncValue } from '../../dom';
import { i18n } from '../../i18nContext';
import type { Drawer } from './drawer';

/** "Location & distance" and "Route" sections, plus the top-bar GPS button and "refresh prices". */
export function createLocationRouteSections(
  store: Store<AppState>,
  location: LocationController,
  drawer: Drawer,
) {
  const address = byId<HTMLInputElement>('address');
  const radius = byId<HTMLInputElement>('search-radius');
  const radiusValue = byId('search-radius-value');
  const destination = byId<HTMLInputElement>('destination');
  const detour = byId<HTMLInputElement>('route-detour');
  const detourValue = byId('route-detour-value');
  const routeOnly = byId<HTMLInputElement>('route-only');

  byId('use-gps').addEventListener('click', () => {
    location.requestGps();
    drawer.close();
  });
  byId('quick-gps').addEventListener('click', () => location.requestGps());

  byId('set-address').addEventListener('click', async () => {
    const query = address.value.trim();
    if (query && (await location.searchAddress(query))) drawer.close();
  });
  byId('calculate-route').addEventListener('click', async () => {
    const query = destination.value.trim();
    if (query && (await location.calculateRoute(query))) drawer.close();
  });
  byId('clear-route').addEventListener('click', () => location.clearRoute());
  byId('refresh-prices').addEventListener('click', () => void location.refreshAll());

  radius.addEventListener('input', () =>
    store.update((s) => setPreferences(s, { searchRadiusKm: Number(radius.value) })),
  );
  detour.addEventListener('input', () =>
    store.update((s) => setPreferences(s, { routeDetourKm: Number(detour.value) })),
  );
  routeOnly.addEventListener('change', () =>
    store.update((s) => setPreferences(s, { routeOnly: routeOnly.checked })),
  );

  return {
    render(state: AppState) {
      const p = state.preferences;
      const { decimal } = i18n();
      syncValue(radius, String(p.searchRadiusKm));
      syncValue(detour, String(p.routeDetourKm));
      syncChecked(routeOnly, p.routeOnly);
      radiusValue.textContent = decimal(p.searchRadiusKm);
      detourValue.textContent = decimal(p.routeDetourKm);
    },
  };
}
