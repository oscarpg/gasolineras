package es.gasolineras

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import es.gasolineras.core.domain.AgeFilterOption
import es.gasolineras.core.domain.AppLocale
import es.gasolineras.core.domain.Discount
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.Preferences
import es.gasolineras.core.domain.MAX_ROUTE_DETOUR_KM
import es.gasolineras.core.domain.MAX_SEARCH_RADIUS_KM
import es.gasolineras.core.domain.MIN_ROUTE_DETOUR_KM
import es.gasolineras.core.domain.MIN_SEARCH_RADIUS_KM
import es.gasolineras.state.CarInput
import es.gasolineras.state.deleteCar
import es.gasolineras.state.removeDiscount
import es.gasolineras.state.saveCar
import es.gasolineras.state.selectCar
import es.gasolineras.state.setAllBrands
import es.gasolineras.state.setBrandSelected
import es.gasolineras.state.setCustomAgeDays
import es.gasolineras.state.setDiscount
import es.gasolineras.state.updateCar
import es.gasolineras.state.Status
import es.gasolineras.state.toggleFavourite
import es.gasolineras.widget.WidgetStore
import es.gasolineras.widget.WidgetUpdater
import java.util.UUID
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.Station
import es.gasolineras.core.domain.daysBefore
import es.gasolineras.core.domain.toMitecoDate
import es.gasolineras.map.api.CameraTarget
import es.gasolineras.map.api.GeoPoint
import es.gasolineras.state.MapEvent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.LocalDate
import kotlin.math.ln
import es.gasolineras.core.domain.VisibleStations
import es.gasolineras.data.LocationPositionProvider
import es.gasolineras.data.prefs.loadPreferences
import es.gasolineras.data.prefs.savePreferences
import es.gasolineras.state.AppController
import es.gasolineras.state.AppState
import es.gasolineras.state.ControllerState
import es.gasolineras.state.Effects
import es.gasolineras.state.PreferencesPersister
import es.gasolineras.state.RouteChecker
import es.gasolineras.state.Store
import es.gasolineras.state.VisibleStationsSelector
import es.gasolineras.state.createInitialState
import es.gasolineras.state.setFuel
import es.gasolineras.state.updatePreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Everything the main screens render from. */
data class MainUiState(val app: AppState, val visible: VisibleStations, val controller: ControllerState)

/**
 * Wires the :state module to the app: store, effects, the location/route controller and
 * preference saving. Screens read [ui] and call the actions below.
 */
class MainViewModel(application: Application, private val saved: SavedStateHandle) : AndroidViewModel(application) {
    private val container = (application as GasolinerasApp).container

    private val store = Store(createInitialState(loadPreferences(container.preferencesStorage)))
    private val effects = Effects(store, container.miteco, viewModelScope)
    private val controller = AppController(
        store, effects, container.miteco, container.geocoder, container.router,
        LocationPositionProvider(container.location), viewModelScope,
    )
    private val persister = PreferencesPersister(store, viewModelScope, { savePreferences(container.preferencesStorage, it) }).start()

    /** "Only stations on the route": checks the stations near the route by road (RouteChecker). */
    private val routeChecker = RouteChecker(store, container.router, viewModelScope) { message, error ->
        android.util.Log.w("Gasolineras", message, error)
    }.start()
    private val selector = VisibleStationsSelector()
    private val widgetStore = WidgetStore(application)
    private val widgetUpdater = WidgetUpdater(application, container)

    @Volatile private var pendingStationId: String? = null

    /** Set by user actions that change the list; the map then zooms to show the origin and the cheapest stations. */
    @Volatile private var fitPending = false

    /** Opens a station's details as soon as it is in the list (e.g. tapped on the widget). */
    fun openStationWhenAvailable(id: String) {
        pendingStationId = id
        if (ui.value.visible.rows.any { it.station.id == id }) {
            pendingStationId = null
            selectStation(id)
        }
    }

    val mapEvents = controller.mapEvents

