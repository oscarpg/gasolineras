package es.gasolineras.core.domain

import kotlin.math.abs

/** Two prices closer than this (€/l) are treated as equal. */
const val PRICE_EPSILON = 0.0005

fun samePrice(a: Double, b: Double): Boolean = abs(a - b) < PRICE_EPSILON

/** One past bulletin day for a single station and fuel. */
data class HistoryDay(
    /** 1 = yesterday, 2 = the day before… */
    val daysAgo: Int,
    /** Bulletin date, dd-mm-yyyy. */
    val date: String,
    /** Price that day, or null if the station had none. */
    val price: Double?,
)

/**
 * Counts how many consecutive past days the price has stayed the same as today.
 *
 * @param history     past days from yesterday backwards; null = that day's data couldn't be
 *                    downloaded (counting stops there)
 * @param currentDate date of today's bulletin, used as `since` when the price changed yesterday
 *
 * If every day matches, `days` equals the last `daysAgo`: the price is *at least* that old.
 */
fun computeStaleness(currentPrice: Double, history: List<HistoryDay?>, currentDate: String): Staleness {
    var days = 0
    var since = currentDate
    for (day in history) {
        if (day?.price == null || !samePrice(day.price, currentPrice)) break
        days = day.daysAgo
        since = day.date
    }
    return Staleness(days, since)
}

/** A past day included in a staleness check. */
data class HistoryWindowDay(val daysAgo: Int, /** dd-mm-yyyy */ val date: String)

/**
 * Staleness of every fuel price for a set of stations, given the province's history.
 *
 * @param stations    stations of one province (those without a MITECO code are skipped)
 * @param window      the past days checked, from yesterday backwards
 * @param history     history for each day in [window] (same order); null = day unavailable
 * @param currentDate today's date, used when a station has no bulletin date
 */
fun computeProvinceStaleness(
    stations: List<Station>,
    window: List<HistoryWindowDay>,
    history: List<HistoryPrices?>,
    currentDate: String,
): StalenessIndex {
    val result = LinkedHashMap<String, Map<FuelType, PriceStaleness>>()
    for (station in stations) {
        if (station.code.isEmpty()) continue
        val entry = LinkedHashMap<FuelType, PriceStaleness>()
        for (fuel in FuelType.entries) {
            val price = station.prices[fuel] ?: continue
            val days = window.mapIndexed { i, day ->
                history.getOrNull(i)?.let { prices -> HistoryDay(day.daysAgo, day.date, prices[station.code]?.get(fuel)) }
            }
            val s = computeStaleness(price, days, station.bulletinDate.ifEmpty { currentDate })
            entry[fuel] = PriceStaleness(s.days, s.since, window.size)
        }
        result[station.id] = entry
    }
    return result
}
