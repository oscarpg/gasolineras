/** External services used by the app. */

const MITECO_BASE = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes';

/** Current prices for a province: append the 2-digit province code. */
export const MITECO_PROVINCE_URL = `${MITECO_BASE}/EstacionesTerrestres/FiltroProvincia/`;

/** Historical prices for a province: append `dd-mm-yyyy/<province code>`. */
export const MITECO_PROVINCE_HISTORY_URL = `${MITECO_BASE}/EstacionesTerrestresHist/FiltroProvincia/`;

/** OSRM routing: append `lon,lat;lon,lat?...`. */
export const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving/';

/** Nominatim forward search: append the URL-encoded query. */
export const NOMINATIM_SEARCH_URL =
  'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=';

/** Nominatim reverse geocoding: append `&lat=..&lon=..`. */
export const NOMINATIM_REVERSE_URL =
  'https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1';

/**
 * Public CORS relays used as fallbacks when MITECO blocks the browser request.
 * Temporary: there is no own proxy yet (see refactor plan §5).
 */
export const CORS_RELAYS = {
  allOrigins: (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  codeTabs: (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
} as const;
