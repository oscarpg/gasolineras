import { FUEL_TYPES } from '../config/fuels';
import type { FuelType, HistoryPrices, PriceStaleness, Staleness, StalenessIndex, Station } from './types';

/** Two prices closer than this (€/l) are treated as equal. */
export const PRICE_EPSILON = 0.0005;

export const samePrice = (a: number, b: number): boolean => Math.abs(a - b) < PRICE_EPSILON;

/** One past bulletin day for a single station and fuel. */
export interface HistoryDay {
  /** 1 = yesterday, 2 = the day before… */
  daysAgo: number;
  /** Bulletin date, dd-mm-yyyy. */
  date: string;
  /** Price that day, or `null` if the station had none. */
  price: number | null;
}

/**
 * Counts how many consecutive past days the price has stayed the same as today.
 *
 * @param currentPrice today's price
 * @param history      past days ordered from yesterday backwards; `null` = that day's data
 *                     couldn't be downloaded (counting stops there)
 * @param currentDate  date of today's bulletin, used as `since` when the price changed yesterday
 *
 * If every day in `history` matches, `days` equals `history.length`: the price is
 * *at least* that old (we can't see further back).
 */
export function computeStaleness(
  currentPrice: number,
  history: readonly (HistoryDay | null)[],
  currentDate: string,
): Staleness {
  let days = 0;
  let since = currentDate;

  for (const day of history) {
    if (!day || day.price == null || !samePrice(day.price, currentPrice)) break;
    days = day.daysAgo;
    since = day.date;
  }

  return { days, since };
}

/** A past day included in a staleness check. */
export interface HistoryWindowDay {
  daysAgo: number;
  /** dd-mm-yyyy */
  date: string;
}

/**
 * Staleness of every fuel price for a set of stations, given the province's history.
 *
 * @param stations     stations of one province (those without a MITECO code are skipped)
 * @param window       the past days checked, from yesterday backwards
 * @param history      history for each day in `window` (same order); `null` = day unavailable
 * @param currentDate  today's date, used when a station has no bulletin date
 */
export function computeProvinceStaleness(
  stations: readonly Station[],
  window: readonly HistoryWindowDay[],
  history: readonly (HistoryPrices | null)[],
  currentDate: string,
): StalenessIndex {
  const result: StalenessIndex = {};
  for (const station of stations) {
    if (!station.code) continue;
    const entry: Partial<Record<FuelType, PriceStaleness>> = {};
    for (const fuel of FUEL_TYPES) {
      const price = station.prices[fuel];
      if (price == null) continue;
      const days = window.map((day, i) => {
        const prices = history[i];
        return prices
          ? { daysAgo: day.daysAgo, date: day.date, price: prices[station.code]?.[fuel] ?? null }
          : null;
      });
      entry[fuel] = {
        ...computeStaleness(price, days, station.bulletinDate || currentDate),
        windowDays: window.length,
      };
    }
    result[station.id] = entry;
  }
  return result;
}
