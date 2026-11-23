/**
 * "Only stations on the route", checked by road.
 *
 * Being close to the route line isn't enough: a station 50 m from a motorway can be on a
 * street below it, or in the service area of the other carriageway. So the stations near
 * the line are checked with the router: how much longer is driving from a route point
 * ~2 km before the station, through it, to a route point ~2 km after it, than driving
 * straight on? Stations that add at most 1 km are on the route.
 *
 * Shared with the Android app (core/domain/RouteCheck.kt): keep both in step.
 */
import { distanceKm, distanceToRouteKm } from './geo';
import type { LatLng } from './types';

/** Stations this close to the route line (km) are checked by road. */
export const ROUTE_CHECK_CANDIDATE_KM = 0.3;
/** At most this much extra driving (km) through the station counts as "on the route". */
export const ROUTE_ONLY_MAX_EXTRA_KM = 1;
/** How far before and after the station (along the route, km) the check starts and ends. */
export const ROUTE_CHECK_STEP_KM = 2;

/**
 * Results of the road check for the current route, by station id: the extra km driven
 * through the station, `Infinity` if it can't be reached, or `null` if the check failed
 * (then the straight-line rule applies). A station not listed wasn't checked yet.
 */
export type RouteChecks = Readonly<Record<string, number | null>>;

/** One station to check: route point before it, the station, route point after it. */
export interface RouteProbe {
  id: string;
  before: LatLng;
  station: LatLng;
  after: LatLng;
}

/**
 * Whether a station `lineKm` from the route line counts as on the route.
 * Checked by road: within the candidate distance and adding at most 1 km.
 * Not checked (or the check failed): within `fallbackKm` of the line, as before.
 */
export function isOnRoute(lineKm: number, check: number | null | undefined, fallbackKm: number): boolean {
  if (check == null) return lineKm <= fallbackKm;
  return lineKm <= ROUTE_CHECK_CANDIDATE_KM && check <= ROUTE_ONLY_MAX_EXTRA_KM;
}

/** Ids of the stations near enough to the route to check that aren't checked yet. */
export function routeCheckCandidates(
  stations: readonly { id: string; lat: number; lon: number }[],
  route: readonly LatLng[],
  checks: RouteChecks,
): { id: string; position: LatLng }[] {
  const out: { id: string; position: LatLng }[] = [];
  for (const s of stations) {
    if (s.id in checks) continue;
    const position: LatLng = [s.lat, s.lon];
    if (distanceToRouteKm(position, route) <= ROUTE_CHECK_CANDIDATE_KM) out.push({ id: s.id, position });
  }
  return out;
}

/** The route points `stepKm` before and after where each station meets the route. */
export function routeProbes(
  route: readonly LatLng[],
  stations: readonly { id: string; position: LatLng }[],
  stepKm = ROUTE_CHECK_STEP_KM,
): RouteProbe[] {
  if (route.length === 0) return [];
  const along = [0];
  for (let i = 1; i < route.length; i++) along.push(along[i - 1]! + distanceKm(route[i - 1]!, route[i]!));
  const total = along[along.length - 1]!;

  /** The point `km` along the route (clamped to its ends). */
  const pointAt = (km: number): LatLng => {
    const target = Math.min(total, Math.max(0, km));
    let i = 1;
    while (i < route.length - 1 && along[i]! < target) i++;
    const a = route[i - 1] ?? route[0]!;
    const b = route[i] ?? a;
    const length = (along[i] ?? 0) - (along[i - 1] ?? 0);
    const t = length > 0 ? (target - along[i - 1]!) / length : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };

  /** How far along the route the station's nearest point is (km). */
  const alongOf = (p: LatLng): number => {
    if (route.length === 1) return 0;
    let best = Infinity;
    let at = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!;
      const b = route[i]!;
      // Project in a local flat frame (as geo.ts does) to find where p meets the segment.
      const kx = Math.cos((p[0] * Math.PI) / 180);
      const ax = a[1] * kx,
        ay = a[0],
        bx = b[1] * kx,
        by = b[0],
        px = p[1] * kx,
        py = p[0];
      const dx = bx - ax,
        dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best) {
        best = d;
        at = along[i - 1]! + t * (along[i]! - along[i - 1]!);
      }
    }
    return at;
  };

  return stations.map(({ id, position }) => {
    const at = alongOf(position);
    return { id, before: pointAt(at - stepKm), station: position, after: pointAt(at + stepKm) };
  });
}
