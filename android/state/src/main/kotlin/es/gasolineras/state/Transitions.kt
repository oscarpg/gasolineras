package es.gasolineras.state

import es.gasolineras.core.domain.BrandedStation
import es.gasolineras.core.domain.Car
import es.gasolineras.core.domain.Discount
import es.gasolineras.core.domain.FavouriteStation
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.MAX_CUSTOM_AGE_DAYS
import es.gasolineras.core.domain.MIN_CUSTOM_AGE_DAYS
import es.gasolineras.core.domain.Preferences
import es.gasolineras.core.domain.StalenessIndex
import es.gasolineras.core.domain.Station
import es.gasolineras.core.domain.normalizeBrand

/*
 * Pure state transitions: (state, ...args) -> new state. Port of state/transitions.ts.
 * Every change the user or the app makes goes through one of these, via Store.update.
 */

/* ---------- preferences ---------- */

fun AppState.updatePreferences(change: (Preferences) -> Preferences): AppState = copy(preferences = change(preferences))

/** Changing the fuel deactivates a car that uses a different fuel. */
fun AppState.setFuel(fuel: FuelType): AppState = updatePreferences { p ->
    val active = p.cars.firstOrNull { it.id == p.activeCarId }
    p.copy(fuel = fuel, activeCarId = if (active != null && active.fuel != fuel) null else p.activeCarId)
}

/** The "X" of the custom age filters, clamped to 1–10 (3 if 0). */
fun AppState.setCustomAgeDays(value: Int): AppState = updatePreferences {
    it.copy(ageFilterCustomDays = (value.takeIf { v -> v != 0 } ?: 3).coerceIn(MIN_CUSTOM_AGE_DAYS, MAX_CUSTOM_AGE_DAYS))
}

/* ---------- cars ---------- */

/** Activates a car and switches to its fuel. */
fun AppState.selectCar(id: String): AppState = updatePreferences { p ->
    val car = p.cars.firstOrNull { it.id == id }
    p.copy(activeCarId = id, fuel = car?.fuel ?: p.fuel)
}

data class CarInput(val name: String, val fuel: FuelType, val tankLitres: Double, val consumptionL100km: Double)

/** Adds a car, or updates the one with the same name (case-insensitive), and makes it active with its fuel. */
fun AppState.saveCar(input: CarInput, newId: String): AppState = updatePreferences { p ->
    val existing = p.cars.firstOrNull { it.name.lowercase() == input.name.lowercase() }
    val cars = if (existing != null) {
        p.cars.map { if (it.id == existing.id) it.copy(fuel = input.fuel, tankLitres = input.tankLitres, consumptionL100km = input.consumptionL100km) else it }
    } else {
        p.cars + Car(newId, input.name, input.fuel, input.tankLitres, input.consumptionL100km)
    }
    p.copy(cars = cars, activeCarId = existing?.id ?: newId, fuel = input.fuel)
}

/**
 * Edits a car in place, keeping its id (so a renamed car stays active). If it is the active car,
 * its fuel becomes the selected fuel.
 */
fun AppState.updateCar(id: String, input: CarInput): AppState = updatePreferences { p ->
    val cars = p.cars.map {
        if (it.id == id) it.copy(name = input.name, fuel = input.fuel, tankLitres = input.tankLitres, consumptionL100km = input.consumptionL100km) else it
    }
    p.copy(cars = cars, fuel = if (p.activeCarId == id) input.fuel else p.fuel)
}

/** Removes a car. If it was active, the first remaining car (if any) becomes active, with its fuel. */
fun AppState.deleteCar(id: String): AppState = updatePreferences { p ->
    val cars = p.cars.filter { it.id != id }
    if (p.activeCarId != id) return@updatePreferences p.copy(cars = cars)
    val next = cars.firstOrNull()
    p.copy(cars = cars, activeCarId = next?.id, fuel = next?.fuel ?: p.fuel)
}

/* ---------- discounts and brands ---------- */

fun AppState.setDiscount(brand: String, discount: Discount): AppState =
    updatePreferences { it.copy(discounts = it.discounts + (brand to discount)) }

