package es.gasolineras.state

import es.gasolineras.core.domain.AgeFilterOption
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.Preferences
import es.gasolineras.core.domain.PriceStaleness
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.time.LocalDate

class StoreEffectsTest {
    private val today = { LocalDate.of(2026, 11, 21) }

    @Test fun `visible stations selector recomputes only when a relevant input changes`() {
        val select = VisibleStationsSelector()
        val s0 = state().addStations(listOf(station("1"))).setUserPosition(LatLng(40.4, -3.7))
        val r0 = select.select(s0)
        assertEquals(1, r0.rows.size)
        assertSame(r0, select.select(s0.copy(historyStatus = HistoryStatus(HistoryStatus.Kind.DONE, 4))))
        assertNotSame(r0, select.select(s0.updatePreferences { it.copy(searchRadiusKm = 5.0) }))
    }

    @Test fun `counts brands sorted with Spanish collation`() {
        val s = state().addStations(listOf(station("1", name = "ÁREA OIL"), station("2", name = "CEPSA"), station("3", name = "AVIA"), station("4", name = "CEPSA")))
        assertEquals(listOf("AREA OIL" to 1, "AVIA" to 1, "CEPSA" to 2), countBrands(s.stations))
    }

    private fun TestScope.effects(store: Store<AppState>, miteco: FakeMiteco) = Effects(store, miteco, this, today)

    @Test fun `loads a province, then checks the history depth the age filter needs`() = runTest {
        val store = Store(state(Preferences(ageFilterOption = AgeFilterOption.MORE_THAN_CUSTOM, ageFilterCustomDays = 5)))
        val miteco = FakeMiteco(mutableMapOf("28" to listOf(station("A"))))
        val effects = effects(store, miteco)

        effects.loadProvince("28")
        assertEquals(listOf("28"), store.value.loadedProvinces)
        assertEquals(listOf("A"), store.value.stations.map { it.id })
        assertEquals(HistoryStatus(HistoryStatus.Kind.LOADING, 6), store.value.historyStatus)

        advanceUntilIdle()
        val s = store.value
        assertEquals(HistoryStatus(HistoryStatus.Kind.DONE, 6), s.historyStatus)
        assertEquals(mapOf("28" to 6), s.historyDepth)
        assertEquals(PriceStaleness(6, "15-11-2026", 6), s.staleness.getValue("A")[FuelType.GASOLINA_95])
        assertEquals(6, miteco.calls.count { it.startsWith("history") })
        assertTrue("history:28:20-11-2026" in miteco.calls)
    }

    @Test fun `propagates download errors and leaves the province unloaded`() = runTest {
        val store = Store(state())
        try {
            effects(store, FakeMiteco(mutableMapOf())).loadProvince("99")
            fail()
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.startsWith("No se pudo descargar"))
        }
        assertEquals(emptyList<String>(), store.value.loadedProvinces)
    }

    @Test fun `a history day that fails only shortens the comparison`() = runTest {
        val store = Store(state())
        effects(store, FakeMiteco(mutableMapOf("28" to listOf(station("A"))), failDates = setOf("19-11-2026"))).loadProvince("28")
        advanceUntilIdle()
        assertEquals(1, store.value.staleness.getValue("A").getValue(FuelType.GASOLINA_95).days)
        assertEquals(HistoryStatus.Kind.DONE, store.value.historyStatus?.kind)
    }

    @Test fun `ensureHistoryForFilter checks deeper only where needed`() = runTest {
        val store = Store(state())
        val miteco = FakeMiteco(mutableMapOf("28" to listOf(station("A")), "46" to listOf(station("B", provinceCode = "46"))))
        val effects = effects(store, miteco)
        effects.loadProvince("28")
        effects.loadProvince("46")
        advanceUntilIdle()
        val before = miteco.calls.size

        effects.ensureHistoryForFilter() // default filter needs 4 days: already covered
        assertEquals(before, miteco.calls.size)

        store.update { it.updatePreferences { p -> p.copy(ageFilterOption = AgeFilterOption.AT_MOST_CUSTOM, ageFilterCustomDays = 7) } }
        effects.ensureHistoryForFilter()
        assertEquals(mapOf("28" to 8, "46" to 8), store.value.historyDepth)
    }

    @Test fun `a forced reload replaces station data`() = runTest {
        val data = mutableMapOf("28" to listOf(station("A")))
        val store = Store(state())
        val effects = effects(store, FakeMiteco(data))
        effects.loadProvince("28")
        data["28"] = listOf(station("A", prices = prices(FuelType.GASOLINA_95 to 1.44)))
        effects.loadProvince("28", force = true)
        assertEquals(1.44, store.value.stations[0].station.prices[FuelType.GASOLINA_95]!!, 0.0)
        advanceUntilIdle()
    }

    @Test fun `saves preferences once after changes settle, and flush saves immediately`() = runTest {
        val store = Store(state())
        val saved = mutableListOf<Double>()
        val persister = PreferencesPersister(store, backgroundScope, { saved += it.searchRadiusKm }, delayMs = 300).start()
        runCurrent()

        store.update { it.updatePreferences { p -> p.copy(searchRadiusKm = 10.0) } }
        runCurrent()
        store.update { it.updatePreferences { p -> p.copy(searchRadiusKm = 11.0) } }
        runCurrent()
        store.update { it.setUserPosition(LatLng(1.0, 1.0)) } // not a preference: ignored
        runCurrent()
        assertEquals(emptyList<Double>(), saved)
        advanceTimeBy(301)
        runCurrent()
        assertEquals(listOf(11.0), saved)

        store.update { it.updatePreferences { p -> p.copy(searchRadiusKm = 12.0) } }
        runCurrent()
        persister.flush()
        assertEquals(listOf(11.0, 12.0), saved)
        persister.stop()
        store.update { it.updatePreferences { p -> p.copy(searchRadiusKm = 13.0) } }
        advanceUntilIdle()
        assertEquals(listOf(11.0, 12.0), saved)
    }
}
