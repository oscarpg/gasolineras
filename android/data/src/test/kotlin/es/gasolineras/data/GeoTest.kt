package es.gasolineras.data

import es.gasolineras.core.domain.AppError
import es.gasolineras.core.domain.LatLng
import es.gasolineras.data.geo.FallbackGeocoder
import es.gasolineras.data.geo.GeocodeResult
import es.gasolineras.data.geo.Geocoder
import es.gasolineras.data.geo.NominatimGeocoder
import es.gasolineras.data.geo.OsrmRouter
import es.gasolineras.data.geo.RateLimiter
import es.gasolineras.data.http.HttpResponse
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class GeoTest {
    /** A fake clock whose sleep() advances time instantly. */
    private class FakeClock {
        var t = 0L
        val sleeps = mutableListOf<Long>()
        fun limiter(ms: Long) = RateLimiter(ms, now = { t }, sleep = { sleeps += it; t += it })
    }

    @Test fun `spaces task starts at least minInterval apart, in order`() = runTest {
        val clock = FakeClock()
        val limit = clock.limiter(1000)
        val starts = mutableListOf<Long>()
        listOf(1, 2, 3).map { n -> async { limit.schedule { starts += clock.t; n } } }.awaitAll()
        assertEquals(listOf(0L, 1000L, 2000L), starts)
    }

    @Test fun `does not wait when enough time has passed`() = runTest {
        val clock = FakeClock()
        val limit = clock.limiter(1000)
        limit.schedule { 1 }
        clock.t += 5000
        limit.schedule { 2 }
        assertEquals(emptyList<Long>(), clock.sleeps)
    }

    @Test fun `keeps going after a failed task`() = runTest {
        val limit = FakeClock().limiter(1000)
        try {
            limit.schedule { error("boom") }
            fail()
        } catch (e: IllegalStateException) {
            assertEquals("boom", e.message)
        }
        assertEquals("ok", limit.schedule { "ok" })
    }

    private fun geocoder(routes: Map<String, (String) -> HttpResponse>, clock: FakeClock = FakeClock()) =
        FakeHttp(routes).let { it to NominatimGeocoder(it, clock.limiter(1000)) }

    @Test fun `returns the first match with its province, and caches it`() = runTest {
        val (http, g) = geocoder(mapOf("/search" to FakeHttp.ok("""[{"lat":"40.4168","lon":"-3.7038","address":{"postcode":"28013"}}]""")))
        assertEquals(GeocodeResult(LatLng(40.4168, -3.7038), "28"), g.search("Puerta del Sol, Madrid"))
        assertTrue(http.calls[0].contains("q=Puerta%20del%20Sol%2C%20Madrid"))
        g.search("  puerta del sol, madrid ")
        assertEquals(1, http.calls.size)
    }

    @Test fun `returns null when nothing is found`() = runTest {
        assertNull(geocoder(mapOf("/search" to FakeHttp.ok("[]"))).second.search("zzzz"))
    }

    @Test fun `reverse-geocodes to a province code, caching nearby positions`() = runTest {
        val (http, g) = geocoder(mapOf("/reverse" to FakeHttp.ok("""{"address":{"state":"Comunidad de Madrid"}}""")))
        assertEquals("28", g.reverseProvince(LatLng(40.41681, -3.70381)))
        assertEquals("28", g.reverseProvince(LatLng(40.41684, -3.70379)))
        assertEquals(1, http.calls.size)
        assertTrue(http.calls[0].contains("&lat=40.41681&lon=-3.70381"))
    }

    @Test fun `keeps Nominatim requests at least 1 s apart`() = runTest {
        val clock = FakeClock()
        val (_, g) = geocoder(mapOf("/search" to FakeHttp.ok("[]"), "/reverse" to FakeHttp.ok("""{"address":{}}""")), clock)
        listOf(async { g.search("a") }, async { g.search("b") }, async { g.reverseProvince(LatLng(1.0, 1.0)) }).awaitAll()
        assertEquals(listOf(1000L, 1000L), clock.sleeps)
    }

    @Test fun `does not cache failures`() = runTest {
        var failing = true
        val (_, g) = geocoder(mapOf("/search" to { _ -> if (failing) HttpResponse(429, "busy") else HttpResponse(200, "[]") }))
        try {
            g.search("x")
            fail()
        } catch (e: AppError) {
            assertEquals("HTTP 429", e.message)
        }
        failing = false
        assertNull(g.search("x"))
    }

    @Test fun `falls back to the second geocoder when the first fails or finds nothing`() = runTest {
        val broken = object : Geocoder {
            override suspend fun search(query: String): GeocodeResult? = error("no backend")
            override suspend fun reverseProvince(position: LatLng): String? = null
        }
        val good = object : Geocoder {
            override suspend fun search(query: String) = GeocodeResult(LatLng(1.0, 2.0), "28")
            override suspend fun reverseProvince(position: LatLng) = "41"
        }
        val g = FallbackGeocoder(broken, good)
        assertEquals("28", g.search("x")?.provinceCode)
        assertEquals("41", g.reverseProvince(LatLng(0.0, 0.0)))
        assertEquals("28", FallbackGeocoder(good, broken).search("x")?.provinceCode)
    }

    @Test fun `returns the route as lat-lon points`() = runTest {
        val http = FakeHttp(mapOf("router.project-osrm.org" to FakeHttp.ok("""{"code":"Ok","routes":[{"geometry":{"coordinates":[[-3.7,40.4],[-3.75,40.35]]}}]}""")))
        assertEquals(listOf(LatLng(40.4, -3.7), LatLng(40.35, -3.75)), OsrmRouter(http).route(LatLng(40.4, -3.7), LatLng(40.35, -3.75)))
        assertTrue(http.calls[0].contains("/driving/-3.7,40.4;-3.75,40.35?overview=full&geometries=geojson"))
    }

    @Test fun `returns null when OSRM finds no route (even with a 4xx status)`() = runTest {
        val http = FakeHttp(mapOf("router.project-osrm.org" to { _ -> HttpResponse(400, """{"code":"NoRoute"}""") }))
        assertNull(OsrmRouter(http).route(LatLng(40.4, -3.7), LatLng(28.1, -15.4)))
    }

    @Test fun `geocodes Puerta del Sol to Madrid (28) and reverse-geocodes it back`() = runTest {
        val http = FakeHttp(mapOf("/search" to FakeHttp.ok(fixture("nominatim-search.json")), "/reverse" to FakeHttp.ok(fixture("nominatim-reverse.json"))))
        val g = NominatimGeocoder(http, RateLimiter(0))
        val place = g.search("Puerta del Sol, Madrid")!!
        assertEquals("28", place.provinceCode)
        assertEquals(40.4169, place.latLng.lat, 0.0005)
        assertEquals("28", g.reverseProvince(place.latLng))
    }

    @Test fun `turns a real OSRM route into lat-lon points`() = runTest {
        val body = fixture("osrm-route.json")
        val http = FakeHttp(mapOf("router.project-osrm.org" to FakeHttp.ok(body)))
        val points = OsrmRouter(http).route(LatLng(40.4168, -3.7038), LatLng(40.4067, -3.711))!!
        val expected = Json.parseToJsonElement(body).jsonObject["routes"]!!.jsonArray[0].jsonObject["geometry"]!!
            .jsonObject["coordinates"]!!.jsonArray.size
        assertEquals(expected, points.size)
        assertTrue(points[0].lat > 40) // latitude first
    }
}
