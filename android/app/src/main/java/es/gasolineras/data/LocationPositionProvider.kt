package es.gasolineras.data

import es.gasolineras.core.domain.AppError
import es.gasolineras.core.domain.AppErrorCode
import es.gasolineras.core.domain.LatLng
import es.gasolineras.state.PositionProvider

/** [PositionProvider] over [LocationRepository], with the web app's error codes. */
class LocationPositionProvider(private val location: LocationRepository) : PositionProvider {
    override fun isAvailable() = true

    override suspend fun currentPosition(): LatLng {
        if (!location.hasAnyLocation()) throw AppError(AppErrorCode.GEOLOCATION_DENIED)
        return location.currentLocation() ?: throw AppError(AppErrorCode.GEOLOCATION_UNAVAILABLE)
    }
}
