package es.gasolineras.data

import android.content.Context
import android.location.Address
import android.os.Build
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.provinceCodeFromAddress
import es.gasolineras.data.geo.GeocodeResult
import es.gasolineras.data.geo.Geocoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.coroutines.resume
import android.location.Geocoder as PlatformGeocoder

/** The phone's own geocoder (Google Play services on most devices). Returns null when unavailable. */
class AndroidGeocoder(context: Context) : Geocoder {
    private val geocoder = PlatformGeocoder(context, Locale.Builder().setLanguage("es").setRegion("ES").build())

    override suspend fun search(query: String): GeocodeResult? {
        if (!PlatformGeocoder.isPresent()) return null
        val address = fromName(query) ?: return null
        return GeocodeResult(LatLng(address.latitude, address.longitude), provinceOf(address))
    }

    override suspend fun reverseProvince(position: LatLng): String? {
        if (!PlatformGeocoder.isPresent()) return null
        return fromLocation(position)?.let(::provinceOf)
    }

    private fun provinceOf(a: Address): String? =
        provinceCodeFromAddress(postcode = a.postalCode, province = a.subAdminArea, state = a.adminArea)

    private suspend fun fromName(query: String): Address? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            suspendCancellableCoroutine { cont ->
                geocoder.getFromLocationName(query, 1, listener { cont.resume(it) })
            }
        } else {
            withContext(Dispatchers.IO) {
                @Suppress("DEPRECATION")
                geocoder.getFromLocationName(query, 1)?.firstOrNull()
            }
        }

    private suspend fun fromLocation(p: LatLng): Address? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            suspendCancellableCoroutine { cont ->
                geocoder.getFromLocation(p.lat, p.lon, 1, listener { cont.resume(it) })
            }
        } else {
            withContext(Dispatchers.IO) {
                @Suppress("DEPRECATION")
                geocoder.getFromLocation(p.lat, p.lon, 1)?.firstOrNull()
            }
        }

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun listener(done: (Address?) -> Unit) = object : PlatformGeocoder.GeocodeListener {
        override fun onGeocode(addresses: MutableList<Address>) = done(addresses.firstOrNull())
        override fun onError(errorMessage: String?) = done(null)
    }
}
