package es.gasolineras.widget

import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.updateAll
import es.gasolineras.AppContainer
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.ProvinceShapes
import es.gasolineras.core.domain.StationRow
import es.gasolineras.core.domain.VisibilityCriteria
import es.gasolineras.core.domain.selectVisibleStations
import es.gasolineras.data.prefs.loadPreferences
import es.gasolineras.state.PROVINCE_MARGIN_KM
import es.gasolineras.state.addStations
import es.gasolineras.state.createInitialState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Builds the widget snapshot with the app's own rules and redraws the widgets. */
class WidgetUpdater(private val context: Context, private val container: AppContainer) {
    private val store = WidgetStore(context)

    suspend fun hasWidgets(): Boolean =
        GlanceAppWidgetManager(context).getGlanceIds(GasolinerasWidget::class.java).isNotEmpty()

    /** From the list the app is showing (most accurate: includes price ages and route). */
    suspend fun publish(rows: List<StationRow>, fuel: FuelType) {
        if (!hasWidgets()) return
        withContext(Dispatchers.IO) { store.saveSnapshot(snapshotOf(rows, fuel)) }
        GasolinerasWidget().updateAll(context)
    }

    /** In the background: today's prices around the last origin (downloaded if not cached). */
    suspend fun refresh() {
        val snapshot = withContext(Dispatchers.IO) { compute() }
        store.saveSnapshot(snapshot)
        GasolinerasWidget().updateAll(context)
    }

    private suspend fun compute(): WidgetSnapshot {
        val state = createInitialState(loadPreferences(container.preferencesStorage))
        val prefs = state.preferences
        val origin = store.readOrigin() ?: return WidgetSnapshot(WidgetSnapshot.State.NO_ORIGIN, prefs.fuel)
        val codes = ProvinceShapes.bundled.provincesWithin(origin, prefs.searchRadiusKm + PROVINCE_MARGIN_KM)
        val stations = codes.flatMap { code ->
            try {
                container.miteco.getProvinceStations(code)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emptyList()
            }
        }
        if (stations.isEmpty()) {
            // Keep showing the last good prices rather than an empty widget.
            return store.readSnapshot()?.takeIf { it.state == WidgetSnapshot.State.READY } ?: WidgetSnapshot(WidgetSnapshot.State.NO_DATA, prefs.fuel)
        }
        val loaded = state.addStations(stations)
        val visible = selectVisibleStations(
            loaded.stations,
            VisibilityCriteria(
                fuel = prefs.fuel,
                brands = loaded.preferences.brands,
                userPosition = origin,
                searchRadiusKm = prefs.searchRadiusKm,
                routeDetourKm = prefs.routeDetourKm,
                car = prefs.activeCar,
                discounts = prefs.discounts,
                sortByTotalCost = prefs.sortByTotalCost,
            ),
        )
        return snapshotOf(visible.rows, prefs.fuel)
    }

    private fun snapshotOf(rows: List<StationRow>, fuel: FuelType) = WidgetSnapshot(
        state = WidgetSnapshot.State.READY,
        fuel = fuel,
        updatedAt = System.currentTimeMillis(),
        items = rows.take(MAX_ITEMS).map { r ->
            WidgetItem(r.station.id, r.station.brand, r.finalPrice, r.routeDetourKm ?: r.distanceFromUserKm, r.color.hue)
        },
    )

    private companion object {
        const val MAX_ITEMS = 3
    }
}
