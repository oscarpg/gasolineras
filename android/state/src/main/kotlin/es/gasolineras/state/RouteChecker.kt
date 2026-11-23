package es.gasolineras.state

import es.gasolineras.core.domain.BrandedStation
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.RouteChecks
import es.gasolineras.core.domain.routeCheckCandidates
import es.gasolineras.core.domain.routeProbes
import es.gasolineras.data.geo.Router
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Checks by road the stations near the route while "only stations on the route" is on (see
 * RouteCheck.kt). Runs again when more stations arrive (provinces along the route load one by one);
 * each station is checked once per route. If the router fails, those stations keep the
 * straight-line rule (their check is stored as null). Port of src/state/routeChecks.ts.
 */
class RouteChecker(
    private val store: Store<AppState>,
    private val router: Router,
    private val scope: CoroutineScope,
    private val log: (String, Throwable) -> Unit = { _, _ -> },
) {
    private var route: List<LatLng>? = null
    private val inFlight = mutableSetOf<String>()
    private var lastStations: List<BrandedStation>? = null
    private var lastRoute: List<LatLng>? = null
    private var lastChecks: RouteChecks? = null

    /** Watches the store until [scope] ends. */
    fun start(): Job = scope.launch { store.state.collect { check(it) } }

    /** Starts the checks the state needs, if any (also called directly by tests). */
    @Synchronized
    fun check(s: AppState) {
        val current = s.route ?: return
        if (!s.preferences.routeOnly || s.favouritesOnly) return
        if (current !== route) {
            route = current
            inFlight.clear()
        }
        if (lastStations === s.stations && lastRoute === current && lastChecks === s.routeChecks) return
        lastStations = s.stations
        lastRoute = current
        lastChecks = s.routeChecks

        val candidates = routeCheckCandidates(s.stations, current, s.routeChecks).filter { it.id !in inFlight }
        if (candidates.isEmpty()) return
        inFlight += candidates.map { it.id }

        scope.launch {
            val values: List<Double?> = try {
                router.extraDistances(routeProbes(current, candidates))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                log("Route check failed; using the distance to the route line", e)
                candidates.map { null }
            }
            synchronized(this@RouteChecker) { inFlight -= candidates.map { it.id }.toSet() }
            store.update { it.addRouteChecks(current, candidates.mapIndexed { i, c -> c.id to values.getOrNull(i) }.toMap()) }
        }
    }
}
