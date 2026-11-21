import { FUELS, FUEL_TYPES } from '../config/fuels';
import { MITECO_PROVINCE_HISTORY_URL, MITECO_PROVINCE_URL } from '../config/endpoints';
import { toMitecoDate } from '../domain/dates';
import { parseSpanishNumber } from '../domain/numbers';
import type { FuelPrices, HistoryPrices, Station } from '../domain/types';
import type { Cache } from '../storage/cache';
import { corsFallbackAttempts, fetchWithFallback, type DownloadAttempt, type HttpClient } from './http';

/** One station as MITECO sends it: Spanish field names, decimal commas, everything a string. */
export type RawMitecoStation = Record<string, string | undefined>;

export interface MitecoPayload {
  Fecha?: string;
  ListaEESSPrecio?: RawMitecoStation[];
}

/* ---------- parsing (pure) ---------- */

/** MITECO's XML escapes characters in tag names as `_xHHHH_` (e.g. `Rótulo` → `R_x00F3_tulo`). */
export function decodeXmlTagName(tag: string): string {
  return tag.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Converts MITECO's XML format into the same shape as its JSON format. Needs a DOMParser (browser). */
export function parseMitecoXml(text: string, parser: DOMParser = new DOMParser()): MitecoPayload {
  const doc = parser.parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Malformed XML');
  const items = [...doc.querySelectorAll('EESSPrecio')];
  if (items.length === 0) throw new Error('XML contains no stations');
  return {
    Fecha: doc.querySelector('Fecha')?.textContent || '',
    ListaEESSPrecio: items.map((el) => {
      const station: RawMitecoStation = {};
      for (const child of el.children) station[decodeXmlTagName(child.tagName)] = child.textContent ?? '';
      return station;
    }),
  };
}

/** Parses a MITECO response body, which can be JSON or XML depending on the route it came through. */
export function parseMitecoText(text: string): MitecoPayload {
  return text.startsWith('<') ? parseMitecoXml(text) : (JSON.parse(text) as MitecoPayload);
}

const FIELD_KEYS = FUEL_TYPES.map((fuel) => [fuel, FUELS[fuel].mitecoField.toLowerCase()] as const);

/** Prices by fuel, matching MITECO field names case-insensitively. */
function readPrices(raw: RawMitecoStation): FuelPrices {
  const byLowerKey = new Map(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
  return Object.fromEntries(
    FIELD_KEYS.map(([fuel, key]) => [fuel, parseSpanishNumber(byLowerKey.get(key))]),
  ) as FuelPrices;
}

/**
 * Normalises a province's current-prices payload into Stations.
 * Stations without valid coordinates are dropped.
 */
export function toStations(
  payload: MitecoPayload,
  provinceCode: string,
  today: Date = new Date(),
): Station[] {
  const bulletinDate = (payload.Fecha || '').split(' ')[0] || toMitecoDate(today);

  return (payload.ListaEESSPrecio || []).flatMap((raw) => {
    const lat = parseSpanishNumber(raw['Latitud']);
    const lon = parseSpanishNumber(raw['Longitud (WGS84)']);
    if (lat === null || lon === null) return [];
    return [
      {
        id: `${raw['IDEESS'] || raw['Rótulo']}-${raw['Latitud']}-${raw['Longitud (WGS84)']}`,
        code: raw['IDEESS'] || '',
        provinceCode,
        bulletinDate,
        name: raw['Rótulo'] || '',
        address: [raw['Dirección'], raw['Localidad'], raw['Provincia']].filter(Boolean).join(', '),
        lat,
        lon,
        openingHours: raw['Horario'] || '',
        prices: readPrices(raw),
      },
    ];
  });
}

/** Normalises a historical-prices payload: station code → the prices it had (only fuels it sold). */
export function toHistoryPrices(payload: MitecoPayload): HistoryPrices {
  const result: HistoryPrices = {};
  for (const raw of payload.ListaEESSPrecio || []) {
    const code = raw['IDEESS'];
    if (!code) continue;
    result[code] = Object.fromEntries(Object.entries(readPrices(raw)).filter(([, price]) => price !== null));
  }
  return result;
}

/* ---------- service (I/O + cache) ---------- */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day as yyyy-mm-dd (MITECO publishes by Spanish date, not UTC). */
const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export interface MitecoServiceOptions {
  http: HttpClient;
  cache: Cache;
  /** Download strategies; defaults to direct + CORS relays. */
  attempts?: DownloadAttempt[];
  now?: () => Date;
}

export interface MitecoService {
  /** Whether today's prices for the province are already cached (no download needed). */
  hasCachedProvince(provinceCode: string): boolean;
  /** Today's stations for a province; downloaded at most once a day unless `force` is set. */
  getProvinceStations(provinceCode: string, options?: { force?: boolean }): Promise<Station[]>;
  /** Prices a province had on a past day (`dd-mm-yyyy`). Past days never change, so they're cached. */
  getHistoryDay(provinceCode: string, date: string): Promise<HistoryPrices>;
}

export function createMitecoService({
  http,
  cache,
  attempts = corsFallbackAttempts(http),
  now = () => new Date(),
}: MitecoServiceOptions): MitecoService {
  const inFlight = new Map<string, Promise<unknown>>();

  /** Runs `task` once per key at a time: concurrent callers share the same request. */
  function once<T>(key: string, task: () => Promise<T>): Promise<T> {
    const running = inFlight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const promise = task().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  const stationsKey = (code: string) => `stations:${code}:${localDayKey(now())}`;
  const historyKey = (code: string, date: string) => `history:${code}:${date}`;

  const cachedStations = (code: string) => {
    const stations = cache.get<Station[]>(stationsKey(code));
    return stations && stations.length > 0 ? stations : undefined;
  };

  return {
    hasCachedProvince: (code) => cachedStations(code) !== undefined,

    getProvinceStations(code, { force = false } = {}) {
      if (!force) {
        const cached = cachedStations(code);
        if (cached) return Promise.resolve(cached);
      }
      return once(`stations:${code}`, async () => {
        const payload = await fetchWithFallback(MITECO_PROVINCE_URL + code, parseMitecoText, attempts);
        const stations = toStations(payload, code, now());
        if (stations.length > 0) cache.set(stationsKey(code), stations, { ttlMs: 2 * DAY_MS });
        return stations;
      });
    },

    getHistoryDay(code, date) {
      const key = historyKey(code, date);
      const cached = cache.get<HistoryPrices>(key);
      if (cached) return Promise.resolve(cached);
      return once(key, async () => {
        const payload = await fetchWithFallback(
          `${MITECO_PROVINCE_HISTORY_URL}${date}/${code}`,
          parseMitecoText,
          attempts,
        );
        const prices = toHistoryPrices(payload);
        cache.set(key, prices, { ttlMs: 15 * DAY_MS });
        return prices;
      });
    },
  };
}
