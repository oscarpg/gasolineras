import type { AppState } from '../../../state/appState';
import type { Store } from '../../../state/store';
import { setPreferences } from '../../../state/transitions';
import type { LocationController } from '../../locationController';
import { byId, syncChecked, syncValue } from '../../dom';
import type { Drawer } from './drawer';

/** "Ubicación y Distancia" and "Ruta" sections, plus the top-bar GPS button and "force refresh". */
export function createLocationRouteSections(
  store: Store<AppState>,
  location: LocationController,
  drawer: Drawer,
) {
  const address = byId<HTMLInputElement>('direccion');
  const radius = byId<HTMLInputElement>('radioUbicacion');
  const radiusValue = byId('radioUbicacionVal');
  const destination = byId<HTMLInputElement>('destino');
  const detour = byId<HTMLInputElement>('radio');
  const detourValue = byId('radioVal');
  const routeOnly = byId<HTMLInputElement>('soloRuta');

  byId('btnGps').addEventListener('click', () => {
    location.requestGps();
    drawer.close();
  });
  byId('btnGpsRapido').addEventListener('click', () => location.requestGps());

  byId('btnDir').addEventListener('click', async () => {
    const query = address.value.trim();
    if (query && (await location.searchAddress(query))) drawer.close();
  });
  byId('btnRuta').addEventListener('click', async () => {
    const query = destination.value.trim();
    if (query && (await location.calculateRoute(query))) drawer.close();
  });
  byId('btnQuitarRuta').addEventListener('click', () => location.clearRoute());
  byId('btnActualizar').addEventListener('click', () => void location.refreshAll());

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
      syncValue(radius, String(p.searchRadiusKm));
      syncValue(detour, String(p.routeDetourKm));
      syncChecked(routeOnly, p.routeOnly);
      radiusValue.textContent = String(p.searchRadiusKm);
      detourValue.textContent = String(p.routeDetourKm);
    },
  };
}
