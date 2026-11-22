package es.gasolineras.state

import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.LatLng
import es.gasolineras.data.geo.GeocodeResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** The flows of ui/locationController.ts, end to end over the store, effects and selector. */
class AppControllerTest {
    private val home = LatLng(40.4, -3.7)

    private class World(scope: CoroutineScope) {
        val store = Store(state())
        val miteco = FakeMiteco(
            mutableMapOf(
                "28" to listOf(station("A", prices = prices(FuelType.GASOLINA_95 to 1.52)), station("B", lat = 40.41, prices = prices(FuelType.GASOLINA_95 to 1.49))),
                "45" to listOf(station("T", provinceCode = "45", lat = 39.9, prices = prices(FuelType.GASOLINA_95 to 1.39))),
                // 11 km from home, across a (fake) province border
                "19" to listOf(station("N", provinceCode = "19", lat = 40.5, prices = prices(FuelType.GASOLINA_95 to 1.45))),
            ),
        )
        val geocoder = FakeGeocoder(
            places = mapOf(
                "Toledo" to GeocodeResult(LatLng(39.88, -3.72), "45"),
                "Puerta del Sol" to GeocodeResult(LatLng(40.4168, -3.7038), "28"),
                "Nowhere" to null,
            ),
        )
        val router = FakeRouter(listOf(LatLng(40.4, -3.7), LatLng(39.9, -3.7)))
        val gps = FakeGps()
        val effects = Effects(store, miteco, scope) { LocalDate.of(2026, 11, 21) }
        val locator = FakeLocator()
        val controller = AppController(store, effects, miteco, geocoder, router, gps, scope, locator)
        val selector = VisibleStationsSelector()
        fun visibleIds() = selector.select(store.value).rows.map { it.station.id }
    }

    private fun TestScope.world() = World(this)

    @Test fun `on start, GPS position leads to its province and the visible stations`() = runTest {
        val w = world()
        w.controller.start()
        assertEquals(Status.Locating, w.controller.state.value.status)
        advanceUntilIdle()
        assertEquals(home, w.store.value.userPosition)
        assertEquals(listOf("28"), w.store.value.loadedProvinces)
        assertEquals(Status.Ready, w.controller.state.value.status)
        assertEquals(listOf("B", "A"), w.visibleIds())
        assertEquals(HistoryStatus.Kind.DONE, w.store.value.historyStatus?.kind)
    }

    @Test fun `a restored origin loads its stations without asking GPS`() = runTest {
        val w = world()
        w.gps.position = null // GPS would fail
        w.controller.restoreOrigin(home)
        advanceUntilIdle()
        assertNull(w.controller.state.value.error)
        assertEquals(listOf("B", "A"), w.visibleIds())
    }

    @Test fun `without geolocation it says so and waits`() = runTest {
        val w = world()
        w.gps.available = false
        w.controller.start()
        assertEquals(Status.NoGeolocation, w.controller.state.value.status)
    }

    @Test fun `a refused GPS request on start is not an error, a manual one offers retry`() = runTest {
        val w = world()
        w.gps.position = null
        w.controller.start()
        advanceUntilIdle()
        assertEquals(Status.NoLocationYet, w.controller.state.value.status)
        assertNull(w.controller.state.value.error)

        w.controller.requestGps()
        advanceUntilIdle()
        val error = w.controller.state.value.error!!
        assertTrue(error.error is UserError.Gps)
        assertEquals(Status.Waiting, w.controller.state.value.status)

        w.gps.position = home
        error.retry!!()
        advanceUntilIdle()
        assertNull(w.controller.state.value.error)
        assertEquals(listOf("B", "A"), w.visibleIds())
    }

    @Test fun `the map is told to show the origin`() = runTest {
        val w = world()
        val events = mutableListOf<MapEvent>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { w.controller.mapEvents.toList(events) }
        w.controller.requestGps()
        advanceUntilIdle()
        assertEquals(listOf<MapEvent>(MapEvent.ShowUserPosition(home, 13.0)), events)
    }

    @Test fun `searching an address uses its province without reverse geocoding`() = runTest {
        val w = world()
        var reverseCalls = 0
        val controller = AppController(
            w.store, w.effects, w.miteco,
            FakeGeocoder(w.geocoder.places) { reverseCalls++; "28" },
            w.router, w.gps, this, FakeLocator(within = { _, _ -> listOf("45") }),
        )
        assertTrue(controller.searchAddress("Toledo"))
        advanceUntilIdle()
        assertEquals(0, reverseCalls)
        assertEquals(listOf("45"), w.store.value.loadedProvinces)
        assertEquals(listOf("T"), w.visibleIds())
    }

    @Test fun `an unknown address is reported and leaves the state alone`() = runTest {
        val w = world()
        assertFalse(w.controller.searchAddress("Nowhere"))
        assertEquals(UserError.AddressNotFound, w.controller.state.value.error?.error)
        assertNull(w.store.value.userPosition)
    }

    @Test fun `a province that fails to download offers retry and succeeds afterwards`() = runTest {
        val w = world()
        val saved = w.miteco.stationsByProvince.remove("28")!!
        w.controller.requestGps()
        advanceUntilIdle()
        val error = w.controller.state.value.error!!
        assertEquals("28", (error.error as UserError.Province).code)
        assertEquals(Status.Ready, w.controller.state.value.status) // there is an origin: show the summary

        w.miteco.stationsByProvince["28"] = saved
        error.retry!!()
        advanceUntilIdle()
        assertEquals(listOf("28"), w.store.value.loadedProvinces)
        assertEquals(listOf("B", "A"), w.visibleIds())
    }

