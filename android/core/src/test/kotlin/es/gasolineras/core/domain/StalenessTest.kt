package es.gasolineras.core.domain

import es.gasolineras.core.domain.FuelType.GASOLEO_A
import es.gasolineras.core.domain.FuelType.GASOLINA_95
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StalenessTest {
    private fun day(daysAgo: Int, price: Double?) = HistoryDay(daysAgo, "%02d-11-2026".format(21 - daysAgo), price)

    @Test fun `samePrice treats differences below half a tenth of a cent as equal`() {
        assertTrue(samePrice(1.459, 1.4594))
        assertFalse(samePrice(1.459, 1.46))
    }

    @Test fun `is 0 days since today when the price changed since yesterday`() =
        assertEquals(Staleness(0, "21-11-2026"), computeStaleness(1.5, listOf(day(1, 1.49), day(2, 1.5)), "21-11-2026"))

    @Test fun `counts consecutive matching days and reports the oldest matching date`() =
        assertEquals(Staleness(2, "19-11-2026"), computeStaleness(1.5, listOf(day(1, 1.5), day(2, 1.5), day(3, 1.48)), "21-11-2026"))

    @Test fun `stops at the first day without data (missing day or no price)`() {
        assertEquals(1, computeStaleness(1.5, listOf(day(1, 1.5), null, day(3, 1.5)), "21-11-2026").days)
        assertEquals(0, computeStaleness(1.5, listOf(day(1, null), day(2, 1.5)), "21-11-2026").days)
    }

    @Test fun `reports the full window when every day matches`() =
        assertEquals(Staleness(4, "17-11-2026"), computeStaleness(1.5, (1..4).map { day(it, 1.5) }, "21-11-2026"))

    @Test fun `handles an empty history`() =
        assertEquals(Staleness(0, "21-11-2026"), computeStaleness(1.5, emptyList(), "21-11-2026"))

    private val window = listOf(
        HistoryWindowDay(1, "20-11-2026"),
        HistoryWindowDay(2, "19-11-2026"),
        HistoryWindowDay(3, "18-11-2026"),
    )

    @Test fun `computes each fuel of each station against the history`() {
        val s = station("A", prices = prices(GASOLINA_95 to 1.5, GASOLEO_A to 1.4))
        val history = listOf(
            mapOf("A" to prices(GASOLINA_95 to 1.5, GASOLEO_A to 1.39)),
            mapOf("A" to prices(GASOLINA_95 to 1.5)),
            mapOf("A" to prices(GASOLINA_95 to 1.48)),
        )
        assertEquals(
            mapOf(
                "A" to mapOf(
                    GASOLEO_A to PriceStaleness(0, "21/11/2026", 3),
                    GASOLINA_95 to PriceStaleness(2, "19-11-2026", 3),
                ),
            ),
            computeProvinceStaleness(listOf(s), window, history, "21-11-2026"),
        )
    }

    @Test fun `skips stations without a MITECO code and treats missing days as a stop`() {
        val noCode = station("X", code = "")
        val s = station("B", bulletinDate = "")
        val result = computeProvinceStaleness(
            listOf(noCode, s),
            window,
            listOf(mapOf("B" to prices(GASOLINA_95 to 1.5)), null, mapOf("B" to prices(GASOLINA_95 to 1.5))),
            "21-11-2026",
        )
        assertEquals(listOf("B"), result.keys.toList())
        assertEquals(PriceStaleness(1, "20-11-2026", 3), result.getValue("B")[GASOLINA_95])
    }

    @Test fun `uses today as since when the station has no bulletin date`() {
        val s = station("C", bulletinDate = "")
        val r = computeProvinceStaleness(listOf(s), window, listOf(emptyMap(), emptyMap(), emptyMap()), "21-11-2026")
        assertEquals("21-11-2026", r.getValue("C").getValue(GASOLINA_95).since)
    }
}
