package es.gasolineras.core.domain

enum class AppLocale(val tag: String) { ES("es"), EN("en") }

/** A saved favourite: enough to find it again (its province is loaded when favourites are shown). */
data class FavouriteStation(val id: String, val provinceCode: String, val brand: String)

/** Everything the user chooses that survives a restart. Same fields as the web app's schema v3. */
data class Preferences(
    val fuel: FuelType = FuelType.DEFAULT,
    val ageFilterOption: AgeFilterOption = AgeFilterOption.ALL,
    /** The "X" days used by the custom age-filter options ([MIN_CUSTOM_AGE_DAYS]..[MAX_CUSTOM_AGE_DAYS]). */
    val ageFilterCustomDays: Int = 3,
    /** Max distance from the user's location (1–50 km). */
    val searchRadiusKm: Double = 15.0,
    /** Max detour from the route (1–10 km). */
    val routeDetourKm: Double = 3.0,
    /** Only stations right on the route. */
    val routeOnly: Boolean = false,
    /** Sort by tank + trip cost instead of €/l. */
    val sortByTotalCost: Boolean = false,
    /** Brands to show; empty = all. */
    val brands: Set<String> = emptySet(),
    /** Discount per brand. */
    val discounts: Map<String, Discount> = emptyMap(),
    val cars: List<Car> = emptyList(),
    val activeCarId: String? = null,
    /** UI language; null = follow the system. */
    val locale: AppLocale? = null,
    /** Favourite stations (Android only; not part of the web app's preferences). */
    val favourites: List<FavouriteStation> = emptyList(),
) {
    val favouriteIds: Set<String> get() = favourites.mapTo(HashSet()) { it.id }

    val ageFilter: AgeFilter get() = ageFilterOption.toFilter(ageFilterCustomDays)
    val activeCar: Car? get() = cars.firstOrNull { it.id == activeCarId }

    companion object {
        const val SCHEMA_VERSION = 3
        val DEFAULT = Preferences()
    }
}

const val MIN_CUSTOM_AGE_DAYS = 1
const val MAX_CUSTOM_AGE_DAYS = 10
const val MIN_SEARCH_RADIUS_KM = 1.0
const val MAX_SEARCH_RADIUS_KM = 50.0
const val MIN_ROUTE_DETOUR_KM = 1.0
const val MAX_ROUTE_DETOUR_KM = 10.0
