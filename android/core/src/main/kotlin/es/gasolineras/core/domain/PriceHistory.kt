package es.gasolineras.core.domain

interface PricePoint {
    /** Position on the x axis (0 = oldest). */
    val idx: Int
    val label: String
    val price: Double?
}

/**
 * Picks the points worth plotting from a daily price series: the first known price,
 * every day the price changed, and the last day. Days with no data are skipped.
 */
fun <T : PricePoint> significantPricePoints(series: List<T>): List<T> {
    val points = mutableListOf<T>()
    var lastKnown: Double? = null
    series.forEachIndexed { i, item ->
        val price = item.price ?: return@forEachIndexed
        val isFirst = lastKnown == null
        val isLast = i == series.size - 1
        val changed = !isFirst && !samePrice(price, lastKnown!!)
        if (isFirst || changed || isLast) {
            points += item
            lastKnown = price
        }
    }
    return points
}
