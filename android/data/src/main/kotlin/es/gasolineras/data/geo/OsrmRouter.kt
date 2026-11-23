package es.gasolineras.data.geo

import es.gasolineras.core.domain.AppError
import es.gasolineras.core.domain.AppErrorCode
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.RouteProbe
import es.gasolineras.data.Endpoints
import es.gasolineras.data.http.HttpClient
import es.gasolineras.data.http.getJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.max

interface Router {
    /** Driving route as a polyline, or null if no route was found. */
    suspend fun route(from: LatLng, to: LatLng): List<LatLng>?

    /**
     * For each probe, how much longer (km) driving before → station → after is than before → after:
     * the real detour to the station. [Double.POSITIVE_INFINITY] when the station can't be reached.
     * Throws if the router fails.
     */
    suspend fun extraDistances(probes: List<RouteProbe>): List<Double>
}

/** Stations checked per table request (3 points each; the public server allows about 100). */
const val TABLE_BATCH = 30

/** OSRM driving routes and distance tables (public demo server). Port of services/routing.ts. */
class OsrmRouter(private val http: HttpClient) : Router {
    override suspend fun route(from: LatLng, to: LatLng): List<LatLng>? {
        val url = "${Endpoints.OSRM_ROUTE}${jsNumber(from.lon)},${jsNumber(from.lat)};${jsNumber(to.lon)},${jsNumber(to.lat)}" +
            "?overview=full&geometries=geojson"
        // OSRM explains failures ("NoRoute", …) in a JSON body with a 4xx status.
        val data = http.getJson(url, allowHttpErrors = true) as JsonObject
        val route = (data["routes"] as? JsonArray)?.firstOrNull() as? JsonObject
        if ((data["code"] as? JsonPrimitive)?.content != "Ok" || route == null) return null
        return route["geometry"]!!.jsonObject["coordinates"]!!.jsonArray.map { point ->
            val (lon, lat) = point.jsonArray.map { it.jsonPrimitive.double }
            LatLng(lat, lon)
        }
    }

    // One request at a time: the public server asks for gentle use.
    override suspend fun extraDistances(probes: List<RouteProbe>): List<Double> =
        probes.chunked(TABLE_BATCH).flatMap { batch(it) }

    /** One table request: for probe k, points 3k (before), 3k+1 (station), 3k+2 (after). */
    private suspend fun batch(probes: List<RouteProbe>): List<Double> {
        val points = probes.flatMap { listOf(it.before, it.station, it.after) }
        val sources = probes.indices.flatMap { listOf(3 * it, 3 * it + 1) }.joinToString(";")
        val destinations = probes.indices.flatMap { listOf(3 * it + 1, 3 * it + 2) }.joinToString(";")
        val url = Endpoints.OSRM_TABLE + points.joinToString(";") { "${jsNumber(it.lon)},${jsNumber(it.lat)}" } +
            "?sources=$sources&destinations=$destinations&annotations=distance"
        val data = http.getJson(url, allowHttpErrors = true) as JsonObject
        val rows = data["distances"] as? JsonArray
        if ((data["code"] as? JsonPrimitive)?.content != "Ok" || rows == null) throw AppError(AppErrorCode.DOWNLOAD_FAILED)
        // Metres; null when there is no route. Rows: 2k = before_k, 2k+1 = station_k. Columns: 2k = station_k, 2k+1 = after_k.
        fun at(row: Int, col: Int): Double? = ((rows.getOrNull(row) as? JsonArray)?.getOrNull(col) as? JsonPrimitive)
            ?.takeUnless { it is JsonNull }?.doubleOrNull
        return probes.indices.map { k ->
            val toStation = at(2 * k, 2 * k)
            val straight = at(2 * k, 2 * k + 1)
            val fromStation = at(2 * k + 1, 2 * k + 1)
            if (toStation == null || straight == null || fromStation == null) {
                Double.POSITIVE_INFINITY
            } else {
                max(0.0, toStation + fromStation - straight) / 1000
            }
        }
    }
}
