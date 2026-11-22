package es.gasolineras.widget

import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.updateAll
import es.gasolineras.AppContainer
import es.gasolineras.core.domain.BrandedStation
import es.gasolineras.core.domain.HistoryWindowDay
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.Preferences
import es.gasolineras.core.domain.ProvinceShapes
import es.gasolineras.core.domain.StalenessIndex
import es.gasolineras.core.domain.VisibilityCriteria
import es.gasolineras.core.domain.computeProvinceStaleness
import es.gasolineras.core.domain.daysBefore
import es.gasolineras.core.domain.requiredHistoryDays
import es.gasolineras.core.domain.selectVisibleStations
import es.gasolineras.core.domain.toMitecoDate
import es.gasolineras.data.prefs.loadPreferences
import es.gasolineras.state.AppState
import es.gasolineras.state.PROVINCE_MARGIN_KM
import es.gasolineras.state.addStations
import es.gasolineras.state.createInitialState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate

/**
 * Builds the widget snapshot and redraws the widgets.
 *
 * The widget always shows the cheapest price per litre (after discounts) near the origin, with
 * the user's fuel, brand and price-age filters. It ignores routes and "sort by total cost": it
 * answers "where is it cheapest near me?".
 */
class WidgetUpdater(private val context: Context, private val container: AppContainer) {
    private val store = WidgetStore(context)

    suspend fun hasWidgets(): Boolean {
        val manager = GlanceAppWidgetManager(context)
        return manager.getGlanceIds(GasolinerasWidget::class.java).isNotEmpty() ||
            manager.getGlanceIds(GasolinerasListWidget::class.java).isNotEmpty()
    }

    /** From the app's state (its loaded stations and price ages). */
    suspend fun publish(state: AppState) {
        val origin = state.userPosition ?: return
        if (!hasWidgets()) return
        val snapshot = withContext(Dispatchers.Default) { snapshotOf(state.stations, state.staleness, state.preferences, origin) }
        withContext(Dispatchers.IO) { store.saveSnapshot(snapshot) }
        redraw()
    }

    /** In the background: today's prices around the last origin (downloaded if not cached). */
    suspend fun refresh() {
        val snapshot = withContext(Dispatchers.IO) { compute() }
        store.saveSnapshot(snapshot)
        redraw()
    }

    private suspend fun redraw() {
        GasolinerasWidget().updateAll(context)
        GasolinerasListWidget().updateAll(context)
    }

    private suspend fun compute(): WidgetSnapshot {
        val state = createInitialState(loadPreferences(container.preferencesStorage))
        val prefs = state.preferences
        val origin = store.readOrigin() ?: return WidgetSnapshot(WidgetSnapshot.State.NO_ORIGIN, prefs.fuel, carName = carLabel(prefs))
        val codes = ProvinceShapes.bundled.provincesWithin(origin, prefs.searchRadiusKm + PROVINCE_MARGIN_KM)
        val byProvince = codes.associateWith { code -> attempt { container.miteco.getProvinceStations(code) }.orEmpty() }
        if (byProvince.values.all { it.isEmpty() }) {
            // Keep showing the last good prices rather than an empty widget.
            return store.readSnapshot()?.takeIf { it.state == WidgetSnapshot.State.READY }
                ?: WidgetSnapshot(WidgetSnapshot.State.NO_DATA, prefs.fuel, carName = carLabel(prefs))
        }
        // Price ages for the age filter, from the (usually cached) history days.
        val today = LocalDate.now()
        val window = (1..requiredHistoryDays(prefs.ageFilter)).map { HistoryWindowDay(it, toMitecoDate(daysBefore(today, it))) }
        val staleness = mutableMapOf<String, Map<es.gasolineras.core.domain.FuelType, es.gasolineras.core.domain.PriceStaleness>>()
        if (prefs.ageFilter != es.gasolineras.core.domain.AgeFilter.All) {
            byProvince.forEach { (code, stations) ->
                if (stations.isEmpty()) return@forEach
                val history = window.map { day -> attempt { container.miteco.getHistoryDay(code, day.date) } }
                staleness += computeProvinceStaleness(stations, window, history, toMitecoDate(today))
            }
        }
        val loaded = state.addStations(byProvince.values.flatten())
        return snapshotOf(loaded.stations, staleness, loaded.preferences, origin)
    }

    private fun snapshotOf(stations: List<BrandedStation>, staleness: StalenessIndex, prefs: Preferences, origin: LatLng): WidgetSnapshot {
        val rows = selectVisibleStations(
            stations,
            VisibilityCriteria(
                fuel = prefs.fuel,
                brands = prefs.brands,
                ageFilter = prefs.ageFilter,
                staleness = staleness,
                userPosition = origin,
                route = null,
                searchRadiusKm = prefs.searchRadiusKm,
                routeDetourKm = prefs.routeDetourKm,
                discounts = prefs.discounts,
                sortByTotalCost = false,
            ),
        ).rows
        return WidgetSnapshot(
            state = WidgetSnapshot.State.READY,
            fuel = prefs.fuel,
            updatedAt = System.currentTimeMillis(),
            carName = carLabel(prefs),
            items = rows.take(MAX_ITEMS).map { r -> WidgetItem(r.station.id, r.station.brand, r.finalPrice, r.distanceFromUserKm, r.color.hue) },
        )
    }

    /** The active car's name when there is more than one car to choose from. */
    private fun carLabel(prefs: Preferences): String? = prefs.activeCar?.name?.takeIf { prefs.cars.size > 1 }

    private suspend fun <T> attempt(block: suspend () -> T): T? = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    private companion object {
        const val MAX_ITEMS = 3
    }
}
