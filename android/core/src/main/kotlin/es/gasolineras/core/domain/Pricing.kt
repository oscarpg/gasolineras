package es.gasolineras.core.domain

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Price per litre after applying a brand discount, rounded to 3 decimals and never negative.
 * Returns the base price unchanged if there is no valid discount, and null if there is no base price.
 */
fun effectivePrice(basePrice: Double?, discount: Discount? = null): Double? {
    if (basePrice == null) return null
    if (discount == null || discount.value <= 0.0) return basePrice
    val reduction = when (discount.type) {
        DiscountType.PCT -> basePrice * (discount.value / 100)
        DiscountType.CTS -> discount.value / 100
    }
    return maxOf(0.0, roundTo3(basePrice - reduction))
}

/** Same result as JavaScript's `+x.toFixed(3)`: rounds the exact binary value, halves away from zero. */
internal fun roundTo3(x: Double): Double = BigDecimal(x).setScale(3, RoundingMode.HALF_UP).toDouble()

data class CostBreakdown(
    /** Round-trip distance to the station (km). */
    val roundTripKm: Double?,
    /** Cost of filling the whole tank (€). */
    val tankCost: Double?,
    /** Fuel burnt driving there and back (litres). */
    val tripLitres: Double?,
    /** Cost of that fuel (€). */
    val tripCost: Double?,
    /** Tank + trip (€): the real cost of choosing this station. */
    val totalCost: Double?,
)

/**
 * Real cost of filling up at a station: a full tank plus the fuel used to drive there and back.
 *
 * @param pricePerLitre effective price at the station (€/l)
 * @param oneWayKm      distance to the station, or the detour from the route; null if unknown
 * @param car           car specs, or null if no car is selected
 *
 * With no car or no price, only `roundTripKm` is filled in.
 * With a car but unknown distance, the trip counts as 0 km.
 */
fun costBreakdown(pricePerLitre: Double?, oneWayKm: Double?, car: CarSpecs?): CostBreakdown {
    if (car == null || pricePerLitre == null) {
        return CostBreakdown(oneWayKm?.let { it * 2 }, null, null, null, null)
    }
    val tankCost = car.tankLitres * pricePerLitre
    val roundTripKm = oneWayKm?.let { it * 2 } ?: 0.0
    val tripLitres = roundTripKm * car.consumptionL100km / 100
    val tripCost = tripLitres * pricePerLitre
    return CostBreakdown(roundTripKm, tankCost, tripLitres, tripCost, tankCost + tripCost)
}