    /** False while the device has no internet connection (the list then shows cached prices). */
    val online: StateFlow<Boolean> = container.connectivity.online
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), container.connectivity.isOnline())

    /** Where the map should be. Changed by location/route events and by selecting a station. */
    private val mutableCamera = MutableStateFlow(SPAIN)
    val camera: StateFlow<CameraTarget> = mutableCamera.asStateFlow()

    /** The station whose details are open, by id. */
    private val mutableSelected = MutableStateFlow<String?>(null)
    val selectedStationId: StateFlow<String?> = mutableSelected.asStateFlow()

    /** Whether the selected station's details are showing (it stays highlighted on the map when not). */
    private val mutableDetailOpen = MutableStateFlow(false)
    val detailOpen: StateFlow<Boolean> = mutableDetailOpen.asStateFlow()

    val ui: StateFlow<MainUiState> = combine(store.state, controller.state) { app, controllerState ->
        MainUiState(app, selector.select(app), controllerState)
    }
        .flowOn(Dispatchers.Default) // filtering hundreds of stations against a route is CPU work
        .stateIn(
            viewModelScope,
            SharingStarted.Eagerly,
            MainUiState(store.value, selector.select(store.value), controller.state.value),
        )

    init {
        viewModelScope.launch {
            store.state.map { it.userPosition }.distinctUntilChanged().collect { p ->
                saved[KEY_ORIGIN_LAT] = p?.lat
                saved[KEY_ORIGIN_LON] = p?.lon
                if (p != null) withContext(Dispatchers.IO) { widgetStore.saveOrigin(p) } // the widget's origin
            }
        }
        viewModelScope.launch {
            // Keep the home-screen widget in step with the list being shown.
            store.state
                .distinctUntilChanged { a, b ->
                    a.stations === b.stations && a.staleness === b.staleness && a.preferences === b.preferences && a.userPosition == b.userPosition
                }
                .collectLatest { app ->
                    if (app.stations.isEmpty() || app.userPosition == null) return@collectLatest
                    delay(WIDGET_DEBOUNCE_MS)
                    runCatching { widgetUpdater.publish(app) }
                }
        }
        viewModelScope.launch {
            // After a new origin or a filter change, show the origin and the 3 cheapest stations.
            ui.collect { state ->
                if (!fitPending || state.controller.status != Status.Ready) return@collect
                val rows = state.visible.rows
                val origin = state.app.userPosition
                if (rows.isEmpty() || state.app.route != null || origin == null) {
                    if (state.app.loadedProvinces.isNotEmpty()) fitPending = false
                    return@collect
                }
                fitPending = false
                val points = (if (state.app.favouritesOnly) emptyList() else listOf(origin)) + rows.take(FIT_STATIONS).map { it.station.station.position }
                mutableCamera.value = fitCamera(points)
            }
        }
        viewModelScope.launch {
            // A station tapped on the widget opens once its province is loaded.
            ui.collect { state ->
                val id = pendingStationId ?: return@collect
                if (state.visible.rows.any { it.station.id == id }) {
                    pendingStationId = null
                    selectStation(id)
                }
            }
        }
        viewModelScope.launch {
            controller.mapEvents.collect { event ->
                when (event) {
                    is MapEvent.ShowUserPosition -> {
                        mutableCamera.value = CameraTarget(event.position.toGeo(), event.zoom)
                        fitPending = true
                    }
                    is MapEvent.ShowRoute -> mutableCamera.value = fitCamera(event.points)
                    MapEvent.ClearRoute -> store.value.userPosition?.let { mutableCamera.value = CameraTarget(it.toGeo(), 13.0) }
                }
            }
        }
        // A larger radius or detour can reach provinces that aren't loaded yet.
        viewModelScope.launch {
            store.state
                .map { Triple(it.preferences.searchRadiusKm, it.preferences.routeDetourKm, it.preferences.routeOnly) }
                .distinctUntilChanged()
                .drop(1)
                .collectLatest {
                    delay(COVERAGE_DEBOUNCE_MS) // sliders change many times a second
                    controller.ensureCoverage()
                }
        }
    }

    private var started = false

    /** First location attempt (once per ViewModel, e.g. after the permission prompt). */
    fun start() {
        if (started) return
        started = true
        // After Android closed the app in the background, go back to the origin the user had.
        val lat = saved.get<Double>(KEY_ORIGIN_LAT)
        val lon = saved.get<Double>(KEY_ORIGIN_LON)
        if (lat != null && lon != null) controller.restoreOrigin(LatLng(lat, lon)) else controller.start()
    }

    fun requestGps() = controller.requestGps()
    fun refresh() = viewModelScope.launch { controller.refreshAll() }
    fun searchAddress(query: String) = viewModelScope.launch { controller.searchAddress(query) }
    fun calculateRoute(query: String) = viewModelScope.launch { controller.calculateRoute(query) }
    fun clearRoute() = controller.clearRoute()
    fun dismissError() = controller.clearError()

    fun setFuel(fuel: FuelType) = userChange { it.setFuel(fuel) }
    fun setSortByTotalCost(on: Boolean) = store.update { it.updatePreferences { p -> p.copy(sortByTotalCost = on) } }

    enum class SortOrder { PRICE, DISTANCE, TOTAL_COST }

    fun setSortOrder(order: SortOrder) = store.update {
        it.updatePreferences { p ->
            p.copy(sortByDistance = order == SortOrder.DISTANCE, sortByTotalCost = order == SortOrder.TOTAL_COST)
        }
    }

    /* ---------- settings ---------- */

    fun setAgeFilterOption(option: AgeFilterOption) {
        userChange { it.updatePreferences { p -> p.copy(ageFilterOption = option) } }
        viewModelScope.launch { effects.ensureHistoryForFilter() }
    }

    fun setCustomAgeDays(days: Int) {
        userChange { it.setCustomAgeDays(days) }
        viewModelScope.launch { effects.ensureHistoryForFilter() }
    }

    fun setSearchRadius(km: Double) = userChange { it.updatePreferences { p -> p.copy(searchRadiusKm = km.coerceIn(MIN_SEARCH_RADIUS_KM, MAX_SEARCH_RADIUS_KM)) } }
    fun setRouteDetour(km: Double) = store.update { it.updatePreferences { p -> p.copy(routeDetourKm = km.coerceIn(MIN_ROUTE_DETOUR_KM, MAX_ROUTE_DETOUR_KM)) } }
    fun setRouteOnly(on: Boolean) = store.update { it.updatePreferences { p -> p.copy(routeOnly = on) } }

    fun selectCar(id: String) = userChange { it.selectCar(id) }

    private fun userChange(change: (AppState) -> AppState) {
        fitPending = true
        store.update(change)
    }

    /* ---------- favourites and empty results ---------- */

    fun toggleFavourite(id: String) {
        val station = store.value.stations.firstOrNull { it.id == id } ?: return
        store.update { it.toggleFavourite(station) }
    }

    fun setFavouritesOnly(on: Boolean) {
        fitPending = true
        viewModelScope.launch { controller.showFavourites(on) }
    }

    /** "Nothing matches": 10 km more. */
    fun widenSearch() = setSearchRadius(store.value.preferences.searchRadiusKm + WIDEN_STEP_KM)

    /** Filters back to their defaults (distance, detour, route only, price age, brands). */
    fun resetFilters() = userChange { s ->
        s.updatePreferences {
            it.copy(
                searchRadiusKm = Preferences.DEFAULT.searchRadiusKm,
                routeDetourKm = Preferences.DEFAULT.routeDetourKm,
                routeOnly = false,
                ageFilterOption = AgeFilterOption.ALL,
                brands = emptySet(),
            )
        }
    }

    /** "Nothing matches": no price-age or brand filter. */
    fun clearFilters() = userChange { s -> s.updatePreferences { it.copy(ageFilterOption = AgeFilterOption.ALL, brands = emptySet()) } }

    /** No active car: prices per litre only, any fuel. */
    fun clearCar() = userChange { it.updatePreferences { p -> p.copy(activeCarId = null) } }
    fun addCar(input: CarInput) = store.update { it.saveCar(input, newId = "car_" + UUID.randomUUID().toString().take(8)) }
    fun updateCar(id: String, input: CarInput) = store.update { it.updateCar(id, input) }
    fun deleteCar(id: String) = store.update { it.deleteCar(id) }

    fun setAllBrands(all: Boolean, present: List<String>) = userChange { it.setAllBrands(all, present) }
    fun setBrandSelected(brand: String, selected: Boolean) = userChange { it.setBrandSelected(brand, selected) }

    /** No brand ticked: no brand filter (all shown) until the user ticks some. */
    fun clearBrands() = userChange { it.setAllBrands(true, emptyList()) }

    fun setDiscount(brand: String, discount: Discount) = store.update { it.setDiscount(brand, discount) }
    fun removeDiscount(brand: String) = store.update { it.removeDiscount(brand) }

    /** Saves the language right away (the activity is recreated to apply it). */
    fun setLocale(locale: AppLocale?) {
        store.update { it.updatePreferences { p -> p.copy(locale = locale) } }
        persister.flush()
    }

    fun selectStation(id: String?, moveCamera: Boolean = true) {
        mutableSelected.value = id
        mutableDetailOpen.value = id != null
        if (id == null || !moveCamera) return
        centreOn(id, maxOf(14.0, mutableCamera.value.zoom))
    }

    /** Closes the details and zooms the map in on the selected station, which stays highlighted. */
    fun showSelectedOnMap() {
        val id = mutableSelected.value ?: return
        mutableDetailOpen.value = false
        centreOn(id, SHOW_ON_MAP_ZOOM)
    }

    private fun centreOn(id: String, zoom: Double) {
        store.value.stations.firstOrNull { it.id == id }?.let { s ->
            mutableCamera.value = CameraTarget(GeoPoint(s.station.lat, s.station.lon), zoom)
        }
    }

    /**
     * The station's price for [fuel] over the last 6 days plus today (oldest first);
     * a null price means that day's data is missing. Past days come from the daily cache when possible.
     */
    suspend fun priceHistory(station: Station, fuel: FuelType): List<PriceDay> = withContext(Dispatchers.Default) {
        val today = LocalDate.now()
        val past = (6 downTo 1).map { n ->
            val date = daysBefore(today, n)
            async {
                val prices = try {
                    container.miteco.getHistoryDay(station.provinceCode, toMitecoDate(date))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    null
                }
                PriceDay(date, prices?.get(station.code)?.get(fuel))
            }
        }.awaitAll()
        past + PriceDay(today, station.prices[fuel])
    }

    /** Saves pending preference changes now and refreshes the widget (call when the app goes to the background). */
    fun flush() {
        persister.flush()
        viewModelScope.launch { runCatching { widgetUpdater.publish(store.value) } }
    }

    override fun onCleared() {
        persister.stop()
    }

    private companion object {
        const val COVERAGE_DEBOUNCE_MS = 600L
        const val SHOW_ON_MAP_ZOOM = 16.0
        const val WIDGET_DEBOUNCE_MS = 2_000L
        const val FIT_STATIONS = 3
        const val WIDEN_STEP_KM = 10.0
        const val KEY_ORIGIN_LAT = "origin_lat"
        const val KEY_ORIGIN_LON = "origin_lon"
        val SPAIN = CameraTarget(GeoPoint(40.2, -3.7), 5.2)
    }
}

/** One day of a station's price history. */
data class PriceDay(val date: LocalDate, val price: Double?)

fun LatLng.toGeo() = GeoPoint(lat, lon)

/** A camera that shows all [points] (approximate, good enough for a route overview). */
fun fitCamera(points: List<LatLng>): CameraTarget {
    if (points.isEmpty()) return CameraTarget(GeoPoint(40.2, -3.7), 5.2)
    val minLat = points.minOf { it.lat }
    val maxLat = points.maxOf { it.lat }
    val minLon = points.minOf { it.lon }
    val maxLon = points.maxOf { it.lon }
    val latSpan = maxOf(maxLat - minLat, 0.005)
    val lonSpan = maxOf(maxLon - minLon, 0.005)
    val zoom = minOf(ln(360.0 / lonSpan) / ln(2.0), ln(170.0 / latSpan) / ln(2.0)) - 1.0
    return CameraTarget(GeoPoint((minLat + maxLat) / 2, (minLon + maxLon) / 2), zoom.coerceIn(3.0, 15.0))
}
