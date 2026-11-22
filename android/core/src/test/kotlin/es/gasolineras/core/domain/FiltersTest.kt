package es.gasolineras.core.domain

import es.gasolineras.core.domain.FuelType.GASOLEO_A
import es.gasolineras.core.domain.FuelType.GASOLINA_95
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.cos

class FiltersTest {
    private val home = LatLng(40.4, -3.7)

    /** Latitude `km` kilometres north of HOME. */
    private fun north(km: Double) = 40.4 + km / 111.32

    private fun lonOffset(lat: Double, km: Double) = -3.7 + km / (111.32 * cos(Math.toRadians(lat)))

    private fun criteria(
        fuel: FuelType = GASOLINA_95,
        brands: Set<String> = emptySet(),
        ageFilter: AgeFilter = AgeFilter.All,
        staleness: StalenessIndex = emptyMap(),
        userPosition: LatLng? = home,
        route: List<LatLng>? = null,
        searchRadiusKm: Double = 15.0,
        routeDetourKm: Double = 3.0,
        routeOnly: Boolean = false,
        car: CarSpecs? = null,
        discounts: Map<String, Discount> = emptyMap(),
        sortByTotalCost: Boolean = false,
        onlyIds: Set<String>? = null,
    ) = VisibilityCriteria(fuel, brands, ageFilter, staleness, userPosition, route, searchRadiusKm, routeDetourKm, routeOnly, car, discounts, sortByTotalCost, onlyIds)

    private fun ids(r: VisibleStations) = r.rows.map { it.station.id }

    private val stations = listOf(
        branded("a", lat = north(1.0), prices = prices(GASOLINA_95 to 1.52)),
        branded("b", lat = north(5.0), brand = "CEPSA", prices = prices(GASOLINA_95 to 1.5, GASOLEO_A to 1.4)),
        branded("c", lat = north(20.0), prices = prices(GASOLINA_95 to 1.4)),
        branded("d", lat = north(2.0), prices = prices(GASOLEO_A to 1.3)),
    )

    @Test fun `shows nothing until there is a position`() {
        assertEquals(emptyList<String>(), ids(selectVisibleStations(stations, criteria(userPosition = null))))
    }

    @Test fun `keeps stations within the radius that sell the fuel`() {
        assertEquals(listOf("b", "a"), ids(selectVisibleStations(stations, criteria())))
        assertEquals(listOf("c", "b", "a"), ids(selectVisibleStations(stations, criteria(searchRadiusKm = 30.0))))
        assertEquals(listOf("d", "b"), ids(selectVisibleStations(stations, criteria(fuel = GASOLEO_A))))
    }

    @Test fun `applies the brand filter (empty = all)`() {
        assertEquals(listOf("b"), ids(selectVisibleStations(stations, criteria(brands = setOf("CEPSA")))))
    }

    @Test fun `applies the age filter, letting unknown staleness through`() {
        val staleness = mapOf(
            "a" to mapOf(GASOLINA_95 to PriceStaleness(5, "x", 6)),
            "b" to mapOf(GASOLINA_95 to PriceStaleness(0, "y", 6)),
        )
        val r = selectVisibleStations(stations, criteria(staleness = staleness, ageFilter = AgeFilter.MoreThan(3), searchRadiusKm = 30.0))
        assertEquals(listOf("c", "a"), ids(r)) // c has no staleness yet
        assertEquals(PriceStaleness(5, "x", 6), r.rows[1].staleness)
    }

    @Test fun `with a route, filters by detour from the route instead of distance from the user`() {
        val route = listOf(home, LatLng(40.4 + 30 / 111.32, -3.7)) // 30 km due north
        val off = branded("off", lat = 40.5, lon = lonOffset(40.5, 2.0), prices = prices(GASOLINA_95 to 1.3))
        val r = selectVisibleStations(stations + off, criteria(route = route, routeDetourKm = 1.0))
        assertEquals(listOf("c", "b", "a"), ids(r)) // c is 20 km away but on the route; "off" is 2 km off it
        assertEquals(0.0, r.rows[0].routeDetourKm!!, 1e-6)
        assertEquals(listOf("off", "c", "b", "a"), ids(selectVisibleStations(stations + off, criteria(route = route, routeDetourKm = 3.0))))
    }

    @Test fun `only on the route means within 150 m of the line`() {
        assertEquals(0.15, ROUTE_ONLY_MAX_KM, 0.0)
        val route = listOf(home, LatLng(40.6, -3.7))
        val near = branded("near", lat = 40.45, lon = lonOffset(40.45, 0.1))
        val far = branded("far", lat = 40.45, lon = lonOffset(40.45, 0.2))
        assertEquals(listOf("near"), ids(selectVisibleStations(listOf(near, far), criteria(route = route, routeOnly = true))))
    }

