package es.gasolineras.ui.text

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import es.gasolineras.R
import es.gasolineras.core.domain.AppError
import es.gasolineras.core.domain.AppErrorCode
import es.gasolineras.core.domain.FuelType
import es.gasolineras.state.Status
import es.gasolineras.state.UserError

@StringRes
fun FuelType.label(): Int = when (this) {
    FuelType.GASOLEO_A -> R.string.fuel_GASOLEO_A
    FuelType.GASOLEO_PREMIUM -> R.string.fuel_GASOLEO_PREMIUM
    FuelType.GASOLINA_95 -> R.string.fuel_GASOLINA_95
    FuelType.GASOLINA_98 -> R.string.fuel_GASOLINA_98
    FuelType.GLP -> R.string.fuel_GLP
    FuelType.GNC -> R.string.fuel_GNC
    FuelType.GNL -> R.string.fuel_GNL
}

/** Text for a temporary status; null for [Status.Ready] (the screen shows its summary instead). */
@Composable
fun statusText(status: Status): String? = when (status) {
    Status.Locating -> stringResource(R.string.status_locating)
    Status.LocatingGps -> stringResource(R.string.status_locating_gps)
    Status.NoGeolocation -> stringResource(R.string.status_no_geolocation)
    Status.NoLocationYet -> stringResource(R.string.status_no_location_yet)
    Status.Waiting -> stringResource(R.string.status_waiting)
    Status.FindingProvince -> stringResource(R.string.status_finding_province)
    is Status.DownloadingProvince -> stringResource(R.string.status_downloading_province, status.code)
    Status.SearchingAddress -> stringResource(R.string.status_searching_address)
    Status.CalculatingRoute -> stringResource(R.string.status_calculating_route)
    Status.Ready -> null
}

/** Why something failed, in the user's language (the web app's `errors.*`). */
@Composable
fun reasonText(cause: Throwable?): String {
    val error = cause as? AppError ?: return cause?.message ?: stringResource(R.string.reason_download_failed)
    return when (error.code) {
        AppErrorCode.DOWNLOAD_FAILED -> stringResource(R.string.reason_download_failed)
        AppErrorCode.TIMEOUT -> stringResource(R.string.reason_timeout)
        AppErrorCode.HTTP -> stringResource(R.string.reason_http, error.params["status"].toString())
        AppErrorCode.GEOLOCATION_UNAVAILABLE -> stringResource(R.string.reason_geolocation_unavailable)
        AppErrorCode.GEOLOCATION_DENIED -> stringResource(R.string.reason_geolocation_denied)
        AppErrorCode.GEOLOCATION_TIMEOUT -> stringResource(R.string.reason_geolocation_timeout)
    }
}

@Composable
fun errorText(error: UserError): String = when (error) {
    is UserError.Gps -> stringResource(R.string.error_gps, reasonText(error.cause))
    is UserError.Province -> stringResource(R.string.error_province, reasonText(error.cause))
    UserError.ProvinceUnknown -> stringResource(R.string.error_province_unknown)
    UserError.AddressNotFound -> stringResource(R.string.error_address_not_found)
    UserError.DestinationNotFound -> stringResource(R.string.error_destination_not_found)
    UserError.OriginFirst -> stringResource(R.string.error_origin_first)
    UserError.RouteNotFound -> stringResource(R.string.error_route_not_found)
    is UserError.Route -> stringResource(R.string.error_route, reasonText(error.cause))
    is UserError.Generic -> stringResource(R.string.error_generic, reasonText(error.cause))
}
