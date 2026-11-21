package es.gasolineras.diagnostics

import es.gasolineras.AppContainer
import es.gasolineras.core.domain.HistoryWindowDay
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.VisibilityCriteria
import es.gasolineras.core.domain.branded
import es.gasolineras.core.domain.computeProvinceStaleness
import es.gasolineras.core.domain.daysBefore
import es.gasolineras.core.domain.requiredHistoryDays
import es.gasolineras.core.domain.selectVisibleStations
import es.gasolineras.core.domain.toMitecoDate
import es.gasolineras.data.prefs.loadPreferences
import es.gasolineras.data.prefs.savePreferences
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import java.time.LocalDate
import java.util.Locale

data class DataProbeResult(val ok: Boolean, val lines: List<String>)

/**
 * End-to-end run of the Phase 2 data layer with the real services:
 * location → province → stations (download, then cache) → history → staleness → visible stations,
 * plus forward geocoding, a route and a preferences save. Report lines are English (for developers).
 */
class DataProbe(private val c: AppContainer) {
    private val madridSol = LatLng(40.4168, -3.7038)

    suspend fun run(): DataProbeResult = coroutineScope {
        val lines = mutableListOf<String>()
        var ok = true
        suspend fun <T> step(label: String, block: suspend () -> T): T? = try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            ok = false
            lines += "$label: FAIL · ${e.javaClass.simpleName}: ${e.message}"
            null
        }
        fun ms(start: Long) = (System.nanoTime() - start) / 1_000_000

        // 1. Position
        var t = System.nanoTime()
        val fix = step("Position") { c.location.currentLocation() }
        val position = fix ?: madridSol
        lines += if (fix != null) "Position: OK · ${ms(t)} ms" else "Position: none (permission or GPS off) · using Puerta del Sol"

        // 2. Province: the phone's geocoder and Nominatim separately, then the app's fallback chain
        t = System.nanoTime()
        val phone = step("Phone geocoder") { c.phoneGeocoder.reverseProvince(position) }
        val phoneMs = ms(t)
        t = System.nanoTime()
        val osm = step("Nominatim") { c.nominatim.reverseProvince(position) }
        lines += "Province: phone geocoder → ${phone ?: "none"} (${phoneMs} ms) · Nominatim → ${osm ?: "none"} (${ms(t)} ms)"
        val province = phone ?: osm ?: run {
            lines += "Province: FAIL · no province for this position"
            return@coroutineScope DataProbeResult(false, lines)
        }

        // 3. Stations: forced download, then from the cache
        t = System.nanoTime()
        val stations = step("Stations") { c.miteco.getProvinceStations(province, force = true) }
            ?: return@coroutineScope DataProbeResult(false, lines)
        val downloadMs = ms(t)
        t = System.nanoTime()
        c.miteco.getProvinceStations(province)
        lines += "Stations: ${stations.size} in province $province · download $downloadMs ms · from cache ${ms(t)} ms"

        // 4. History and staleness (as many days as the current age filter needs)
        val prefs = loadPreferences(c.preferencesStorage)
        val today = LocalDate.now()
        val window = (1..requiredHistoryDays(prefs.ageFilter)).map { HistoryWindowDay(it, toMitecoDate(daysBefore(today, it))) }
        t = System.nanoTime()
        val history = window.map { day -> async { runCatching { c.miteco.getHistoryDay(province, day.date) }.getOrNull() } }.awaitAll()
        val staleness = computeProvinceStaleness(stations, window, history, toMitecoDate(today))
        lines += "History: ${history.count { it != null }}/${window.size} days · ${ms(t)} ms"
        if (history.all { it == null }) ok = false

        // 5. What the main screen will show
        val visible = selectVisibleStations(
            stations.map { it.branded() },
            VisibilityCriteria(
                fuel = prefs.fuel,
                brands = prefs.brands,
                ageFilter = prefs.ageFilter,
                staleness = staleness,
                userPosition = position,
                searchRadiusKm = prefs.searchRadiusKm,
                routeDetourKm = prefs.routeDetourKm,
                car = prefs.activeCar,
                discounts = prefs.discounts,
                sortByTotalCost = prefs.sortByTotalCost,
            ),
        )
        lines += "Visible: ${visible.rows.size} stations within ${prefs.searchRadiusKm.toInt()} km selling ${prefs.fuel}"
        visible.rows.take(3).forEachIndexed { i, row ->
            val age = row.staleness?.let { s -> if (s.days >= s.windowDays) "unchanged ≥${s.days} d" else "unchanged ${s.days} d" } ?: "age unknown"
            lines += String.format(
                Locale.ROOT, "  %d. %s · %.3f €/l · %.1f km · %s",
                i + 1, row.station.brand, row.finalPrice, row.distanceFromUserKm ?: 0.0, age,
            )
        }

        // 6. Forward geocoding and a route
        t = System.nanoTime()
        val sol = step("Search") { c.geocoder.search("Puerta del Sol, Madrid") }
        if (sol != null) {
            lines += "Search 'Puerta del Sol': province ${sol.provinceCode} · ${ms(t)} ms"
            t = System.nanoTime()
            val route = step("Route") { c.router.route(position, sol.latLng) }
            lines += if (route != null) "Route to Puerta del Sol: ${route.size} points · ${ms(t)} ms" else "Route: none found"
        }

        // 7. Preferences are saved
        val saved = savePreferences(c.preferencesStorage, prefs)
        lines += "Preferences: ${if (saved) "saved" else "SAVE FAILED"}"
        if (!saved) ok = false

        DataProbeResult(ok, lines)
    }
}
