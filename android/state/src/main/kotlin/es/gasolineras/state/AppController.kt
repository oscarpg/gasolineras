package es.gasolineras.state

import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.ROUTE_ONLY_MAX_KM
import es.gasolineras.data.geo.Geocoder
import es.gasolineras.data.geo.Router
import es.gasolineras.data.miteco.MitecoSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The device position. Implementations throw [es.gasolineras.core.domain.AppError] (GEOLOCATION_*) on failure. */
interface PositionProvider {
    fun isAvailable(): Boolean
    suspend fun currentPosition(): LatLng
}

/** Temporary status messages; the UI translates them. [Ready] means "show the results summary". */
sealed interface Status {
    data object Locating : Status
    data object LocatingGps : Status
    data object NoGeolocation : Status
    data object NoLocationYet : Status
    data object Waiting : Status
    data object FindingProvince : Status
    data class DownloadingProvince(val code: String) : Status
    data object SearchingAddress : Status
    data object CalculatingRoute : Status
    data object Ready : Status
}

/** Errors shown in their own box until retried or dismissed. [cause] is technical detail. */
sealed interface UserError {
    val cause: Throwable? get() = null

    data class Gps(override val cause: Throwable) : UserError
    data class Province(val code: String, override val cause: Throwable) : UserError
    data object ProvinceUnknown : UserError
    data object AddressNotFound : UserError
    data object DestinationNotFound : UserError
    data object OriginFirst : UserError
    data object RouteNotFound : UserError
    data class Route(override val cause: Throwable) : UserError
    data class Generic(override val cause: Throwable) : UserError
}

data class ShownError(val error: UserError, val retry: (() -> Unit)?)

data class ControllerState(val status: Status = Status.Waiting, val error: ShownError? = null)

/** One-off map instructions. */
sealed interface MapEvent {
    data class ShowUserPosition(val position: LatLng, val zoom: Double) : MapEvent
    data class ShowRoute(val points: List<LatLng>) : MapEvent
    data object ClearRoute : MapEvent
}

/**
 * The location and route flows: GPS or address → origin → province → stations, and routes.
 * Port of ui/locationController.ts with the DOM and map calls replaced by [state] and [mapEvents].
 */
