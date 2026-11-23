package es.gasolineras.core.domain

/**
 * With "only stations on the route", the max distance from the route line (km) for stations not
 * checked by road yet (see RouteCheck.kt).
 */
const val ROUTE_ONLY_MAX_KM = 0.15

data class VisibilityCriteria(
    val fuel: FuelType,
    /** Brands to show; empty = all. */
    val brands: Set<String> = emptySet(),
    val ageFilter: AgeFilter = AgeFilter.All,
    val staleness: StalenessIndex = emptyMap(),
    val userPosition: LatLng?,
    /** When set, stations are filtered by detour from the route instead of distance from the user. */
    val route: List<LatLng>? = null,
    val searchRadiusKm: Double,
    val routeDetourKm: Double,
    val routeOnly: Boolean = false,
    val car: CarSpecs? = null,
    val discounts: Map<String, Discount> = emptyMap(),
    val sortByTotalCost: Boolean = false,
    /** When set, only these station ids, wherever they are (favourites): radius and route don't apply. */
    val onlyIds: Set<String>? = null,
    /** Nearest first (detour on a route); colours still show the price. */
    val sortByDistance: Boolean = false,
    /** Road checks for "only on the route" (RouteCheck.kt); missing entries use the straight-line rule. */
    val routeChecks: RouteChecks = emptyMap(),
)

data class StationRow(
    val station: BrandedStation,
    val basePrice: Double,
    /** After the brand discount. */
    val finalPrice: Double,
    /** The brand's discount, if any (it may not lower the price, e.g. a 0% discount). */
    val discount: Discount?,
    val distanceFromUserKm: Double?,
    val routeDetourKm: Double?,
    val cost: CostBreakdown,
    val staleness: PriceStaleness?,
    /** The value rows are ranked by: total cost or €/l. */
    val metric: Double,
    /** Green (best) → red (worst) colour for the metric. */
    val color: ScaleColor,
)

data class VisibleStations(
    val rows: List<StationRow>,
    /** True when rows are ranked by total cost (requires a car). */
    val sortedByTotalCost: Boolean,
    /** True when rows are ranked by distance. */
    val sortedByDistance: Boolean = false,
)

/**
 * Which stations to show and in what order. Pure: the map, the list and the status line all
 * render from this result.
 *
 * A station is shown when it matches the brand filter, sells the fuel, passes the age filter,
 * and is within the search radius (or, with a route, within the detour limit of the route).
 * Rows are sorted by €/l, or by total cost when a car is selected and that option is on.
 * Equal values go nearer first (detour from the route, then distance from the user); the sort is
 * otherwise stable. (The web app keeps load order for ties.)
 */
fun selectVisibleStations(stations: List<BrandedStation>, c: VisibilityCriteria): VisibleStations {
    val sortedByTotalCost = c.car != null && c.sortByTotalCost

    val rows = stations.mapNotNull { branded ->
        val station = branded.station
        if (c.onlyIds != null && branded.id !in c.onlyIds) return@mapNotNull null
        if (c.brands.isNotEmpty() && branded.brand !in c.brands) return@mapNotNull null

        val basePrice = station.prices[c.fuel] ?: return@mapNotNull null

        val staleness = c.staleness[station.id]?.get(c.fuel)
        if (!matchesAgeFilter(staleness?.days, c.ageFilter)) return@mapNotNull null

        val position = station.position
        val routeDetourKm = c.route?.let { distanceToRouteKm(position, it) }
        val distanceFromUserKm = c.userPosition?.let { distanceKm(position, it) }

        val inRange = if (c.onlyIds != null) {
            true
        } else if (routeDetourKm != null) {
            if (c.routeOnly) {
                isOnRoute(routeDetourKm, branded.id in c.routeChecks, c.routeChecks[branded.id], ROUTE_ONLY_MAX_KM)
            } else {
                routeDetourKm <= c.routeDetourKm
            }
        } else {
            distanceFromUserKm != null && distanceFromUserKm <= c.searchRadiusKm
        }
        if (!inRange) return@mapNotNull null

        val discount = c.discounts[branded.brand]
        val finalPrice = effectivePrice(basePrice, discount)!!
        val cost = costBreakdown(finalPrice, routeDetourKm ?: distanceFromUserKm, c.car)
        PartialRow(branded, basePrice, finalPrice, discount, distanceFromUserKm, routeDetourKm, cost, staleness)
    }

    fun metricOf(r: PartialRow): Double =
        if (sortedByTotalCost && r.cost.totalCost != null) r.cost.totalCost else r.finalPrice

    fun distanceOf(r: PartialRow): Double = r.routeDetourKm ?: r.distanceFromUserKm ?: Double.MAX_VALUE

    // Equal price (or total cost): nearer first — smaller detour on a route, then distance from the user.
    // By distance: nearest first, then cheapest. Remaining ties keep load order (the sort is stable).
    val sorted = if (c.sortByDistance) {
        rows.sortedWith(compareBy<PartialRow> { distanceOf(it) }.thenBy { metricOf(it) })
    } else {
        rows.sortedWith(
            compareBy<PartialRow> { metricOf(it) }
                .thenBy { it.routeDetourKm ?: Double.MAX_VALUE }
                .thenBy { it.distanceFromUserKm ?: Double.MAX_VALUE },
        )
    }
    // Colours always rank the price (or total cost), whatever the order.
    val min = sorted.minOfOrNull(::metricOf) ?: 0.0
    val max = sorted.maxOfOrNull(::metricOf) ?: 0.0

    return VisibleStations(
        sortedByTotalCost = sortedByTotalCost && !c.sortByDistance,
        sortedByDistance = c.sortByDistance,
        rows = sorted.map { r ->
            val metric = metricOf(r)
            StationRow(
                r.station, r.basePrice, r.finalPrice, r.discount, r.distanceFromUserKm, r.routeDetourKm,
                r.cost, r.staleness, metric, colorForValue(metric, min, max),
            )
        },
    )
}

private data class PartialRow(
    val station: BrandedStation,
    val basePrice: Double,
    val finalPrice: Double,
    val discount: Discount?,
    val distanceFromUserKm: Double?,
    val routeDetourKm: Double?,
    val cost: CostBreakdown,
    val staleness: PriceStaleness?,
)
