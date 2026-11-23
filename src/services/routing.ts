import { OSRM_ROUTE_URL, OSRM_TABLE_URL } from '../config/endpoints';
import type { RouteProbe } from '../domain/routeCheck';
import type { LatLng } from '../domain/types';
import { AppError } from '../domain/errors';
import type { HttpClient } from './http';

interface OsrmResponse {
  code: string;
  routes?: { geometry: { coordinates: [lon: number, lat: number][] } }[];
}

interface OsrmTableResponse {
  code: string;
  /** Metres, by source then destination; null when there is no route. */
  distances?: (number | null)[][];
}

/** Stations checked per table request (3 points each; the public server allows about 100). */
export const TABLE_BATCH = 30;

export interface Router {
  /** Driving route as a polyline, or null if OSRM couldn't find one. */
  route(from: LatLng, to: LatLng): Promise<LatLng[] | null>;
  /**
   * For each probe, how much longer (km) driving before → station → after is than
   * before → after: the real detour to the station. `Infinity` when the station can't
   * be reached. Throws if the router fails.
   */
  extraDistances(probes: readonly RouteProbe[]): Promise<number[]>;
}

const point = ([lat, lon]: LatLng) => `${lon},${lat}`;

/** OSRM driving routes and distance tables (public demo server). */
export function createRouter({ http }: { http: HttpClient }): Router {
  /** One table request: for probe k, points 3k (before), 3k+1 (station), 3k+2 (after). */
  async function batch(probes: readonly RouteProbe[]): Promise<number[]> {
    const points = probes.flatMap((p) => [p.before, p.station, p.after]);
    const sources = probes.flatMap((_, k) => [3 * k, 3 * k + 1]).join(';');
    const destinations = probes.flatMap((_, k) => [3 * k + 1, 3 * k + 2]).join(';');
    const url = `${OSRM_TABLE_URL}${points.map(point).join(';')}?sources=${sources}&destinations=${destinations}&annotations=distance`;
    const data = await http.getJson<OsrmTableResponse>(url, { allowHttpErrors: true });
    const d = data.distances;
    if (data.code !== 'Ok' || !d) throw new AppError('download-failed');
    // Rows: 2k = before_k, 2k+1 = station_k. Columns: 2k = station_k, 2k+1 = after_k.
    return probes.map((_, k) => {
      const toStation = d[2 * k]?.[2 * k];
      const straight = d[2 * k]?.[2 * k + 1];
      const fromStation = d[2 * k + 1]?.[2 * k + 1];
      if (toStation == null || fromStation == null || straight == null) return Infinity;
      return Math.max(0, toStation + fromStation - straight) / 1000;
    });
  }

  return {
    async route(from, to) {
      const url = `${OSRM_ROUTE_URL}${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
      // OSRM explains failures ("NoRoute", …) in a JSON body with a 4xx status.
      const data = await http.getJson<OsrmResponse>(url, { allowHttpErrors: true });
      const route = data.routes?.[0];
      if (data.code !== 'Ok' || !route) return null;
      return route.geometry.coordinates.map(([lon, lat]) => [lat, lon] as const);
    },

    async extraDistances(probes) {
      const out: number[] = [];
      // One request at a time: the public server asks for gentle use.
      for (let i = 0; i < probes.length; i += TABLE_BATCH)
        out.push(...(await batch(probes.slice(i, i + TABLE_BATCH))));
      return out;
    },
  };
}