class AppController(
    private val store: Store<AppState>,
    private val effects: Effects,
    private val miteco: MitecoSource,
    private val geocoder: Geocoder,
    private val router: Router,
    private val gps: PositionProvider,
    private val scope: CoroutineScope,
    private val provinces: ProvinceLocator = ShapesProvinceLocator(),
) {
    private val mutableState = MutableStateFlow(ControllerState())
    val state: StateFlow<ControllerState> = mutableState.asStateFlow()

    private val events = MutableSharedFlow<MapEvent>(extraBufferCapacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val mapEvents: SharedFlow<MapEvent> = events.asSharedFlow()

    private fun show(status: Status) = mutableState.update { it.copy(status = status) }
    private fun showError(error: UserError, retry: (() -> Unit)? = null) = mutableState.update { it.copy(error = ShownError(error, retry)) }
    fun clearError() = mutableState.update { it.copy(error = null) }

    /** Back to the summary, or to "waiting for location" while there is no origin yet. */
    private fun settle() = show(if (store.value.userPosition != null) Status.Ready else Status.Waiting)

    private fun fail(error: UserError, retry: (() -> Unit)? = null) {
        showError(error, retry)
        settle()
    }

    private fun relaunch(block: suspend () -> Unit): () -> Unit = { scope.launch { block() } }

    /** Loads a province's stations. On failure shows an error with Retry and returns false. */
    private suspend fun loadProvince(code: String?, force: Boolean = false): Boolean {
        if (code == null) return true
        if (!force && code in store.value.loadedProvinces) return true
        if (force || !miteco.hasCachedProvince(code)) show(Status.DownloadingProvince(code))
        return try {
            effects.loadProvince(code, force)
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            showError(UserError.Province(code, e), relaunch { if (loadProvince(code, force)) settle() })
            false
        }
    }

    private suspend fun setOrigin(position: LatLng, zoom: Double = 13.0, knownProvince: String? = null) {
        clearError()
        events.tryEmit(MapEvent.ShowUserPosition(position, zoom))
        store.update { it.setUserPosition(position) }

        var province = knownProvince
        if (province == null) {
            show(Status.FindingProvince)
            province = try {
                geocoder.reverseProvince(position)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            } ?: provinces.provinceAt(position) // offline outlines when geocoding fails
        }
        if (province != null) {
            loadProvince(province)
        } else {
            showError(UserError.ProvinceUnknown, relaunch { setOrigin(position, zoom) })
        }
        loadProvincesNeeded()
        settle()
    }

    /**
     * Provinces whose stations can appear in the list: those within the search radius of the
     * origin, or within the detour distance of the route (with a margin for the simplified outlines).
     */
    private fun provincesNeeded(): List<String> {
        val s = store.value
        val p = s.preferences
        val route = s.route
        return when {
            route != null -> provinces.provincesAlongRoute(route, (if (p.routeOnly) ROUTE_ONLY_MAX_KM else p.routeDetourKm) + PROVINCE_MARGIN_KM)
            s.userPosition != null -> provinces.provincesWithin(s.userPosition, p.searchRadiusKm + PROVINCE_MARGIN_KM)
            else -> emptyList()
        }
    }

    /** Loads every needed province not loaded yet. Returns false if any failed (each shows its own error). */
    private suspend fun loadProvincesNeeded(): Boolean {
        var ok = true
        for (code in provincesNeeded()) {
            if (code !in store.value.loadedProvinces && !loadProvince(code)) ok = false
        }
        return ok
    }

    /**
     * Makes sure every province the current radius, detour or route reaches is loaded
     * (call after those preferences change).
     */
    suspend fun ensureCoverage() {
        if (provincesNeeded().any { it !in store.value.loadedProvinces }) {
            loadProvincesNeeded()
            settle()
        }
    }

    /** Asks the device for its position and uses it as the origin. */
    fun requestGps() {
        clearError()
        show(Status.LocatingGps)
        scope.launch {
            val position = try {
                gps.currentPosition()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                fail(UserError.Gps(e), ::requestGps)
                return@launch
            }
            setOrigin(position)
        }
    }

    /** Geocodes an address and uses it as the origin. Returns true on success. */
    suspend fun searchAddress(query: String): Boolean {
        clearError()
        show(Status.SearchingAddress)
        return try {
            val place = geocoder.search(query)
            if (place == null) {
                fail(UserError.AddressNotFound)
                false
            } else {
                setOrigin(place.latLng, 13.0, place.provinceCode)
                true
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            fail(UserError.Generic(e), relaunch { searchAddress(query) })
            false
        }
    }

    /** Geocodes a destination and sets the route from the origin. Returns true on success. */
    suspend fun calculateRoute(query: String): Boolean {
        clearError()
        val origin = store.value.userPosition ?: run {
            fail(UserError.OriginFirst)
            return false
        }
        show(Status.CalculatingRoute)
        return try {
            val place = geocoder.search(query)
            if (place == null) {
                fail(UserError.DestinationNotFound)
                return false
            }
            val points = router.route(origin, place.latLng)
            if (points == null) {
                fail(UserError.RouteNotFound)
                return false
            }
            events.tryEmit(MapEvent.ShowRoute(points))
            store.update { it.setRoute(points) }
            // Every province along the route, not only the destination's.
            loadProvincesNeeded()
            settle()
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            fail(UserError.Route(e), relaunch { calculateRoute(query) })
            false
        }
    }

    fun clearRoute() {
        events.tryEmit(MapEvent.ClearRoute)
        store.update { it.setRoute(null) }
    }

    /** Re-downloads every loaded province and rechecks price history. */
    suspend fun refreshAll() {
        clearError()
        store.update { it.resetHistoryDepth() }
        for (code in store.value.loadedProvinces.toList()) loadProvince(code, force = true)
        settle()
    }

    /** Shows only favourites (loading their provinces if needed), or goes back to the normal list. */
    suspend fun showFavourites(on: Boolean) {
        store.update { it.setFavouritesOnly(on) }
        if (!on) return
        clearError()
        for (code in store.value.preferences.favourites.map { it.provinceCode }.filter { it.isNotEmpty() }.distinct()) {
            if (code !in store.value.loadedProvinces) loadProvince(code)
        }
        settle()
    }

    /** Uses a known origin (e.g. restored after the app was closed in the background) without asking GPS. */
    fun restoreOrigin(position: LatLng) {
        scope.launch { setOrigin(position) }
    }

    /** First location attempt when the app opens. */
    fun start() {
        if (!gps.isAvailable()) {
            show(Status.NoGeolocation)
            return
        }
        show(Status.Locating)
        scope.launch {
            val position = try {
                gps.currentPosition()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                show(Status.NoLocationYet)
                return@launch
            }
            setOrigin(position)
        }
    }
}
