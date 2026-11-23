import { ROUTE_ONLY_MAX_KM } from '../domain/filters';
import type { ProvinceShapes } from '../domain/provinceShapes';
import type { AppState } from './appState';

/** Added to the radius or detour, because the outlines are simplified. */
export const PROVINCE_MARGIN_KM = 2;

/**
 * The provinces whose stations the current view can show:
 * - favourites mode: the provinces of the favourites;
 * - with a route: every province within the detour distance of the route;
 * - otherwise: every province within the search radius of the origin.
 */
export function provincesNeeded(s: AppState, shapes: ProvinceShapes): string[] {
  const p = s.preferences;
  if (s.favouritesOnly) return [...new Set(p.favourites.map((f) => f.provinceCode))];
  if (s.route) {
    const detour = p.routeOnly ? ROUTE_ONLY_MAX_KM : p.routeDetourKm;
    return shapes.provincesAlongRoute(s.route, detour + PROVINCE_MARGIN_KM);
  }
  if (s.userPosition) return shapes.provincesWithin(s.userPosition, p.searchRadiusKm + PROVINCE_MARGIN_KM);
  return [];
}
