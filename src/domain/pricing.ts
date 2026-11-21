import type { CarSpecs, Discount } from './types';

/**
 * Price per litre after applying a brand discount, rounded to 3 decimals and never negative.
 * Returns the base price unchanged if there is no valid discount, and `null` if there is no base price.
 */
export function effectivePrice(
  basePrice: number | null | undefined,
  discount?: Discount | null,
): number | null {
  if (basePrice == null) return null;
  if (!discount || !discount.value || discount.value <= 0) return basePrice;

  const reduction = discount.type === 'PCT' ? basePrice * (discount.value / 100) : discount.value / 100;
  return Math.max(0, +(basePrice - reduction).toFixed(3));
}

export interface CostBreakdown {
  /** Round-trip distance to the station (km). */
  roundTripKm: number | null;
  /** Cost of filling the whole tank (€). */
  tankCost: number | null;
  /** Fuel burnt driving there and back (litres). */
  tripLitres: number | null;
  /** Cost of that fuel (€). */
  tripCost: number | null;
  /** Tank + trip (€): the real cost of choosing this station. */
  totalCost: number | null;
}

/**
 * Real cost of filling up at a station: a full tank plus the fuel used to drive there and back.
 *
 * @param pricePerLitre effective price at the station (€/l)
 * @param oneWayKm      distance to the station, or the detour from the route; `null` if unknown
 * @param car           car specs, or `null` if no car is selected
 *
 * With no car or no price, only `roundTripKm` is filled in.
 * With a car but unknown distance, the trip counts as 0 km.
 */
export function costBreakdown(
  pricePerLitre: number | null,
  oneWayKm: number | null,
  car: CarSpecs | null,
): CostBreakdown {
  if (!car || pricePerLitre == null) {
    return {
      roundTripKm: oneWayKm != null ? oneWayKm * 2 : null,
      tankCost: null,
      tripLitres: null,
      tripCost: null,
      totalCost: null,
    };
  }

  const tankCost = car.tankLitres * pricePerLitre;
  const roundTripKm = oneWayKm != null ? oneWayKm * 2 : 0;
  const tripLitres = (roundTripKm * car.consumptionL100km) / 100;
  const tripCost = tripLitres * pricePerLitre;

  return { roundTripKm, tankCost, tripLitres, tripCost, totalCost: tankCost + tripCost };
}
