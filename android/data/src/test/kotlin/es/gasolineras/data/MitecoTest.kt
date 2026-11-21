package es.gasolineras.data

import es.gasolineras.core.domain.FuelType.GASOLEO_A
import es.gasolineras.core.domain.FuelType.GASOLINA_95
import es.gasolineras.core.domain.FuelType.GASOLINA_98
import es.gasolineras.core.domain.FuelType.GNC
import es.gasolineras.core.domain.FuelType.GNL
import es.gasolineras.core.domain.Station
import es.gasolineras.data.miteco.MitecoRepository
import es.gasolineras.data.miteco.decodeXmlTagName
import es.gasolineras.data.miteco.parseMitecoJson
import es.gasolineras.data.miteco.parseMitecoText
import es.gasolineras.data.miteco.parseMitecoXml
import es.gasolineras.data.miteco.toHistoryPrices
import es.gasolineras.data.miteco.toStations
import es.gasolineras.data.storage.Cache
import es.gasolineras.data.storage.MemoryStorage
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime

class MitecoTest {
    @Test fun `decodes escaped XML tag names`() {
        assertEquals("Rótulo", decodeXmlTagName("R_x00F3_tulo"))
        assertEquals("Longitud (WGS84)", decodeXmlTagName("Longitud_x0020__x0028_WGS84_x0029_"))
        assertEquals("Horario", decodeXmlTagName("Horario"))
    }

    @Test fun `parses JSON bodies`() = assertEquals(2, parseMitecoText(samplePayload(2)).stations.size)

    @Test fun `normalises stations`() {
        val s = toStations(parseMitecoJson(samplePayload(1)), "28").single()
        assertEquals(
            Station(
                id = "1000-40,410--3,700", code = "1000", provinceCode = "28", bulletinDate = "21/11/2026",
                name = "REPSOL", address = "CALLE EJEMPLO 0, MADRID, MADRID", lat = 40.41, lon = -3.7,
                openingHours = "L-D: 24H", prices = mapOf(GASOLEO_A to 1.409, GASOLINA_95 to 1.509, GASOLINA_98 to 1.659),
            ),
            s,
        )
    }

    @Test fun `drops stations without coordinates and fills in missing fields`() {
        val payload = parseMitecoJson(
            payloadJson(
                listOf(
                    rawStation(0, mapOf("Latitud" to "")),
                    rawStation(1, mapOf("IDEESS" to "", "Rótulo" to "", "Horario" to "", "Localidad" to "")),
                ),
                fecha = null,
            ),
        )
        val stations = toStations(payload, "28", LocalDate.of(2026, 11, 21))
        assertEquals(1, stations.size)
        assertEquals("", stations[0].name)
        assertEquals("", stations[0].code)
        assertEquals("CALLE EJEMPLO 1, MADRID", stations[0].address)
        assertEquals("21-11-2026", stations[0].bulletinDate) // no "Fecha" → today
    }

    @Test fun `builds history maps with only the fuels each station sold`() {
        val h = toHistoryPrices(parseMitecoJson(samplePayload(2)))
        assertEquals(mapOf(GASOLEO_A to 1.409, GASOLINA_95 to 1.509, GASOLINA_98 to 1.659), h["1000"])
        assertEquals(mapOf(GASOLINA_95 to 1.519, GASOLINA_98 to 1.659), h["1001"])
    }

    @Test fun `reads fuel fields whatever their capitalisation`() {
        val current = rawStation(0, mapOf("Precio Gas Natural Comprimido" to "1,234", "Precio Gas Natural Licuado" to "1,111"))
        val old = rawStation(1, mapOf("Precio Gas natural comprimido" to "1,300"))
        val (a, b) = toStations(parseMitecoJson(payloadJson(listOf(current, old))), "28")
        assertEquals(1.234, a.prices[GNC]!!, 0.0)
        assertEquals(1.111, a.prices[GNL]!!, 0.0)
        assertEquals(1.3, b.prices[GNC]!!, 0.0)
    }

    /* ---------- real responses (tests/fixtures) ---------- */

    @Test fun `parses every station of a real province file`() {
        val json = parseMitecoJson(fixture("miteco-province-28.json"))
        val stations = toStations(json, "28")
        assertEquals(json.stations.size, stations.size)
        val raw = json.stations[0]
        val first = stations.first { it.code == raw["IDEESS"] }
        assertEquals(raw["Rótulo"], first.name)
        assertEquals(raw["Latitud"]!!.replace(',', '.').toDouble(), first.lat, 1e-6)
        assertEquals(raw["Precio Gasolina 95 E5"]!!.replace(',', '.').toDouble(), first.prices[GASOLINA_95]!!, 0.0)
        assertTrue(Regex("""^\d{2}/\d{2}/\d{4}$""").matches(first.bulletinDate))
        assertTrue(stations.all { it.prices.isNotEmpty() })
    }

