package es.gasolineras.data

import es.gasolineras.core.domain.BrandedStation
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.ROUTE_ONLY_MAX_KM
import es.gasolineras.core.domain.RouteProbe
import es.gasolineras.core.domain.Station
import es.gasolineras.core.domain.VisibilityCriteria
import es.gasolineras.core.domain.distanceKm
import es.gasolineras.core.domain.routeCheckCandidates
import es.gasolineras.core.domain.routeProbes
import es.gasolineras.core.domain.selectVisibleStations
import es.gasolineras.data.geo.OsrmRouter
import es.gasolineras.data.geo.TABLE_BATCH
import es.gasolineras.data.http.HttpResponse
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The router's table request, and the real Cambre → A Guarda route (tests/fixtures, shared with the web app). */
class RouteCheckDataTest {
    private fun probe(k: Int) = RouteProbe("s$k", LatLng(42.0, -8.0 - k), LatLng(42.01, -8.001 - k), LatLng(42.02, -8.0 - k))

    @Test fun `asks before-station and station-after, and returns the extra km`() = runTest {
        // Probe 0: 2.0 + 2.1 − 4.0 = 0.1 km. Probe 1: the station can't be reached.
        val body = """{"code":"Ok","distances":[[2000,4000,0,0],[0,2100,0,0],[0,0,null,4000],[0,0,0,1500]]}"""
        val http = FakeHttp(mapOf("/table/v1/driving/" to FakeHttp.ok(body)))
        val out = OsrmRouter(http).extraDistances(listOf(probe(0), probe(1)))
        assertEquals(0.1, out[0], 1e-9)
        assertEquals(Double.POSITIVE_INFINITY, out[1], 0.0)
        val url = http.calls.single()
        assertTrue(url, url.contains("/table/v1/driving/-8,42;-8.001,42.01;-8,42.02;-9,42;-9.001,42.01;-9,42.02?"))
        assertTrue(url, url.contains("sources=0;1;3;4&destinations=1;2;4;5&annotations=distance"))
    }

    @Test fun `splits many stations into several requests`() = runTest {
        val http = FakeHttp(
            mapOf(
                "/table/v1/driving/" to { url: String ->
                    val n = url.substringAfter("sources=").substringBefore("&").split(";").size
                    val rows = (0 until n).joinToString(",") { r -> (0 until n).joinToString(",", "[", "]") { c -> if (r % 2 == 0 && c % 2 == 1) "1000" else "600" } }
                    HttpResponse(200, """{"code":"Ok","distances":[$rows]}""")
                },
            ),
        )
        val out = OsrmRouter(http).extraDistances((0..TABLE_BATCH).map(::probe))
        assertEquals(2, http.calls.size)
        assertEquals(TABLE_BATCH + 1, out.size)
        out.forEach { assertEquals(0.2, it, 1e-9) } // 600 + 600 − 1000 m
    }

    @Test(expected = Exception::class)
    fun `throws when OSRM answers with an error`() = runTest {
        val http = FakeHttp(mapOf("/table/v1/driving/" to { _: String -> HttpResponse(400, """{"code":"TooBig"}""") }))
        OsrmRouter(http).extraDistances(listOf(probe(0)))
    }

    /* ---------- real route: Cambre → A Guarda ---------- */

    private val fixture = Json.parseToJsonElement(fixture("route-cambre-a-guarda.json")).jsonObject
    private val route = fixture["route"]!!.jsonArray.map { p -> p.jsonArray.let { LatLng(it[0].jsonPrimitive.double, it[1].jsonPrimitive.double) } }
    private val stations = fixture["stations"]!!.jsonArray.map { it.jsonObject }.map { s ->
        fun d(k: String) = s[k]!!.jsonPrimitive.double
        val id = s["id"]!!.jsonPrimitive.content
        BrandedStation(
            Station(id, id, "15", "23/11/2026", s["name"]!!.jsonPrimitive.content, s["address"]!!.jsonPrimitive.content, d("lat"), d("lon"), "", mapOf(FuelType.GASOLINA_95 to 1.5)),
            "X",
        )
    }
    private val checks: Map<String, Double?> = (fixture["extraKm"] as JsonObject).mapValues { (_, v) -> if (v is JsonNull) null else v.jsonPrimitive.doubleOrNull }
    private val origin = fixture["origin"]!!.jsonArray.let { LatLng(it[0].jsonPrimitive.double, it[1].jsonPrimitive.double) }

    private fun visible(routeChecks: Map<String, Double?>) = selectVisibleStations(
        stations,
        VisibilityCriteria(
            fuel = FuelType.GASOLINA_95, userPosition = origin, route = route, searchRadiusKm = 15.0,
            routeDetourKm = 3.0, routeOnly = true, routeChecks = routeChecks,
        ),
    ).rows.map { it.station.id }.toSet()

    // Opposite-direction service areas, and stations on streets or estates beside the motorway.
    private val offRoute = setOf("813", "557", "356", "701", "15073", "789", "16462")
    private val onRoute = setOf("787", "8496", "8497", "326", "558", "786", "669", "668", "814")

    @Test fun `the straight-line rule alone lets in stations that need leaving the road`() {
        val before = visible(emptyMap())
        assertEquals(16, before.size)
        assertTrue(before.containsAll(offRoute))
        assertEquals(0.15, ROUTE_ONLY_MAX_KM, 0.0)
    }

    @Test fun `with the road checks only the stations really on the way remain`() {
        assertEquals(onRoute, visible(checks))
    }

    @Test fun `every station within 300 m is a candidate, with probes about 2 km either side`() {
        val candidates = routeCheckCandidates(stations, route, emptyMap())
        assertEquals(checks.keys, candidates.map { it.id }.toSet())
        for (p in routeProbes(route, candidates)) {
            val span = distanceKm(p.before, p.after)
            assertTrue("${p.id}: $span", span > 2 && span <= 4.01)
        }
    }
}
