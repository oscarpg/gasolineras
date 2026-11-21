package es.gasolineras.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

class MiscTest {
    @Test fun `colour goes from green (min) through yellow to red (max)`() {
        assertEquals("hsl(120, 82%, 40%)", colorForValue(1.0, 1.0, 2.0).toCss())
        assertEquals("hsl(60, 82%, 40%)", colorForValue(1.5, 1.0, 2.0).toCss())
        assertEquals("hsl(0, 82%, 40%)", colorForValue(2.0, 1.0, 2.0).toCss())
    }

    @Test fun `colour is green when all values are equal`() =
        assertEquals("hsl(120, 82%, 40%)", colorForValue(1.5, 1.5, 1.5).toCss())

    @Test fun `text colour darkens the scale colour, keeping the hue`() =
        assertEquals("hsl(60, 82%, 26%)", ScaleColor(60).forText().toCss())

    /** WCAG contrast ratio of an HSL colour against white (same formula as the web test). */
    private fun contrastOnWhite(c: ScaleColor): Double {
        val h = c.hue.toDouble()
        val s = c.saturation / 100.0
        val l = c.lightness / 100.0
        fun k(n: Double) = (n + h / 30) % 12
        val a = s * min(l, 1 - l)
        fun channel(n: Double) = l - a * max(-1.0, minOf(k(n) - 3, 9 - k(n), 1.0))
        fun linear(x: Double) = if (x <= 0.03928) x / 12.92 else ((x + 0.055) / 1.055).pow(2.4)
        val lum = 0.2126 * linear(channel(0.0)) + 0.7152 * linear(channel(8.0)) + 0.0722 * linear(channel(4.0))
        return 1.05 / (lum + 0.05)
    }

    @Test fun `text colour meets WCAG AA for every colour of the scale`() {
        for (v in 0..100) {
            assertTrue(contrastOnWhite(colorForValue(v.toDouble(), 0.0, 100.0).forText()) >= 4.5)
        }
        assertTrue(contrastOnWhite(ScaleColor(60)) < 4.5) // why the darker colour is needed
    }

    @Test fun `formats as dd-mm-yyyy with zero padding`() {
        assertEquals("05-01-2026", toMitecoDate(LocalDate.of(2026, 1, 5)))
        assertEquals("21-11-2026", toMitecoDate(LocalDate.of(2026, 11, 21)))
    }

    @Test fun `subtracts days across month and year boundaries`() {
        assertEquals("28-02-2026", toMitecoDate(daysBefore(LocalDate.of(2026, 3, 1), 1)))
        assertEquals("30-12-2025", toMitecoDate(daysBefore(LocalDate.of(2026, 1, 2), 3)))
    }

    @Test fun `parses MITECO dates`() {
        assertEquals(LocalDate.of(2026, 11, 21), parseMitecoDate("21/11/2026 9:05:12"))
        assertEquals(LocalDate.of(2026, 1, 5), parseMitecoDate("5-1-2026"))
        assertNull(parseMitecoDate("31/02/2026"))
        assertNull(parseMitecoDate("ayer"))
    }

    @Test fun `parseSpanishNumber accepts a decimal comma or dot`() {
        assertEquals(1.459, parseSpanishNumber("1,459")!!, 0.0)
        assertEquals(1.459, parseSpanishNumber("1.459")!!, 0.0)
        assertEquals(-3.7, parseSpanishNumber("-3,70")!!, 0.0)
        assertEquals(1.459, parseSpanishNumber(" 1,459 ")!!, 0.0)
        assertEquals(12.0, parseSpanishNumber("12 km")!!, 0.0) // like parseFloat
    }

    @Test fun `parseSpanishNumber returns null for empty or invalid values`() {
        assertNull(parseSpanishNumber(""))
        assertNull(parseSpanishNumber(null))
        assertNull(parseSpanishNumber("n/a"))
    }

    private data class P(override val idx: Int, override val price: Double?) : PricePoint {
        override val label = "d$idx"
    }

    private fun series(vararg prices: Double?) = prices.mapIndexed { i, p -> P(i, p) }

    @Test fun `keeps the first price, each change and the last day`() =
        assertEquals(listOf(0, 2, 4, 6), significantPricePoints(series(1.5, 1.5, 1.52, 1.52, 1.49, 1.49, 1.49)).map { it.idx })

    @Test fun `skips days without data`() =
        assertEquals(listOf(1, 4), significantPricePoints(series(null, 1.5, null, 1.5, 1.51)).map { it.idx })

    @Test fun `returns nothing when there is no data at all`() =
        assertEquals(emptyList<P>(), significantPricePoints(series(null, null)))

    @Test fun `keeps the last day even when the price did not change`() =
        assertEquals(listOf(0, 2), significantPricePoints(series(1.5, 1.5, 1.5)).map { it.idx })

    @Test fun `jsRound rounds halves up like Math_round`() {
        assertEquals(60, jsRound(59.5))
        assertEquals(-2, jsRound(-2.5))
        assertTrue(abs(jsRound(0.49999)) == 0)
    }
}
