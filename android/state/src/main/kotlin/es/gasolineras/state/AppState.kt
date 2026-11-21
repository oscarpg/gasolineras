package es.gasolineras.state

import es.gasolineras.core.domain.BrandedStation
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.Preferences
import es.gasolineras.core.domain.StalenessIndex

/** A running price-history check for one province. */
data class HistoryJob(val province: String, /** How many past days are being compared. */ val days: Int)

/** What the history indicator shows: the latest job's outcome, or LOADING while any job runs. */
data class HistoryStatus(val kind: Kind, val days: Int) {
    enum class Kind { LOADING, DONE, ERROR }
}

/** Everything the app knows. Replaced (never mutated) on every change. Port of state/appState.ts. */
data class AppState(
    val preferences: Preferences,
    /** All stations loaded so far, in load order (also the tie-break order when sorting). */
    val stations: List<BrandedStation> = emptyList(),
    val staleness: StalenessIndex = emptyMap(),
    /** Provinces whose stations have been loaded. */
    val loadedProvinces: List<String> = emptyList(),
    /** Per province, how many past days the applied staleness covers. */
    val historyDepth: Map<String, Int> = emptyMap(),
    /** History checks in progress, by job id (insertion order). */
    val historyJobs: Map<Int, HistoryJob> = emptyMap(),
    val historyStatus: HistoryStatus? = null,
    /** Origin chosen by GPS or address search. */
    val userPosition: LatLng? = null,
    val route: List<LatLng>? = null,
)

/**
 * Initial state from saved preferences. Like the web app: if no car is marked active but cars
 * exist, the first one becomes active, and the active car's fuel wins over the saved fuel.
 */
fun createInitialState(saved: Preferences): AppState {
    val activeCarId = saved.activeCarId ?: saved.cars.firstOrNull()?.id
    val activeCar = saved.cars.firstOrNull { it.id == activeCarId }
    return AppState(preferences = saved.copy(activeCarId = activeCarId, fuel = activeCar?.fuel ?: saved.fuel))
}
