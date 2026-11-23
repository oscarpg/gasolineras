import { distanceKm, distanceToSegmentKm } from './geo';
import type { LatLng } from './types';

/**
 * Simplified outlines of Spain's 52 provinces (es-atlas, from IGN data — CC BY 4.0,
 * © Instituto Geográfico Nacional de España). Used to load every province whose
 * stations can be within the search radius or along a route, not just the one the
 * user is in, and to find the province when reverse geocoding fails.
 *
 * The outlines are simplified (~200 m quantisation, some more smoothing), so callers
 * add a margin. Port of the Android app's `ProvinceShapes.kt`; both read the same file.
 */
export interface ProvinceShapes {
  /** Province codes, in file order. */
  readonly codes: readonly string[];
  /** The province containing `p`, or null (sea, Portugal, France…). */
  provinceAt(p: LatLng): string | null;
  /** Provinces with some part within `radiusKm` of `p`, nearest first. */
  provincesWithin(p: LatLng, radiusKm: number): string[];
  /**
   * Provinces with some part within `detourKm` of `route`, in the order the route meets them.
   * The route is sampled every `stepKm`; the step is added to the margin so nothing is missed.
   */
  provincesAlongRoute(route: readonly LatLng[], detourKm: number, stepKm?: number): string[];
}

const KM_PER_DEGREE = 111.32;

class Province {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLon: number;
  readonly maxLon: number;

  constructor(
    readonly code: string,
    readonly rings: readonly (readonly LatLng[])[],
  ) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (const ring of rings) {
      for (const [lat, lon] of ring) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
      }
    }
    this.minLat = minLat;
    this.maxLat = maxLat;
    this.minLon = minLon;
    this.maxLon = maxLon;
  }

  /** Cheap rejection: is `p` farther than `km` from the bounding box? */
  boxFartherThan([lat, lon]: LatLng, km: number): boolean {
    const dLat = km / KM_PER_DEGREE;
    const dLon = km / (KM_PER_DEGREE * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    return (
      lat < this.minLat - dLat ||
      lat > this.maxLat + dLat ||
      lon < this.minLon - dLon ||
      lon > this.maxLon + dLon
    );
  }

  /** Even-odd rule over all rings (handles holes and islands). */
  contains([lat, lon]: LatLng): boolean {
    if (lat < this.minLat || lat > this.maxLat || lon < this.minLon || lon > this.maxLon) return false;
    let inside = false;
    for (const ring of this.rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [aLat, aLon] = ring[i]!;
        const [bLat, bLon] = ring[j]!;
        if (aLat > lat !== bLat > lat && lon < ((bLon - aLon) * (lat - aLat)) / (bLat - aLat) + aLon) {
          inside = !inside;
        }
      }
    }
    return inside;
  }

  /** Distance from `p` to the outline in km (0 inside). */
  distanceKm(p: LatLng): number {
    if (this.contains(p)) return 0;
    let best = Infinity;
    for (const ring of this.rings) {
      for (let i = 0; i < ring.length - 1; i++)
        best = Math.min(best, distanceToSegmentKm(p, ring[i]!, ring[i + 1]!));
    }
    return best;
  }
}

/** Parses `code|lon,lat;lon,lat;...|ring...` lines; `#` lines are comments. */
export function parseProvinceShapes(text: string): ProvinceShapes {
  const provinces = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [code, ...rings] = line.split('|');
      return new Province(
        code!,
        rings.map((ring) =>
          ring.split(';').map((pair): LatLng => {
            const [lon, lat] = pair.split(',');
            return [Number(lat), Number(lon)];
          }),
        ),
      );
    });

  function provincesWithin(p: LatLng, radiusKm: number): string[] {
    return provinces
      .filter((pr) => !pr.boxFartherThan(p, radiusKm))
      .map((pr) => ({ code: pr.code, km: pr.distanceKm(p) }))
      .filter((x) => x.km <= radiusKm)
      .sort((a, b) => a.km - b.km)
      .map((x) => x.code);
  }

  return {
    codes: provinces.map((p) => p.code),

    provinceAt: (p) => provinces.find((pr) => pr.contains(p))?.code ?? null,

    provincesWithin,

    provincesAlongRoute(route, detourKm, stepKm = 2) {
      const result = new Set<string>();
      let sinceLast = Infinity;
      route.forEach((point, i) => {
        if (i > 0) sinceLast += distanceKm(route[i - 1]!, point);
        if (sinceLast >= stepKm || i === route.length - 1) {
          sinceLast = 0;
          for (const code of provincesWithin(point, detourKm + stepKm)) result.add(code);
        }
      });
      return [...result];
    },
  };
}

let bundled: Promise<ProvinceShapes> | null = null;

/**
 * The outlines bundled with the app (~170 kB of text), loaded once, in their own
 * chunk so the first page load isn't heavier. The file is shared with the Android app.
 */
export function loadProvinceShapes(): Promise<ProvinceShapes> {
  bundled ??= import('../../android/core/src/main/resources/es/gasolineras/core/provinces.txt?raw').then(
    (m) => parseProvinceShapes(m.default),
    (error: unknown) => {
      bundled = null; // let a later call retry
      throw error;
    },
  );
  return bundled;
}
