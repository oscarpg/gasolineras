package es.gasolineras.data.geo

import es.gasolineras.core.domain.LatLng
import es.gasolineras.data.Endpoints
import es.gasolineras.data.http.HttpClient
import es.gasolineras.data.http.getJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

interface Router {
    /** Driving route as a polyline, or null if no route was found. */
    suspend fun route(from: LatLng, to: LatLng): List<LatLng>?
}

/** OSRM driving routes (public demo server). Port of services/routing.ts. */
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
}
