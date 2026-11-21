import { NOMINATIM_REVERSE_URL, NOMINATIM_SEARCH_URL } from '../config/endpoints';
import { provinceCodeFromAddress, type AddressLike } from '../domain/provinces';
import type { LatLng } from '../domain/types';
import type { HttpClient } from './http';
import { createRateLimiter, type RateLimiter } from './rateLimit';

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name?: string;
  address?: AddressLike;
}

export interface GeocodeResult {
  latLng: LatLng;
  /** 2-digit province code, or null if it couldn't be worked out. */
  provinceCode: string | null;
}

export interface Geocoder {
  /** First match for a free-text address, or null if nothing was found. */
  search(query: string): Promise<GeocodeResult | null>;
  /** Province code for a position, or null if unknown. */
  reverseProvince(position: LatLng): Promise<string | null>;
}

export interface GeocoderOptions {
  http: HttpClient;
  /** Shared queue that keeps requests ≥1 s apart (Nominatim usage policy). */
  limiter?: RateLimiter;
}

/**
 * Nominatim (OpenStreetMap) geocoding.
 * Successful answers are cached in memory for the session, so repeating a search costs nothing.
 */
export function createGeocoder({ http, limiter = createRateLimiter(1000) }: GeocoderOptions): Geocoder {
  const searches = new Map<string, GeocodeResult | null>();
  const reverses = new Map<string, string | null>();

  return {
    async search(query) {
      const key = query.trim().toLowerCase();
      if (searches.has(key)) return searches.get(key)!;

      const places = await limiter(() =>
        http.getJson<NominatimPlace[]>(NOMINATIM_SEARCH_URL + encodeURIComponent(query)),
      );
      const first = places[0];
      const result = first
        ? { latLng: [+first.lat, +first.lon] as const, provinceCode: provinceCodeFromAddress(first.address) }
        : null;

      searches.set(key, result);
      return result;
    },

    async reverseProvince([lat, lon]) {
      // ~10 m grid: GPS jitter doesn't trigger new requests
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (reverses.has(key)) return reverses.get(key)!;

      const place = await limiter(() =>
        http.getJson<NominatimPlace>(`${NOMINATIM_REVERSE_URL}&lat=${lat}&lon=${lon}`),
      );
      const code = provinceCodeFromAddress(place.address);

      reverses.set(key, code);
      return code;
    },
  };
}
