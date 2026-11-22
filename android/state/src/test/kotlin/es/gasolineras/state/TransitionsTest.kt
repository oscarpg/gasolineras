package es.gasolineras.state

import es.gasolineras.core.domain.Discount
import es.gasolineras.core.domain.DiscountType
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.Preferences
import es.gasolineras.core.domain.PriceStaleness
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class TransitionsTest {
    @Test fun `activates the first car when none is active, and uses the active car's fuel`() {
        val s = createInitialState(Preferences(fuel = FuelType.GLP, cars = listOf(VAN, LEON)))
        assertEquals("c2", s.preferences.activeCarId)
        assertEquals(FuelType.GASOLEO_A, s.preferences.fuel)
    }

    @Test fun `keeps the saved fuel when the active car no longer exists`() {
        val s = createInitialState(Preferences(fuel = FuelType.GLP, cars = listOf(LEON), activeCarId = "gone"))
        assertEquals("gone", s.preferences.activeCarId)
        assertEquals(FuelType.GLP, s.preferences.fuel)
    }

    @Test fun `changing to another fuel deactivates the active car, the same fuel keeps it`() {
        val s = state(Preferences(cars = listOf(LEON), activeCarId = "c1"))
        assertEquals("c1", s.setFuel(FuelType.GASOLINA_95).preferences.activeCarId)
        val changed = s.setFuel(FuelType.GASOLEO_A)
        assertNull(changed.preferences.activeCarId)
        assertEquals(FuelType.GASOLEO_A, changed.preferences.fuel)
    }

    @Test fun `selecting a car switches to its fuel`() {
        val s = state(Preferences(cars = listOf(LEON, VAN), activeCarId = "c1")).selectCar("c2")
        assertEquals("c2", s.preferences.activeCarId)
        assertEquals(FuelType.GASOLEO_A, s.preferences.fuel)
    }

    @Test fun `saving a new car adds and activates it`() {
        val s = state(Preferences(cars = listOf(LEON))).saveCar(CarInput("Moto", FuelType.GASOLINA_98, 15.0, 4.0), "c9")
        assertEquals(listOf("c1", "c9"), s.preferences.cars.map { it.id })
        assertEquals("c9", s.preferences.activeCarId)
        assertEquals(FuelType.GASOLINA_98, s.preferences.fuel)
    }

    @Test fun `saving with an existing name (any case) updates that car in place`() {
        val s = state(Preferences(cars = listOf(LEON, VAN), activeCarId = "c2")).saveCar(CarInput("LEÓN", FuelType.GLP, 45.0, 7.0), "unused")
        assertEquals(listOf(LEON.copy(fuel = FuelType.GLP, tankLitres = 45.0, consumptionL100km = 7.0), VAN), s.preferences.cars)
        assertEquals("c1", s.preferences.activeCarId)
    }

    @Test fun `editing a car keeps its id, even when renamed, and updates the fuel if it is active`() {
        val s = state(Preferences(cars = listOf(LEON, VAN), activeCarId = "c1")).updateCar("c1", CarInput("León FR", FuelType.GASOLINA_98, 50.0, 6.5))
        assertEquals(listOf("c1", "c2"), s.preferences.cars.map { it.id })
        assertEquals("León FR", s.preferences.cars[0].name)
        assertEquals("c1", s.preferences.activeCarId)
        assertEquals(FuelType.GASOLINA_98, s.preferences.fuel)
        // editing an inactive car leaves the selected fuel alone
        assertEquals(FuelType.GASOLINA_98, s.updateCar("c2", CarInput("Furgo", FuelType.GLP, 60.0, 9.0)).preferences.fuel)
    }

    @Test fun `deleting the active car activates the next one with its fuel`() {
        val s = state(Preferences(cars = listOf(LEON, VAN), activeCarId = "c1")).deleteCar("c1")
        assertEquals(listOf(VAN), s.preferences.cars)
        assertEquals("c2", s.preferences.activeCarId)
        assertEquals(FuelType.GASOLEO_A, s.preferences.fuel)
        val empty = s.deleteCar("c2")
        assertNull(empty.preferences.activeCarId)
        assertEquals(FuelType.GASOLEO_A, empty.preferences.fuel)
    }

    @Test fun `deleting another car leaves the active one alone`() =
        assertEquals("c1", state(Preferences(cars = listOf(LEON, VAN), activeCarId = "c1")).deleteCar("c2").preferences.activeCarId)

    @Test fun `clamps the custom age days to 1-10`() {
        assertEquals(10, state().setCustomAgeDays(50).preferences.ageFilterCustomDays)
        assertEquals(3, state().setCustomAgeDays(0).preferences.ageFilterCustomDays)
        assertEquals(1, state().setCustomAgeDays(-2).preferences.ageFilterCustomDays)
        assertEquals(6, state().setCustomAgeDays(6).preferences.ageFilterCustomDays)
    }

    @Test fun `adds and removes discounts without touching others`() {
        val s = state(Preferences(discounts = mapOf("A" to Discount(DiscountType.CTS, 1.0)))).setDiscount("B", Discount(DiscountType.PCT, 3.0))
        assertEquals(listOf("A", "B"), s.preferences.discounts.keys.toList())
        assertEquals(mapOf("B" to Discount(DiscountType.PCT, 3.0)), s.removeDiscount("A").preferences.discounts)
    }

    @Test fun `all brands clears the filter, unticking it selects every brand`() {
        assertEquals(emptySet<String>(), state(Preferences(brands = setOf("X"))).setAllBrands(true, listOf("X", "Y")).preferences.brands)
        assertEquals(listOf("X", "Y"), state().setAllBrands(false, listOf("X", "Y")).preferences.brands.toList())
    }

    @Test fun `toggles single brands`() {
        val s = state(Preferences(brands = linkedSetOf("X", "Y"))).setBrandSelected("X", false)
        assertEquals(listOf("Y"), s.preferences.brands.toList())
        assertEquals(listOf("Y", "Z"), s.setBrandSelected("Z", true).preferences.brands.toList())
    }

    @Test fun `adds stations with their brand, skipping ids already loaded`() {
        val s = state().addStations(listOf(station("1", name = "E.S. CEPSA CENTRO"), station("2"), station("1")))
        assertEquals(listOf("1" to "CEPSA", "2" to "REPSOL"), s.stations.map { it.id to it.brand })
        val again = s.addStations(listOf(station("2", prices = prices(FuelType.GASOLINA_95 to 9.0))))
        assertEquals(1.5, again.stations[1].station.prices[FuelType.GASOLINA_95]!!, 0.0)
    }

    @Test fun `replaces existing stations when refreshing`() {
        val s = state().addStations(listOf(station("1"), station("2")))
        val refreshed = s.addStations(listOf(station("2", prices = prices(FuelType.GASOLINA_95 to 1.42))), replace = true)
        assertEquals(listOf(1.5, 1.42), refreshed.stations.map { it.station.prices[FuelType.GASOLINA_95] })
    }

    @Test fun `drops brand-filter entries for brands no station has, normalising them first`() =
        assertEquals(setOf("REPSOL"), state(Preferences(brands = linkedSetOf("repsol", "SHELL"))).addStations(listOf(station("1"))).preferences.brands)

    @Test fun `keeps the same preferences object when the brand filter is unchanged`() {
        val s0 = state(Preferences(brands = setOf("REPSOL")))
        assertSame(s0.preferences, s0.addStations(listOf(station("1"))).preferences)
    }

    @Test fun `marks provinces loaded once`() =
        assertEquals(listOf("28"), state().markProvinceLoaded("28").markProvinceLoaded("28").loadedProvinces)

    private fun result(days: Int) = mapOf("A" to mapOf(FuelType.GASOLINA_95 to PriceStaleness(days, "x", days)))

    @Test fun `shows loading while running, then done with the job's depth`() {
        var s = state().startHistoryJob(1, HistoryJob("28", 4))
        assertEquals(HistoryStatus(HistoryStatus.Kind.LOADING, 4), s.historyStatus)
        s = s.finishHistoryJob(1, result(4))
        assertEquals(HistoryStatus(HistoryStatus.Kind.DONE, 4), s.historyStatus)
        assertEquals(mapOf("28" to 4), s.historyDepth)
        assertEquals(4, s.staleness.getValue("A").getValue(FuelType.GASOLINA_95).days)
        assertEquals(emptyMap<Int, HistoryJob>(), s.historyJobs)
    }

    @Test fun `keeps showing loading while another job is still running`() {
        var s = state().startHistoryJob(1, HistoryJob("28", 4)).startHistoryJob(2, HistoryJob("46", 4))
        s = s.finishHistoryJob(1, result(4))
        assertEquals(HistoryStatus.Kind.LOADING, s.historyStatus?.kind)
        s = s.finishHistoryJob(2, emptyMap())
        assertEquals(HistoryStatus.Kind.DONE, s.historyStatus?.kind)
    }

    @Test fun `ignores a shorter check that finishes after a longer one`() {
        var s = state().startHistoryJob(1, HistoryJob("28", 4)).startHistoryJob(2, HistoryJob("28", 7))
        s = s.finishHistoryJob(2, result(7)).finishHistoryJob(1, result(4))
        assertEquals(7, s.historyDepth["28"])
        assertEquals(7, s.staleness.getValue("A").getValue(FuelType.GASOLINA_95).windowDays)
    }

    @Test fun `reports errors without changing staleness, and resetHistoryDepth allows rechecks`() {
        var s = state().startHistoryJob(1, HistoryJob("28", 4)).finishHistoryJob(1, null)
        assertEquals(HistoryStatus(HistoryStatus.Kind.ERROR, 4), s.historyStatus)
        assertEquals(emptyMap<String, Int>(), s.historyDepth)
        s = s.copy(historyDepth = mapOf("28" to 7)).resetHistoryDepth()
        assertEquals(emptyMap<String, Int>(), s.historyDepth)
    }

    @Test fun `ignores unknown job ids`() {
        val s = state()
        assertSame(s, s.finishHistoryJob(99, emptyMap()))
    }
}
