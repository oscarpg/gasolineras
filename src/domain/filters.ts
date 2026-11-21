import { matchesAgeFilter } from './ageFilter';
import { colorForValue } from './colorScale';
import { distanceKm, distanceToRouteKm } from './geo';
import { costBreakdown, effectivePrice, type CostBreakdown } from './pricing';
import type {
  AgeFilter,
  BrandedStation,
  CarSpecs,
  Discount,
  FuelType,
  LatLng,
  PriceStaleness,
  StalenessIndex,
} from './types';

/** With "only stations on the route", the max distance from the route line (km). */
export const ROUTE_ONLY_MAX_KM = 0.15;

export interface VisibilityCriteria {
  fuel: FuelType;
  /** Brands to show; empty = all. */
  brands: readonly string[];
  ageFilter: AgeFilter;
  staleness: StalenessIndex;
  userPosition: LatLng | null;
  /** When set, stations are filtered by detour from the route instead of distance from the user. */
  route: readonly LatLng[] | null;
  searchRadiusKm: number;
  routeDetourKm: number;
  routeOnly: boolean;
  car: CarSpecs | null;
  discounts: Readonly<Record<string, Discount>>;
  sortByTotalCost: boolean;
}

export interface StationRow {
  station: BrandedStation;
  basePrice: number;
  /** After the brand discount. */
  finalPrice: number;
  /** The brand's discount, if any (it may not lower the price, e.g. a 0% discount). */
  discount: Discount | null;
  distanceFromUserKm: number | null;
  routeDetourKm: number | null;
  cost: CostBreakdown;
  staleness: PriceStaleness | null;
  /** The value rows are ranked by: total cost or €/l. */
  metric: number;
  /** Green (best) → red (worst) colour for the metric. */
  color: string;
}

export interface VisibleStations {
  rows: StationRow[];
  /** True when rows are ranked by total cost (requires a car). */
  sortedByTotalCost: boolean;
}

/**
 * Which stations to show and in what order. Pure: the map, the list and the
 * status line all render from this result.
 *
 * A station is shown when it matches the brand filter, sells the fuel, passes the
 * age filter, and is within the search radius (or, with a route, within the detour
 * limit of the route). Rows are sorted by €/l, or by total cost when a car is
 * selected and that option is on; the sort is stable.
 */
export function selectVisibleStations(
  stations: readonly BrandedStation[],
  c: VisibilityCriteria,
): VisibleStations {
  const sortedByTotalCost = !!(c.car && c.sortByTotalCost);
  const routeLimit = c.routeOnly ? ROUTE_ONLY_MAX_KM : c.routeDetourKm;
  const brandFilter = new Set(c.brands);

  const rows: Omit<StationRow, 'metric' | 'color'>[] = [];
  for (const station of stations) {
    if (brandFilter.size > 0 && !brandFilter.has(station.brand)) continue;

    const basePrice = station.prices[c.fuel];
    if (basePrice == null) continue;

    const staleness = c.staleness[station.id]?.[c.fuel] ?? null;
    if (!matchesAgeFilter(staleness?.days, c.ageFilter)) continue;

    const position: LatLng = [station.lat, station.lon];
    const routeDetourKm = c.route ? distanceToRouteKm(position, c.route) : null;
    const distanceFromUserKm = c.userPosition ? distanceKm(position, c.userPosition) : null;

    const inRange = c.route
      ? routeDetourKm! <= routeLimit
      : distanceFromUserKm !== null && distanceFromUserKm <= c.searchRadiusKm;
    if (!inRange) continue;

    const discount = c.discounts[station.brand] ?? null;
    const finalPrice = effectivePrice(basePrice, discount)!;
    const cost = costBreakdown(finalPrice, c.route ? routeDetourKm : distanceFromUserKm, c.car);

    rows.push({
      station,
      basePrice,
      finalPrice,
      discount,
      distanceFromUserKm,
      routeDetourKm,
      cost,
      staleness,
    });
  }

  rows.sort((a, b) =>
    sortedByTotalCost && a.cost.totalCost != null && b.cost.totalCost != null
      ? a.cost.totalCost - b.cost.totalCost
      : a.finalPrice - b.finalPrice,
  );

  const metricOf = (r: (typeof rows)[number]) =>
    sortedByTotalCost && r.cost.totalCost != null ? r.cost.totalCost : r.finalPrice;
  const min = rows.length ? metricOf(rows[0]!) : 0;
  const max = rows.length ? metricOf(rows[rows.length - 1]!) : 0;

  return {
    sortedByTotalCost,
    rows: rows.map((r) => {
      const metric = metricOf(r);
      return { ...r, metric, color: colorForValue(metric, min, max) };
    }),
  };
}
