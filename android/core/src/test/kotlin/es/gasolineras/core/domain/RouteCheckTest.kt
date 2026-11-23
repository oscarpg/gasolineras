package es.gasolineras.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.cos

/** Port of tests/domain/routeCheck.test.ts (the real-route part is in :data, which has the fixtures). */
class RouteCheckTest {
    /** A point [km] north of 42°N, 8°W. */
    private fun north(km: Double) = LatLng(42 + km / 111.32, -8.0)
    private fun east(km: Double) = km / (111.32 * cos(Math.toRadians(42.0)))
    private val straight = listOf(north(0.0), north(5.0), north(10.0))

    @Test fun `not checked or failed - the straight-line rule`() {
        assertTrue(isOnRoute(0.1, checked = false, extraKm = null, fallbackKm = ROUTE_ONLY_MAX_KM))
        assertFalse(isOnRoute(0.2, checked = false, extraKm = null, fallbackKm = ROUTE_ONLY_MAX_KM))
        assertTrue(isOnRoute(0.1, checked = true, extraKm = null, fallbackKm = ROUTE_ONLY_MAX_KM))
    }

    @Test fun `checked - near the line and at most 1 km of extra driving`() {
        assertTrue(isOnRoute(0.05, true, 0.3, ROUTE_ONLY_MAX_KM))
        assertTrue(isOnRoute(0.25, true, 1.0, ROUTE_ONLY_MAX_KM)) // farther than 150 m, but reachable
        assertFalse(isOnRoute(0.05, true, 2.6, ROUTE_ONLY_MAX_KM)) // street below the motorway
        assertFalse(isOnRoute(0.05, true, Double.POSITIVE_INFINITY, ROUTE_ONLY_MAX_KM))
        assertFalse(isOnRoute(ROUTE_CHECK_CANDIDATE_KM + 0.01, true, 0.0, ROUTE_ONLY_MAX_KM))
    }

    @Test fun `probes are the route points 2 km before and after the station`() {
        val p = routeProbes(straight, listOf(RouteCandidate("a", LatLng(north(6.0).lat, -7.999)))).single()
        assertEquals("a", p.id)
        assertTrue(distanceKm(p.before, north(4.0)) < 0.01)
        assertTrue(distanceKm(p.after, north(8.0)) < 0.01)
    }

    @Test fun `probes stop at the ends of the route`() {
        val (start, end) = routeProbes(straight, listOf(RouteCandidate("s", north(0.5)), RouteCandidate("e", north(9.5))))
        assertTrue(distanceKm(start.before, north(0.0)) < 0.01)
        assertTrue(distanceKm(start.after, north(2.5)) < 0.01)
        assertTrue(distanceKm(end.after, north(10.0)) < 0.01)
        assertEquals(emptyList<RouteProbe>(), routeProbes(emptyList(), listOf(RouteCandidate("x", north(1.0)))))
    }

    @Test fun `candidates are unchecked stations within 300 m of the route`() {
        fun at(id: String, eastKm: Double) = branded(id, lat = north(3.0).lat, lon = -8 + east(eastKm))
        val stations = listOf(at("near", 0.1), at("edge", 0.29), at("far", 0.4), at("done", 0.1))
        assertEquals(listOf("near", "edge"), routeCheckCandidates(stations, straight, mapOf("done" to 0.2)).map { it.id })
    }

    @Test fun `the filter uses the checks with only on the route`() {
        val route = listOf(north(0.0), north(20.0))
        val stations = listOf(
            branded("reachable", lat = north(5.0).lat, lon = -8 + east(0.25)), // 250 m: out by distance alone
            branded("below", lat = north(10.0).lat, lon = -8 + east(0.05)), // 50 m, but needs an exit
            branded("unchecked", lat = north(15.0).lat, lon = -8 + east(0.1)),
        )
        val c = VisibilityCriteria(
            fuel = FuelType.GASOLINA_95, userPosition = north(0.0), route = route, searchRadiusKm = 15.0,
            routeDetourKm = 3.0, routeOnly = true, routeChecks = mapOf("reachable" to 0.3, "below" to 2.6),
        )
        assertEquals(setOf("reachable", "unchecked"), selectVisibleStations(stations, c).rows.map { it.station.id }.toSet())
        // Without the checks: the straight-line rule.
        assertEquals(setOf("below", "unchecked"), selectVisibleStations(stations, c.copy(routeChecks = emptyMap())).rows.map { it.station.id }.toSet())
        // The detour slider (not "only on the route") ignores the checks.
        assertEquals(3, selectVisibleStations(stations, c.copy(routeOnly = false)).rows.size)
    }
}
