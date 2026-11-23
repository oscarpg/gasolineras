package es.gasolineras.state

import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.Preferences
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test
import kotlin.math.cos

/** Port of tests/state/routeChecks.test.ts, plus the route-check transitions. */
class RouteCheckerTest {
    /** A point [km] north of 42°N, 8°W, and the longitude 100 m east of 8°W. */
    private fun north(km: Double) = LatLng(42 + km / 111.32, -8.0)
    private val besideLon = -8 + 0.1 / (111.32 * cos(Math.toRadians(42.0)))
    private val route = listOf(north(0.0), north(20.0))

    private class World(scope: TestScope, router: FakeRouter = FakeRouter()) {
        val router = router
        val store = Store(state(Preferences.DEFAULT.copy(routeOnly = true)))
        val checker = RouteChecker(store, router, scope)
    }

    private fun World.addNear(id: String, km: Double) =
        store.update { it.addStations(listOf(station(id, lat = 42 + km / 111.32, lon = besideLon))) }

    @Test fun `a new route forgets the checks, and checks for an old route are ignored`() {
        val r1 = listOf(north(0.0), north(1.0))
        val r2 = listOf(north(2.0), north(3.0))
        val s = state().setRoute(r1).addRouteChecks(r1, mapOf("a" to 0.2, "b" to null))
        assertEquals(mapOf("a" to 0.2, "b" to null), s.routeChecks)
        val moved = s.setRoute(r2)
        assertEquals(emptyMap<String, Double?>(), moved.routeChecks)
        assertSame(moved, moved.addRouteChecks(r1, mapOf("a" to 0.1)))
    }

    @Test fun `checks the stations near a new route once, and stores the results`() = runTest(UnconfinedTestDispatcher()) {
        val w = World(this, FakeRouter(extra = { if (it == "a") 0.4 else 9.0 }))
        val job = w.checker.start()
        w.addNear("a", 5.0)
        w.store.update { it.addStations(listOf(station("far", lat = north(5.0).lat, lon = -7.9))) }
        w.store.update { it.setRoute(route) }
        assertEquals(listOf(listOf("a")), w.router.checked) // "far" is 8 km away
        assertEquals(mapOf("a" to 0.4), w.store.value.routeChecks)
        w.store.update { it.updatePreferences { p -> p.copy(searchRadiusKm = 20.0) } } // nothing new
        assertEquals(1, w.router.checked.size)
        job.cancel()
    }

    @Test fun `checks stations that arrive later, and again for a new route`() = runTest(UnconfinedTestDispatcher()) {
        val w = World(this)
        val job = w.checker.start()
        w.addNear("a", 5.0)
        w.store.update { it.setRoute(route) }
        w.addNear("b", 15.0)
        assertEquals(listOf(listOf("a"), listOf("b")), w.router.checked)
        w.store.update { it.setRoute(listOf(north(1.0), north(19.0))) }
        assertEquals(listOf("a", "b"), w.router.checked.last().sorted())
        job.cancel()
    }

    @Test fun `does nothing until only on the route is on`() = runTest(UnconfinedTestDispatcher()) {
        val w = World(this)
        w.store.update { it.updatePreferences { p -> p.copy(routeOnly = false) } }
        val job = w.checker.start()
        w.addNear("a", 5.0)
        w.store.update { it.setRoute(route) }
        assertEquals(emptyList<List<String>>(), w.router.checked)
        w.store.update { it.updatePreferences { p -> p.copy(routeOnly = true) } }
        assertEquals(listOf(listOf("a")), w.router.checked)
        job.cancel()
    }

    @Test fun `when the router fails, stores null and does not retry`() = runTest(UnconfinedTestDispatcher()) {
        val w = World(this, FakeRouter(failChecks = true))
        val job = w.checker.start()
        w.addNear("a", 5.0)
        w.store.update { it.setRoute(route) }
        assertEquals(mapOf<String, Double?>("a" to null), w.store.value.routeChecks)
        w.store.update { it.updatePreferences { p -> p.copy(searchRadiusKm = 20.0) } }
        assertEquals(1, w.router.checked.size)
        job.cancel()
    }
}
