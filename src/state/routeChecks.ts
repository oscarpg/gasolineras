import { routeCheckCandidates, routeProbes, type RouteChecks } from '../domain/routeCheck';
import type { LatLng } from '../domain/types';
import type { Router } from '../services/routing';
import type { AppState } from './appState';
import type { Store } from './store';
import { addRouteChecks } from './transitions';

/**
 * Checks by road the stations near the route while "only stations on the route" is on
 * (see domain/routeCheck.ts). Runs again when more stations arrive (provinces along the
 * route load one by one); each station is checked once per route. If the router fails,
 * those stations keep the straight-line rule (their check is stored as `null`).
 * Returns a function that stops watching.
 */
export function watchRouteChecks({
  store,
  router,
}: {
  store: Store<AppState>;
  router: Pick<Router, 'extraDistances'>;
}) {
  let route: readonly LatLng[] | null = null;
  const inFlight = new Set<string>();
  let last: { stations: unknown; route: unknown; checks: unknown } | null = null;

  function check(s: AppState) {
    if (!s.route || !s.preferences.routeOnly || s.favouritesOnly) return;
    if (s.route !== route) {
      route = s.route;
      inFlight.clear();
    }
    if (last && last.stations === s.stations && last.route === s.route && last.checks === s.routeChecks)
      return;
    last = { stations: s.stations, route: s.route, checks: s.routeChecks };

    const candidates = routeCheckCandidates(s.stations, s.route, s.routeChecks).filter(
      (c) => !inFlight.has(c.id),
    );
    if (candidates.length === 0) return;
    for (const c of candidates) inFlight.add(c.id);

    const checkedRoute = s.route;
    const probes = routeProbes(checkedRoute, candidates);
    const save = (values: (number | null)[]) => {
      const checks: Record<string, number | null> = {};
      candidates.forEach((c, i) => (checks[c.id] = values[i] ?? null));
      for (const c of candidates) inFlight.delete(c.id);
      store.update((st) => addRouteChecks(st, checkedRoute, checks as RouteChecks));
    };
    router.extraDistances(probes).then(save, (error: unknown) => {
      console.warn('Route check failed; using the distance to the route line:', error);
      save(candidates.map(() => null));
    });
  }

  check(store.getState());
  return store.subscribe((s) => check(s));
}
