package es.gasolineras.diagnostics

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

data class LocationProbeResult(
    /** "fine", "approximate" or "denied". */
    val permission: String,
    val playServices: String,
    val ok: Boolean,
    val elapsedMs: Long = 0,
    val accuracyM: Float? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val error: String? = null,
)

class LocationProbe(private val context: Context) {

    fun permissionLevel(): String = when {
        granted(Manifest.permission.ACCESS_FINE_LOCATION) -> "fine"
        granted(Manifest.permission.ACCESS_COARSE_LOCATION) -> "approximate"
        else -> "denied"
    }

    @SuppressLint("MissingPermission") // checked by permissionLevel()
    suspend fun run(): LocationProbeResult {
        val permission = permissionLevel()
        val playServices = when (val code = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)) {
            ConnectionResult.SUCCESS -> "available"
            else -> "unavailable (code $code)"
        }
        if (permission == "denied") return LocationProbeResult(permission, playServices, ok = false, error = "permission denied")

        val client = LocationServices.getFusedLocationProviderClient(context)
        val priority = if (permission == "fine") Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY
        val start = System.nanoTime()
        val tokenSource = CancellationTokenSource()
        val outcome = withTimeoutOrNull(LOCATION_TIMEOUT_MS) {
            suspendCancellableCoroutine<Result<Location?>> { cont ->
                cont.invokeOnCancellation { tokenSource.cancel() }
                client.getCurrentLocation(priority, tokenSource.token)
                    .addOnSuccessListener { cont.resume(Result.success(it)) }
                    .addOnFailureListener { cont.resume(Result.failure(it)) }
            }
        }
        val elapsed = (System.nanoTime() - start) / 1_000_000
        val location = outcome?.getOrNull()
        return when {
            outcome == null -> LocationProbeResult(permission, playServices, false, elapsed, error = "timeout")
            outcome.isFailure -> LocationProbeResult(
                permission, playServices, false, elapsed,
                error = outcome.exceptionOrNull()?.let { "${it.javaClass.simpleName}: ${it.message}" },
            )
            location == null -> LocationProbeResult(permission, playServices, false, elapsed, error = "no location (GPS off?)")
            else -> LocationProbeResult(
                permission, playServices, true, elapsed,
                accuracyM = location.accuracy, lat = location.latitude, lon = location.longitude,
            )
        }
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private companion object {
        const val LOCATION_TIMEOUT_MS = 30_000L
    }
}
