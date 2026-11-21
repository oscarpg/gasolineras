import type { LatLng } from './types';

/** Kilometres per degree of latitude (and of longitude at the equator). */
const KM_PER_DEGREE = 111.32;

const kmPerDegreeLon = (lat: number): number => KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180);

/**
 * Straight-line distance in km (equirectangular approximation).
 * Accurate to well under 1% at the distances this app works with (< 100 km).
 * Longitude is scaled at the latitude of `a`.
 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const kx = kmPerDegreeLon(a[0]);
  return Math.hypot((a[1] - b[1]) * kx, (a[0] - b[0]) * KM_PER_DEGREE);
}

/** Shortest distance in km from point `p` to the segment `a`–`b`. */
export function distanceToSegmentKm(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = kmPerDegreeLon(p[0]);
  const px = p[1] * kx;
  const py = p[0] * KM_PER_DEGREE;
  const ax = a[1] * kx;
  const ay = a[0] * KM_PER_DEGREE;
  const bx = b[1] * kx;
  const by = b[0] * KM_PER_DEGREE;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Shortest distance in km from `p` to a route (polyline).
 * Empty or missing route → Infinity.
 */
export function distanceToRouteKm(p: LatLng, route: readonly LatLng[] | null | undefined): number {
  if (!route || route.length === 0) return Infinity;
  if (route.length === 1) return distanceKm(p, route[0]!);
  let min = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    min = Math.min(min, distanceToSegmentKm(p, route[i]!, route[i + 1]!));
  }
  return min;
}
