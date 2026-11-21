package es.gasolineras.core.domain

import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min

/**
 * Simplified outlines of Spain's 52 provinces (es-atlas, from IGN data — CC BY 4.0,
 * © Instituto Geográfico Nacional de España). Used to load every province whose stations can be
 * within the search radius or along a route, not just the one the user is in.
 *
 * The outlines are simplified (~200 m quantisation, some more smoothing), so callers add a margin.
 */
class ProvinceShapes private constructor(private val provinces: List<Province>) {

    private class Province(val code: String, val rings: List<List<LatLng>>) {
        val minLat = rings.minOf { r -> r.minOf { it.lat } }
        val maxLat = rings.maxOf { r -> r.maxOf { it.lat } }
        val minLon = rings.minOf { r -> r.minOf { it.lon } }
        val maxLon = rings.maxOf { r -> r.maxOf { it.lon } }

        /** Cheap rejection: is [p] farther than [km] from the bounding box? */
        fun boxFartherThan(p: LatLng, km: Double): Boolean {
            val dLat = km / KM_PER_DEGREE
            val dLon = km / (KM_PER_DEGREE * max(0.1, cos(Math.toRadians(p.lat))))
            return p.lat < minLat - dLat || p.lat > maxLat + dLat || p.lon < minLon - dLon || p.lon > maxLon + dLon
        }

        /** Even-odd rule over all rings (handles holes and islands). */
        fun contains(p: LatLng): Boolean {
            if (p.lat < minLat || p.lat > maxLat || p.lon < minLon || p.lon > maxLon) return false
            var inside = false
            for (ring in rings) {
                var j = ring.size - 1
                for (i in ring.indices) {
                    val a = ring[i]
                    val b = ring[j]
                    if ((a.lat > p.lat) != (b.lat > p.lat) &&
                        p.lon < (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon
                    ) {
                        inside = !inside
                    }
                    j = i
                }
            }
            return inside
        }

        /** Distance from [p] to the outline in km (0 inside). */
        fun distanceKm(p: LatLng): Double {
            if (contains(p)) return 0.0
            var best = Double.POSITIVE_INFINITY
            for (ring in rings) {
                for (i in 0 until ring.size - 1) best = min(best, distanceToSegmentKm(p, ring[i], ring[i + 1]))
            }
            return best
        }
    }

    val codes: List<String> get() = provinces.map { it.code }

    /** The province containing [p], or null (sea, Portugal, France…). */
    fun provinceAt(p: LatLng): String? = provinces.firstOrNull { it.contains(p) }?.code

    /** Provinces with some part within [radiusKm] of [p], nearest first. */
    fun provincesWithin(p: LatLng, radiusKm: Double): List<String> =
        provinces.asSequence()
            .filterNot { it.boxFartherThan(p, radiusKm) }
            .map { it.code to it.distanceKm(p) }
            .filter { it.second <= radiusKm }
            .sortedBy { it.second }
            .map { it.first }
            .toList()

    /**
     * Provinces with some part within [detourKm] of [route], in the order the route meets them.
     * The route is sampled every [stepKm]; the step is added to the margin so nothing is missed.
     */
    fun provincesAlongRoute(route: List<LatLng>, detourKm: Double, stepKm: Double = 2.0): List<String> {
        if (route.isEmpty()) return emptyList()
        val result = LinkedHashSet<String>()
        var sinceLast = Double.POSITIVE_INFINITY
        var previous: LatLng? = null
        for (point in route) {
            previous?.let { sinceLast += distanceKm(it, point) }
            previous = point
            if (sinceLast >= stepKm || point == route.last()) {
                sinceLast = 0.0
                result += provincesWithin(point, detourKm + stepKm)
            }
        }
        return result.toList()
    }

    companion object {
        private const val KM_PER_DEGREE = 111.32

        /** Parses `code|lon,lat;lon,lat;...|ring...` lines; `#` lines are comments. */
        fun parse(text: String): ProvinceShapes = ProvinceShapes(
            text.lineSequence()
                .map { it.trim() }
                .filter { it.isNotEmpty() && !it.startsWith("#") }
                .map { line ->
                    val parts = line.split('|')
                    Province(
                        code = parts[0],
                        rings = parts.drop(1).map { ring ->
                            ring.split(';').map { pair ->
                                val (lon, lat) = pair.split(',')
                                LatLng(lat.toDouble(), lon.toDouble())
                            }
                        },
                    )
                }
                .toList(),
        )

        /** The bundled outlines (loaded once, ~170 kB). */
        val bundled: ProvinceShapes by lazy {
            val stream = requireNotNull(ProvinceShapes::class.java.getResourceAsStream("/es/gasolineras/core/provinces.txt")) {
                "provinces.txt missing from :core resources"
            }
            parse(stream.bufferedReader(Charsets.UTF_8).use { it.readText() })
        }
    }
}
