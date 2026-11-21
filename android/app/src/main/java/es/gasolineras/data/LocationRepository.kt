package es.gasolineras.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.tasks.Task
import es.gasolineras.core.domain.LatLng
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** The device position through the fused location provider. */
class LocationRepository(private val context: Context) {
    private val client by lazy { LocationServices.getFusedLocationProviderClient(context) }

    fun hasPreciseLocation() = granted(Manifest.permission.ACCESS_FINE_LOCATION)
    fun hasAnyLocation() = hasPreciseLocation() || granted(Manifest.permission.ACCESS_COARSE_LOCATION)

    /**
     * A fresh fix, or the last known one if no fix arrives within [timeoutMs].
     * Null without permission or when location is off.
     */
    @SuppressLint("MissingPermission") // checked by hasAnyLocation()
    suspend fun currentLocation(timeoutMs: Long = 20_000): LatLng? {
        if (!hasAnyLocation()) return null
        val priority = if (hasPreciseLocation()) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY
        val tokens = CancellationTokenSource()
        val fresh = withTimeoutOrNull(timeoutMs) { client.getCurrentLocation(priority, tokens.token).awaitOrNull(tokens) }
        return (fresh ?: client.lastLocation.awaitOrNull(null))?.let { LatLng(it.latitude, it.longitude) }
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
}

private suspend fun Task<Location?>.awaitOrNull(tokens: CancellationTokenSource?): Location? =
    suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { tokens?.cancel() }
        addOnSuccessListener { cont.resume(it) }
        addOnFailureListener { cont.resume(null) }
        addOnCanceledListener { cont.resume(null) }
    }
