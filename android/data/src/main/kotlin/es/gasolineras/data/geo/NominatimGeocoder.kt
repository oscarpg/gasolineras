package es.gasolineras.data.geo

import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.provinceCodeFromAddress
import es.gasolineras.data.Endpoints
import es.gasolineras.data.http.HttpClient
import es.gasolineras.data.http.getJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.net.URLEncoder
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/** JavaScript's encodeURIComponent. */
internal fun encodeURIComponent(s: String): String =
    URLEncoder.encode(s, "UTF-8")
        .replace("+", "%20").replace("%21", "!").replace("%27", "'")
        .replace("%28", "(").replace("%29", ")").replace("%7E", "~")

/** JavaScript's Number#toString for coordinates (no trailing ".0"). */
internal fun jsNumber(d: Double): String = if (d == Math.floor(d) && !d.isInfinite()) d.toLong().toString() else d.toString()

private fun JsonElement?.content(): String? = (this as? JsonPrimitive)?.content

private fun provinceOf(place: JsonObject): String? {
    val address = place["address"] as? JsonObject ?: return provinceCodeFromAddress()
    return provinceCodeFromAddress(
        postcode = address["postcode"].content(),
        province = address["province"].content(),
        state = address["state"].content(),
    )
}

/**
 * Nominatim (OpenStreetMap) geocoding. Port of services/geocoding.ts.
 * Successful answers are cached in memory for the session; failures are not cached.
 */
class NominatimGeocoder(
    private val http: HttpClient,
    /** Shared queue that keeps requests ≥1 s apart (Nominatim usage policy). */
    private val limiter: RateLimiter = RateLimiter(1000),
) : Geocoder {
    private val searches = ConcurrentHashMap<String, Result<GeocodeResult?>>()
    private val reverses = ConcurrentHashMap<String, Result<String?>>()

    override suspend fun search(query: String): GeocodeResult? {
        val key = query.trim().lowercase()
        searches[key]?.let { return it.getOrNull() }
        val places = limiter.schedule { http.getJson(Endpoints.NOMINATIM_SEARCH + encodeURIComponent(query)) } as JsonArray
        val first = places.firstOrNull() as? JsonObject
        val result = first?.let {
            GeocodeResult(LatLng(it["lat"].content()!!.toDouble(), it["lon"].content()!!.toDouble()), provinceOf(it))
        }
        searches[key] = Result.success(result)
        return result
    }

    override suspend fun reverseProvince(position: LatLng): String? {
        // ~10 m grid: GPS jitter doesn't trigger new requests
        val key = String.format(Locale.ROOT, "%.4f,%.4f", position.lat, position.lon)
        reverses[key]?.let { return it.getOrNull() }
        val place = limiter.schedule {
            http.getJson("${Endpoints.NOMINATIM_REVERSE}&lat=${jsNumber(position.lat)}&lon=${jsNumber(position.lon)}")
        } as JsonObject
        val code = provinceOf(place)
        reverses[key] = Result.success(code)
        return code
    }
}
