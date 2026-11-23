import type { AppState } from '../../state/appState';
import { byId } from '../dom';
import type { LocationController } from '../locationController';

/**
 * The search bar at the top, as in the Android app: one field for an address or a
 * destination. Enter (the keyboard's search key) makes the place the origin; the
 * arrow, shown once something is typed, draws a route from the origin to it.
 * While a route is shown, a "Route active · Clear route" chip under the bar removes it.
 */
export function createSearchBar(location: LocationController) {
  const form = byId<HTMLFormElement>('search-form');
  const input = byId<HTMLInputElement>('search-input');
  const clear = byId<HTMLButtonElement>('search-clear');
  const route = byId<HTMLButtonElement>('search-route');
  const routeChip = byId<HTMLButtonElement>('route-chip');

  const query = () => input.value.trim();

  /** Clear and route buttons only make sense with something typed. */
  const syncButtons = () => {
    clear.hidden = input.value === '';
    route.hidden = query() === '';
  };
  input.addEventListener('input', syncButtons);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!query()) return;
    input.blur(); // hides the phone keyboard, so the results are visible
    void location.searchAddress(query());
  });
  route.addEventListener('click', () => {
    if (!query()) return;
    input.blur();
    void location.calculateRoute(query());
  });
  clear.addEventListener('click', () => {
    input.value = '';
    syncButtons();
    input.focus();
  });
  routeChip.addEventListener('click', () => location.clearRoute());

  return {
    render(state: AppState) {
      routeChip.hidden = !state.route;
    },
  };
}
