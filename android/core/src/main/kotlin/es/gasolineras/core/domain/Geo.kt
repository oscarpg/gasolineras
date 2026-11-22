package es.gasolineras.core.domain

import kotlin.math.cos
import kotlin.math.hypot

/** Kilometres per degree of latitude (and of longitude at the equator). */
private const val KM_PER_DEGREE = 111.32

private fun kmPerDegreeLon(lat: Double): Double = KM_PER_DEGREE * cos(Math.toRadians(lat))

/**
 * Straight-line distance in km (equirectangular approximation), accurate to well under 1%
 * at the distances this app works with (< 100 km). Longitude is scaled at the latitude of [a].
 */
fun distanceKm(a: LatLng, b: LatLng): Double {
    val kx = kmPerDegreeLon(a.lat)
    return hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * KM_PER_DEGREE)
}

/** Shortest distance in km from point [p] to the segment [a]–[b]. */
fun distanceToSegmentKm(p: LatLng, a: LatLng, b: LatLng): Double {
    val kx = kmPerDegreeLon(p.lat)
    val px = p.lon * kx
    val py = p.lat * KM_PER_DEGREE
    val ax = a.lon * kx
    val ay = a.lat * KM_PER_DEGREE
    val bx = b.lon * kx
    val by = b.lat * KM_PER_DEGREE
    val dx = bx - ax
    val dy = by - ay
    val lengthSq = dx * dx + dy * dy
    val t = if (lengthSq == 0.0) 0.0 else (((px - ax) * dx + (py - ay) * dy) / lengthSq).coerceIn(0.0, 1.0)
    return hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Shortest distance in km from [p] to a route (polyline). Empty or missing route → +∞. */
fun distanceToRouteKm(p: LatLng, route: List<LatLng>?): Double {
    if (route.isNullOrEmpty()) return Double.POSITIVE_INFINITY
    if (route.size == 1) return distanceKm(p, route[0])
    var min = Double.POSITIVE_INFINITY
    for (i in 0 until route.size - 1) {
        min = minOf(min, distanceToSegmentKm(p, route[i], route[i + 1]))
    }
    return min
}
