package es.gasolineras.state

import es.gasolineras.core.domain.BrandedStation
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.Preferences
import es.gasolineras.core.domain.StalenessIndex
import es.gasolineras.core.domain.VisibilityCriteria
import es.gasolineras.core.domain.VisibleStations
import es.gasolineras.core.domain.selectVisibleStations
import java.text.Collator
import java.util.Locale

val AppState.isCheckingHistory: Boolean get() = historyJobs.isNotEmpty()

/**
 * Memoised selector for the stations to show. Only stations, staleness, preferences, position and
 * route matter (compared by reference), so history bookkeeping doesn't trigger a recomputation.
 */
class VisibleStationsSelector {
    private var lastInputs: List<Any?>? = null
    private var lastResult: VisibleStations? = null

    @Synchronized
    fun select(s: AppState): VisibleStations {
        val inputs = listOf<Any?>(s.stations, s.staleness, s.preferences, s.userPosition, s.route)
        val previous = lastInputs
        if (previous != null && previous.indices.all { previous[it] === inputs[it] }) return lastResult!!
        val result = compute(s.stations, s.staleness, s.preferences, s.userPosition, s.route)
        lastInputs = inputs
        lastResult = result
        return result
    }

    private fun compute(
        stations: List<BrandedStation>,
        staleness: StalenessIndex,
        p: Preferences,
        userPosition: LatLng?,
        route: List<LatLng>?,
    ) = selectVisibleStations(
        stations,
        VisibilityCriteria(
            fuel = p.fuel,
            brands = p.brands,
            ageFilter = p.ageFilter,
            staleness = staleness,
            userPosition = userPosition,
            route = route,
            searchRadiusKm = p.searchRadiusKm,
            routeDetourKm = p.routeDetourKm,
            routeOnly = p.routeOnly,
            car = p.activeCar,
            discounts = p.discounts,
            sortByTotalCost = p.sortByTotalCost,
        ),
    )
}

/** Brands of the loaded stations with how many stations each has, sorted with Spanish collation. */
fun countBrands(stations: List<BrandedStation>): List<Pair<String, Int>> {
    val collator = Collator.getInstance(Locale.forLanguageTag("es"))
    return stations.groupingBy { it.brand }.eachCount().toList().sortedWith { a, b -> collator.compare(a.first, b.first) }
}