    @Test fun `the real XML file gives the same stations as the real JSON file`() {
        val fromJson = toStations(parseMitecoJson(fixture("miteco-province-28.json")), "28")
        val fromXml = toStations(parseMitecoXml(fixture("miteco-province-28.xml")), "28")
        assertEquals(fromJson, fromXml)
    }

    @Test fun `XML scanner handles entities, empty elements and rejects non-station XML`() {
        val xml = "<P><Fecha>21/11/2026 9:05:12</Fecha><ListaEESSPrecio><EESSPrecio>" +
            "<IDEESS>1</IDEESS><R_x00F3_tulo>A &amp; B &#x00D1;</R_x00F3_tulo><Horario/>" +
            "<Latitud>40,4</Latitud><Longitud_x0020__x0028_WGS84_x0029_>-3,7</Longitud_x0020__x0028_WGS84_x0029_>" +
            "</EESSPrecio></ListaEESSPrecio></P>"
        val p = parseMitecoXml(xml)
        assertEquals("21/11/2026 9:05:12", p.fecha)
        assertEquals("A & B Ñ", p.stations.single()["Rótulo"])
        assertEquals("", p.stations.single()["Horario"])
        assertEquals("-3,7", p.stations.single()["Longitud (WGS84)"])
        val error = runCatching { parseMitecoXml("<html><body>Service unavailable</body></html>") }.exceptionOrNull()
        assertEquals("XML contains no stations", error?.message)
    }

    @Test fun `parses a real history file`() {
        val json = parseMitecoJson(fixture("miteco-history-28.json"))
        assertEquals(json.stations.size, toHistoryPrices(json).size)
    }

    /* ---------- repository ---------- */

    private class Setup(body: String = samplePayload(3), scope: kotlinx.coroutines.CoroutineScope) {
        val urls = mutableListOf<String>()
        var date: LocalDateTime = LocalDateTime.of(2026, 11, 21, 10, 0)
        val repo = MitecoRepository(
            cache = Cache(MemoryStorage(), "t:"),
            attempts = listOf({ url -> urls += url; body }),
            now = { date },
            scope = scope,
        )
    }

    @Test fun `downloads a province once per day`() = runTest {
        val s = Setup(scope = backgroundScope)
        assertFalse(s.repo.hasCachedProvince("28"))
        assertEquals(3, s.repo.getProvinceStations("28").size)
        assertTrue(s.repo.hasCachedProvince("28"))
        s.repo.getProvinceStations("28")
        assertEquals(1, s.urls.size)
        assertTrue(s.urls[0].endsWith("EstacionesTerrestres/FiltroProvincia/28"))

        s.date = LocalDateTime.of(2026, 11, 22, 0, 30) // next local day
        assertFalse(s.repo.hasCachedProvince("28"))
        s.repo.getProvinceStations("28")
        assertEquals(2, s.urls.size)
    }

    @Test fun `re-downloads when forced`() = runTest {
        val s = Setup(scope = backgroundScope)
        s.repo.getProvinceStations("28")
        s.repo.getProvinceStations("28", force = true)
        assertEquals(2, s.urls.size)
    }

    @Test fun `shares one request between concurrent callers`() = runTest {
        val s = Setup(scope = backgroundScope)
        val (a, b) = listOf(async { s.repo.getProvinceStations("28") }, async { s.repo.getProvinceStations("28") }).awaitAll()
        assertSame(a, b)
        assertEquals(1, s.urls.size)
    }

    @Test fun `does not cache an empty province`() = runTest {
        val s = Setup("""{"ListaEESSPrecio":[]}""", backgroundScope)
        s.repo.getProvinceStations("28")
        s.repo.getProvinceStations("28")
        assertEquals(2, s.urls.size)
    }

    @Test fun `fetches and caches history days`() = runTest {
        val s = Setup(scope = backgroundScope)
        val day = s.repo.getHistoryDay("28", "20-11-2026")
        assertEquals(mapOf(GASOLEO_A to 1.429, GASOLINA_95 to 1.529, GASOLINA_98 to 1.659), day["1002"])
        s.repo.getHistoryDay("28", "20-11-2026")
        assertEquals(1, s.urls.size)
        assertTrue(s.urls[0].endsWith("EstacionesTerrestresHist/FiltroProvincia/20-11-2026/28"))
    }

    @Test fun `falls back to the next attempt when one fails or returns garbage`() = runTest {
        val repo = MitecoRepository(
            cache = Cache(MemoryStorage(), "t:"),
            attempts = listOf({ _ -> error("network down") }, { _ -> "<html>oops" }, { _ -> samplePayload(2) }),
            scope = backgroundScope,
        )
        assertEquals(2, repo.getProvinceStations("28").size)
    }
}