    @Test fun `an unknown province offers retry`() = runTest {
        val w = world()
        val controller = AppController(w.store, w.effects, w.miteco, FakeGeocoder { null }, w.router, w.gps, this, FakeLocator(at = { null }, within = { _, _ -> emptyList() }))
        controller.requestGps()
        advanceUntilIdle()
        assertEquals(UserError.ProvinceUnknown, controller.state.value.error?.error)
        assertTrue(controller.state.value.error?.retry != null)
    }

    @Test fun `stations across a province border within the radius are included`() = runTest {
        val w = world()
        w.locator.within = { _, _ -> listOf("28", "19") }
        w.controller.requestGps()
        advanceUntilIdle()
        assertEquals(listOf("28", "19"), w.store.value.loadedProvinces)
        assertEquals(listOf("N", "B", "A"), w.visibleIds())
        assertEquals(listOf(15.0 + PROVINCE_MARGIN_KM), w.locator.withinCalls) // radius + margin
    }

    @Test fun `a neighbour that fails to download offers retry without hiding the rest`() = runTest {
        val w = world()
        w.locator.within = { _, _ -> listOf("28", "19") }
        val saved = w.miteco.stationsByProvince.remove("19")!!
        w.controller.requestGps()
        advanceUntilIdle()
        assertEquals(listOf("B", "A"), w.visibleIds())
        val error = w.controller.state.value.error!!
        assertEquals("19", (error.error as UserError.Province).code)
        w.miteco.stationsByProvince["19"] = saved
        error.retry!!()
        advanceUntilIdle()
        assertEquals(listOf("N", "B", "A"), w.visibleIds())
    }

    @Test fun `when geocoding fails the province comes from the offline outlines`() = runTest {
        val w = world()
        val controller = AppController(w.store, w.effects, w.miteco, FakeGeocoder { error("offline") }, w.router, w.gps, this, w.locator)
        controller.requestGps()
        advanceUntilIdle()
        assertNull(controller.state.value.error)
        assertEquals(listOf("28"), w.store.value.loadedProvinces)
    }

    @Test fun `a larger radius loads the provinces it now reaches`() = runTest {
        val w = world()
        w.locator.within = { _, km -> if (km > 20) listOf("28", "19") else listOf("28") }
        w.controller.requestGps()
        advanceUntilIdle()
        assertEquals(listOf("28"), w.store.value.loadedProvinces)

        w.controller.ensureCoverage() // nothing new needed
        assertEquals(listOf("28"), w.store.value.loadedProvinces)

        w.store.update { it.updatePreferences { p -> p.copy(searchRadiusKm = 30.0) } }
        w.controller.ensureCoverage()
        advanceUntilIdle()
        assertEquals(listOf("28", "19"), w.store.value.loadedProvinces)
        assertTrue("N" in w.visibleIds())
    }

    @Test fun `a route loads every province along it, using the detour as margin`() = runTest {
        val w = world()
        var detour = 0.0
        w.locator.along = { _, km -> detour = km; listOf("28", "19", "45") }
        w.controller.requestGps()
        advanceUntilIdle()
        w.controller.calculateRoute("Toledo")
        advanceUntilIdle()
        assertEquals(listOf("28", "19", "45"), w.store.value.loadedProvinces)
        assertEquals(3.0 + PROVINCE_MARGIN_KM, detour, 0.0)
    }

    @Test fun `a route needs an origin first`() = runTest {
        val w = world()
        assertFalse(w.controller.calculateRoute("Toledo"))
        assertEquals(UserError.OriginFirst, w.controller.state.value.error?.error)
    }

    @Test fun `a route loads the destination province and filters by detour`() = runTest {
        val w = world()
        w.controller.requestGps()
        advanceUntilIdle()
        assertTrue(w.controller.calculateRoute("Toledo"))
        advanceUntilIdle()
        assertEquals(listOf("28", "45"), w.store.value.loadedProvinces)
        assertEquals(w.router.result, w.store.value.route)
        // T is 55 km from home (outside the radius) but on the route
        assertEquals(listOf("T", "B", "A"), w.visibleIds())

        w.controller.clearRoute()
        assertNull(w.store.value.route)
        assertEquals(listOf("B", "A"), w.visibleIds())
    }

    @Test fun `no route found is reported`() = runTest {
        val w = world()
        w.router.result = null
        w.controller.requestGps()
        advanceUntilIdle()
        assertFalse(w.controller.calculateRoute("Puerta del Sol"))
        assertEquals(UserError.RouteNotFound, w.controller.state.value.error?.error)
        assertNull(w.store.value.route)
    }

    @Test fun `refreshAll re-downloads every loaded province and rechecks history`() = runTest {
        val w = world()
        w.controller.requestGps()
        advanceUntilIdle()
        w.miteco.calls.clear()
        w.miteco.stationsByProvince["28"] = listOf(station("A", prices = prices(FuelType.GASOLINA_95 to 1.30)))
        w.controller.refreshAll()
        advanceUntilIdle()
        assertTrue("stations:28:force" in w.miteco.calls)
        assertEquals(4, w.miteco.calls.count { it.startsWith("history") })
        assertEquals(1.30, w.store.value.stations.first { it.id == "A" }.station.prices[FuelType.GASOLINA_95]!!, 0.0)
        assertEquals(Status.Ready, w.controller.state.value.status)
    }
}
