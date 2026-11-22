package es.gasolineras.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticsTest {

    private fun fixture(name: String): String =
        requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

    @Test
    fun `parses the shared MITECO fixture`() {
        val (date, stations) = parseMitecoStations(fixture("miteco-province-28.json"))
        assertEquals("21/11/2026 11:25:56", date)
        assertEquals(25, stations.size)
        val first = stations.first()
        assertEquals("3119", first.id)
        assertEquals("REPSOL", first.name)
        assertEquals(40.528028, first.lat, 1e-9)
        assertEquals(-3.480944, first.lon, 1e-9)
        assertEquals(1.885, first.price!!, 1e-9)
    }

    @Test
    fun `frame stats`() {
        val stats = FrameMeter.summarize(listOf(16.0, 16.0, 16.0, 50.0), durationMs = 1000)
        assertEquals(4, stats.frames)
        assertEquals(25.0, stats.jankyPercent, 1e-9)
        assertEquals(50.0, stats.worstFrameMs, 1e-9)
        assertEquals(4000.0 / 98.0, stats.avgFps, 1e-9)
        assertEquals(0, FrameMeter.summarize(emptyList(), 0).frames)
    }

    @Test
    fun `report flags TLS errors and lists certificates`() {
        val failed = MitecoProbeResult(
            HttpProbeResult(ok = false, elapsedMs = 120, errorType = "SSLHandshakeException", errorMessage = "trust anchor", tlsError = true),
        )
        val line = DiagnosticsReport.miteco(failed)
        assertTrue(line, line.startsWith("MITECO: FAIL"))
        assertTrue(line, "TLS ERROR" in line)

        val ok = MitecoProbeResult(
            HttpProbeResult(ok = true, httpCode = 200, bytes = 3_200_000, elapsedMs = 900, tlsVersion = "TLSv1.3", certificates = listOf("CN=a ← CN=b")),
            stations = listOf(ProbeStation("1", "X", 40.0, -3.0, 1.5)),
            bulletinDate = "21/11/2026",
        )
        assertEquals(
            "MITECO: OK · 1 stations · bulletin 21/11/2026 · HTTP 200 · 3.2 MB · 900 ms · TLSv1.3\n  cert: CN=a ← CN=b",
            DiagnosticsReport.miteco(ok),
        )
    }
}