fun AppState.removeDiscount(brand: String): AppState = updatePreferences { it.copy(discounts = it.discounts - brand) }

/** "All brands": on → no brand filter; off → every brand listed, selected. */
fun AppState.setAllBrands(all: Boolean, brandsPresent: List<String>): AppState =
    updatePreferences { it.copy(brands = if (all) emptySet() else LinkedHashSet(brandsPresent)) }

fun AppState.setBrandSelected(brand: String, selected: Boolean): AppState = updatePreferences {
    val others = it.brands - brand
    it.copy(brands = if (selected) others + brand else others)
}

/* ---------- favourites ---------- */

/** Adds the station to favourites, or removes it if it already is one. */
fun AppState.toggleFavourite(station: BrandedStation): AppState = updatePreferences { p ->
    if (p.favourites.any { it.id == station.id }) {
        p.copy(favourites = p.favourites.filter { it.id != station.id })
    } else {
        p.copy(favourites = p.favourites + FavouriteStation(station.id, station.station.provinceCode, station.brand))
    }
}

fun AppState.setFavouritesOnly(on: Boolean): AppState = copy(favouritesOnly = on)

/* ---------- stations ---------- */

/**
 * Adds stations (deduplicated by id; with [replace], existing ones are updated) and drops
 * brand-filter entries for brands no loaded station has, so a saved filter can't hide everything.
 */
fun AppState.addStations(incoming: List<Station>, replace: Boolean = false): AppState {
    val list = stations.toMutableList()
    val indexById = HashMap<String, Int>().apply { list.forEachIndexed { i, s -> put(s.id, i) } }
    for (station in incoming) {
        val branded = BrandedStation(station, normalizeBrand(station.name))
        val index = indexById[station.id]
        if (index == null) {
            indexById[station.id] = list.size
            list += branded
        } else if (replace) {
            list[index] = branded
        }
    }
    val present = list.mapTo(HashSet()) { it.brand }
    val brands = preferences.brands.map(::normalizeBrand).filter { it in present }
    val prefs = if (brands == preferences.brands.toList()) preferences else preferences.copy(brands = LinkedHashSet(brands))
    return copy(stations = list, preferences = prefs)
}

fun AppState.markProvinceLoaded(province: String): AppState =
    if (province in loadedProvinces) this else copy(loadedProvinces = loadedProvinces + province)

/* ---------- location and route ---------- */

fun AppState.setUserPosition(position: LatLng?): AppState = copy(userPosition = position)

fun AppState.setRoute(route: List<LatLng>?): AppState = copy(route = route)

/* ---------- price history ---------- */

fun AppState.startHistoryJob(id: Int, job: HistoryJob): AppState =
    copy(historyJobs = historyJobs + (id to job), historyStatus = HistoryStatus(HistoryStatus.Kind.LOADING, job.days))

/**
 * Applies a finished history check ([result] = staleness, or null if it failed). A result covering
 * fewer days than one already applied for that province is ignored, so a slow short check can't
 * overwrite a longer one. The indicator keeps showing LOADING while other checks still run.
 */
fun AppState.finishHistoryJob(id: Int, result: StalenessIndex?): AppState {
    val job = historyJobs[id] ?: return this
    val jobs = historyJobs - id
    var newStaleness = staleness
    var depth = historyDepth
    if (result != null && job.days >= (historyDepth[job.province] ?: 0)) {
        newStaleness = staleness + result
        depth = historyDepth + (job.province to job.days)
    }
    val running = jobs.values.lastOrNull()
    val status = when {
        running != null -> HistoryStatus(HistoryStatus.Kind.LOADING, running.days)
        result != null -> HistoryStatus(HistoryStatus.Kind.DONE, job.days)
        else -> HistoryStatus(HistoryStatus.Kind.ERROR, job.days)
    }
    return copy(staleness = newStaleness, historyDepth = depth, historyJobs = jobs, historyStatus = status)
}

/** Forgets how deep each province's history was checked (used by "force refresh"). */
fun AppState.resetHistoryDepth(): AppState = copy(historyDepth = emptyMap())
