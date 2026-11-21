package es.gasolineras

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.VisibleStations
import es.gasolineras.data.LocationPositionProvider
import es.gasolineras.data.prefs.loadPreferences
import es.gasolineras.data.prefs.savePreferences
import es.gasolineras.state.AppController
import es.gasolineras.state.AppState
import es.gasolineras.state.ControllerState
import es.gasolineras.state.Effects
import es.gasolineras.state.PreferencesPersister
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
class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val container = (application as GasolinerasApp).container

    private val store = Store(createInitialState(loadPreferences(container.preferencesStorage)))
    private val effects = Effects(store, container.miteco, viewModelScope)
    private val controller = AppController(
        store, effects, container.miteco, container.geocoder, container.router,
        LocationPositionProvider(container.location), viewModelScope,
    )
    private val persister = PreferencesPersister(store, viewModelScope, { savePreferences(container.preferencesStorage, it) }).start()
    private val selector = VisibleStationsSelector()

    val mapEvents = controller.mapEvents

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
        controller.start()
    }

    fun requestGps() = controller.requestGps()
    fun refresh() = viewModelScope.launch { controller.refreshAll() }
    fun searchAddress(query: String) = viewModelScope.launch { controller.searchAddress(query) }
    fun calculateRoute(query: String) = viewModelScope.launch { controller.calculateRoute(query) }
    fun clearRoute() = controller.clearRoute()
    fun dismissError() = controller.clearError()

    fun setFuel(fuel: FuelType) = store.update { it.setFuel(fuel) }
    fun setSortByTotalCost(on: Boolean) = store.update { it.updatePreferences { p -> p.copy(sortByTotalCost = on) } }

    /** Saves pending preference changes now (call when the app goes to the background). */
    fun flush() = persister.flush()

    override fun onCleared() {
        persister.stop()
    }

    private companion object {
        const val COVERAGE_DEBOUNCE_MS = 600L
    }
}