    @Test fun `applies brand discounts before sorting`() {
        val s = listOf(
            branded("a", lat = north(1.0), prices = prices(GASOLINA_95 to 1.5)),
            branded("b", lat = north(1.0), brand = "CEPSA", prices = prices(GASOLINA_95 to 1.52)),
        )
        val r = selectVisibleStations(s, criteria(discounts = mapOf("CEPSA" to Discount(DiscountType.CTS, 5.0))))
        assertEquals(listOf("b", "a"), ids(r))
        assertEquals(1.47, r.rows[0].finalPrice, 0.0)
        assertEquals(1.52, r.rows[0].basePrice, 0.0)
        assertEquals(Discount(DiscountType.CTS, 5.0), r.rows[0].discount)
        assertNull(r.rows[1].discount)
    }

    @Test fun `sorts by total cost only when a car is selected and the option is on`() {
        val car = SimpleCarSpecs(tankLitres = 50.0, consumptionL100km = 6.0)
        val s = listOf(
            branded("near", lat = north(1.0), prices = prices(GASOLINA_95 to 1.5)),
            branded("far-cheap", lat = north(14.0), prices = prices(GASOLINA_95 to 1.49)),
        )
        assertEquals(listOf("far-cheap", "near"), ids(selectVisibleStations(s, criteria(car = car))))
        assertEquals(listOf("far-cheap", "near"), ids(selectVisibleStations(s, criteria(sortByTotalCost = true))))
        val byCost = selectVisibleStations(s, criteria(car = car, sortByTotalCost = true))
        assertTrue(byCost.sortedByTotalCost)
        assertEquals(listOf("near", "far-cheap"), ids(byCost))
        assertEquals(byCost.rows[0].cost.totalCost!!, byCost.rows[0].metric, 0.0)
        assertEquals(2.0, byCost.rows[0].cost.roundTripKm!!, 1e-6)
    }

    @Test fun `keeps load order for equal prices (stable sort)`() {
        val s = listOf("x", "y", "z").map { branded(it, lat = north(1.0)) }
        assertEquals(listOf("x", "y", "z"), ids(selectVisibleStations(s, criteria())))
    }

    @Test fun `equal prices go nearer first`() {
        val s = listOf(
            branded("far", lat = north(9.0)),
            branded("near", lat = north(2.0)),
            branded("mid", lat = north(5.0)),
            branded("cheaper-but-far", lat = north(12.0), prices = prices(GASOLINA_95 to 1.45)),
        )
        assertEquals(listOf("cheaper-but-far", "near", "mid", "far"), ids(selectVisibleStations(s, criteria())))
    }

    @Test fun `on a route, equal prices go by smaller detour first`() {
        val route = listOf(home, LatLng(40.4 + 30 / 111.32, -3.7))
        val s = listOf(
            branded("off-2km", lat = 40.5, lon = lonOffset(40.5, 2.0)),
            branded("on-route-far", lat = north(25.0)),
            branded("off-1km", lat = 40.45, lon = lonOffset(40.45, 1.0)),
        )
        assertEquals(listOf("on-route-far", "off-1km", "off-2km"), ids(selectVisibleStations(s, criteria(route = route))))
    }

    @Test fun `equal total costs go nearer first`() {
        val car = SimpleCarSpecs(tankLitres = 50.0, consumptionL100km = 6.0)
        // Same price and the same total cost needs the same distance: then load order decides
        val s = listOf(branded("x", lat = north(3.0)), branded("y", lat = north(3.0)), branded("z", lat = north(1.0)))
        assertEquals(listOf("z", "x", "y"), ids(selectVisibleStations(s, criteria(car = car, sortByTotalCost = true))))
    }

    @Test fun `only the given ids, wherever they are`() {
        val r = selectVisibleStations(stations, criteria(onlyIds = setOf("c", "a")))
        assertEquals(listOf("c", "a"), ids(r)) // c is 20 km away, beyond the radius
        assertEquals(20.0, r.rows[0].distanceFromUserKm!!, 0.01)
    }

    @Test fun `colours the best row green and the worst red`() {
        val s = listOf(1.5, 1.6, 1.7).mapIndexed { i, p -> branded("s$i", lat = north(1.0), prices = prices(GASOLINA_95 to p)) }
        assertEquals(
            listOf("hsl(120, 82%, 40%)", "hsl(60, 82%, 40%)", "hsl(0, 82%, 40%)"),
            selectVisibleStations(s, criteria()).rows.map { it.color.toCss() },
        )
    }
}
