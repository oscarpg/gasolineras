import { OSRM_ROUTE_URL } from '../config/endpoints';
import type { LatLng } from '../domain/types';
import type { HttpClient } from './http';

interface OsrmResponse {
  code: string;
  routes?: { geometry: { coordinates: [lon: number, lat: number][] } }[];
}

export interface Router {
  /** Driving route as a polyline, or null if OSRM couldn't find one. */
  route(from: LatLng, to: LatLng): Promise<LatLng[] | null>;
}

/** OSRM driving routes (public demo server). */
export function createRouter({ http }: { http: HttpClient }): Router {
  return {
    async route(from, to) {
      const url = `${OSRM_ROUTE_URL}${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
      // OSRM explains failures ("NoRoute", …) in a JSON body with a 4xx status.
      const data = await http.getJson<OsrmResponse>(url, { allowHttpErrors: true });
      const route = data.routes?.[0];
      if (data.code !== 'Ok' || !route) return null;
      return route.geometry.coordinates.map(([lon, lat]) => [lat, lon] as const);
    },
  };
}
