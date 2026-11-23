package es.gasolineras.core.domain

import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/*
 * "Only stations on the route", checked by road. Port of src/domain/routeCheck.ts: keep both in step.
 *
 * Being close to the route line isn't enough: a station 50 m from a motorway can be on a street
 * below it, or in the service area of the other carriageway. So the stations near the line are
 * checked with the router: how much longer is driving from a route point ~2 km before the station,
 * through it, to a route point ~2 km after it, than driving straight on? Stations that add at most
 * 1 km are on the route.
 */

/** Stations this close to the route line (km) are checked by road. */
const val ROUTE_CHECK_CANDIDATE_KM = 0.3

/** At most this much extra driving (km) through the station counts as "on the route". */
const val ROUTE_ONLY_MAX_EXTRA_KM = 1.0

/** How far before and after the station (along the route, km) the check starts and ends. */
const val ROUTE_CHECK_STEP_KM = 2.0

/**
 * Results of the road check for the current route, by station id: the extra km driven through the
 * station, [Double.POSITIVE_INFINITY] if it can't be reached, or null if the check failed (then the
 * straight-line rule applies). A station not in the map wasn't checked yet.
 */
typealias RouteChecks = Map<String, Double?>

/** One station to check: route point before it, the station, route point after it. */
data class RouteProbe(val id: String, val before: LatLng, val station: LatLng, val after: LatLng)

/** A station near the route, waiting to be checked. */
data class RouteCandidate(val id: String, val position: LatLng)

/**
 * Whether a station [lineKm] from the route line counts as on the route.
 * Checked by road ([checked] is true): within the candidate distance and adding at most 1 km.
 * Not checked, or the check failed ([extraKm] null): within [fallbackKm] of the line, as before.
 */
fun isOnRoute(lineKm: Double, checked: Boolean, extraKm: Double?, fallbackKm: Double): Boolean {
    if (!checked || extraKm == null) return lineKm <= fallbackKm
    return lineKm <= ROUTE_CHECK_CANDIDATE_KM && extraKm <= ROUTE_ONLY_MAX_EXTRA_KM
}

/** The stations near enough to the route to check that aren't checked yet. */
fun routeCheckCandidates(stations: List<BrandedStation>, route: List<LatLng>, checks: RouteChecks): List<RouteCandidate> =
    stations.mapNotNull { s ->
        if (s.id in checks) return@mapNotNull null
        val position = s.station.position
        if (distanceToRouteKm(position, route) <= ROUTE_CHECK_CANDIDATE_KM) RouteCandidate(s.id, position) else null
    }

/** The route points [stepKm] before and after where each station meets the route. */
fun routeProbes(route: List<LatLng>, stations: List<RouteCandidate>, stepKm: Double = ROUTE_CHECK_STEP_KM): List<RouteProbe> {
    if (route.isEmpty()) return emptyList()
    val along = DoubleArray(route.size)
    for (i in 1 until route.size) along[i] = along[i - 1] + distanceKm(route[i - 1], route[i])
    val total = along.last()

    /** The point [km] along the route (clamped to its ends). */
    fun pointAt(km: Double): LatLng {
        if (route.size == 1) return route[0]
        val target = min(total, max(0.0, km))
        var i = 1
        while (i < route.size - 1 && along[i] < target) i++
        val a = route[i - 1]
        val b = route[i]
        val length = along[i] - along[i - 1]
        val t = if (length > 0) (target - along[i - 1]) / length else 0.0
        return LatLng(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t)
    }

    /** How far along the route the station's nearest point is (km). */
    fun alongOf(p: LatLng): Double {
        if (route.size == 1) return 0.0
        var best = Double.POSITIVE_INFINITY
        var at = 0.0
        val kx = cos(Math.toRadians(p.lat))
        for (i in 1 until route.size) {
            val a = route[i - 1]
            val b = route[i]
            // Project in a local flat frame (as Geo.kt does) to find where p meets the segment.
            val ax = a.lon * kx
            val ay = a.lat
            val dx = b.lon * kx - ax
            val dy = b.lat - ay
            val px = p.lon * kx
            val py = p.lat
            val lengthSq = dx * dx + dy * dy
            val t = if (lengthSq == 0.0) 0.0 else ((px - ax) * dx + (py - ay) * dy) / lengthSq
            val tc = t.coerceIn(0.0, 1.0)
            val d = hypot(px - (ax + tc * dx), py - (ay + tc * dy))
            if (d < best) {
                best = d
                at = along[i - 1] + tc * (along[i] - along[i - 1])
            }
        }
        return at
    }

    return stations.map { (id, position) ->
        val at = alongOf(position)
        RouteProbe(id, before = pointAt(at - stepKm), station = position, after = pointAt(at + stepKm))
    }
}
