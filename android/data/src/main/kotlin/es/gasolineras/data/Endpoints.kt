package es.gasolineras.data

/** External services used by the app (same as the web app's config/endpoints.ts, minus the CORS relays). */
object Endpoints {
    private const val MITECO_BASE = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes"

    /** Current prices for a province: append the 2-digit province code. */
    const val MITECO_PROVINCE = "$MITECO_BASE/EstacionesTerrestres/FiltroProvincia/"

    /** Historical prices for a province: append `dd-mm-yyyy/<province code>`. */
    const val MITECO_PROVINCE_HISTORY = "$MITECO_BASE/EstacionesTerrestresHist/FiltroProvincia/"

    /** OSRM routing: append `lon,lat;lon,lat?...`. */
    const val OSRM_ROUTE = "https://router.project-osrm.org/route/v1/driving/"

    /** Nominatim forward search: append the URL-encoded query. */
    const val NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q="

    /** Nominatim reverse geocoding: append `&lat=..&lon=..`. */
    const val NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1"
}
