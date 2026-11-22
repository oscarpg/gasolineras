package es.gasolineras.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GeoTest {
    private val sol = LatLng(40.4168, -3.7038)
    private val atocha = LatLng(40.4065, -3.6895)

    /** Vitest's toBeCloseTo(x, digits): |a - b| < 10^-digits / 2. */
    private fun close(expected: Double, actual: Double, digits: Int) =
        assertEquals(expected, actual, Math.pow(10.0, -digits.toDouble()) / 2)

    @Test fun `is 0 for the same point`() = assertEquals(0.0, distanceKm(sol, sol), 0.0)

    @Test fun `gives about 111_32 km per degree of latitude`() = close(111.32, distanceKm(LatLng(40.0, -3.0), LatLng(41.0, -3.0)), 2)

    @Test fun `scales longitude by the cosine of the latitude`() {
        close(111.32, distanceKm(LatLng(0.0, 0.0), LatLng(0.0, 1.0)), 2)
        close(55.66, distanceKm(LatLng(60.0, 0.0), LatLng(60.0, 1.0)), 2)
    }

    @Test fun `matches a known short distance (Sol to Atocha about 1_7 km)`() = close(1.7, distanceKm(sol, atocha), 1)

    private val a = LatLng(40.0, -3.0)
    private val b = LatLng(40.0, -2.0)

    @Test fun `perpendicular distance when the point projects inside the segment`() =
        close(11.132, distanceToSegmentKm(LatLng(40.1, -2.5), a, b), 3)

    @Test fun `distance to the nearest end when the point projects outside`() {
        val p = LatLng(40.0, -4.0)
        close(distanceKm(p, a), distanceToSegmentKm(p, a, b), 6)
    }

    @Test fun `handles a zero-length segment`() = close(11.132, distanceToSegmentKm(LatLng(40.1, -3.0), a, a), 3)

    @Test fun `is Infinity for a missing or empty route`() {
        assertEquals(Double.POSITIVE_INFINITY, distanceToRouteKm(sol, null), 0.0)
        assertEquals(Double.POSITIVE_INFINITY, distanceToRouteKm(sol, emptyList()), 0.0)
    }

    @Test fun `is the point distance for a single-point route`() =
        close(distanceKm(sol, atocha), distanceToRouteKm(sol, listOf(atocha)), 9)

    @Test fun `takes the closest segment of the polyline`() {
        val route = listOf(LatLng(40.0, -3.0), LatLng(40.0, -2.0), LatLng(41.0, -2.0))
        val p = LatLng(40.5, -2.1)
        assertTrue(distanceToRouteKm(p, route) < 10)
        close(distanceToSegmentKm(p, LatLng(40.0, -2.0), LatLng(41.0, -2.0)), distanceToRouteKm(p, route), 9)
    }
}
