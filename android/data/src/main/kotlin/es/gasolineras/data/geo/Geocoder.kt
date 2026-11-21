package es.gasolineras.data.geo

import es.gasolineras.core.domain.LatLng
import kotlinx.coroutines.CancellationException

data class GeocodeResult(
    val latLng: LatLng,
    /** 2-digit province code, or null if it couldn't be worked out. */
    val provinceCode: String?,
)

interface Geocoder {
    /** First match for a free-text address, or null if nothing was found. */
    suspend fun search(query: String): GeocodeResult?

    /** Province code for a position, or null if unknown. */
    suspend fun reverseProvince(position: LatLng): String?
}

/**
 * Tries [primary] (the phone's own geocoder: no network policy to respect) and falls back to
 * [secondary] (Nominatim) when it fails or finds nothing.
 */
class FallbackGeocoder(private val primary: Geocoder, private val secondary: Geocoder) : Geocoder {
    override suspend fun search(query: String): GeocodeResult? =
        attempt { primary.search(query) }?.takeIf { it.provinceCode != null } ?: secondary.search(query)

    override suspend fun reverseProvince(position: LatLng): String? =
        attempt { primary.reverseProvince(position) } ?: secondary.reverseProvince(position)

    private suspend fun <T> attempt(block: suspend () -> T?): T? = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }
}
