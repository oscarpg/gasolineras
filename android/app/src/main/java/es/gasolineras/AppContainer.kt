package es.gasolineras

import android.content.Context
import es.gasolineras.data.AndroidGeocoder
import es.gasolineras.data.LocationRepository
import es.gasolineras.data.geo.FallbackGeocoder
import es.gasolineras.data.geo.Geocoder
import es.gasolineras.data.geo.NominatimGeocoder
import es.gasolineras.data.geo.OsrmRouter
import es.gasolineras.data.geo.Router
import es.gasolineras.data.http.HttpClient
import es.gasolineras.data.http.OkHttpHttpClient
import es.gasolineras.data.miteco.MitecoRepository
import es.gasolineras.data.prefs.PreferencesStore
import es.gasolineras.data.storage.Cache
import es.gasolineras.data.storage.FileStorage
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.TimeUnit

/** Builds the app's long-lived objects once (manual DI; moves to Hilt in Phase 3). */
class AppContainer(context: Context) {
    private val app = context.applicationContext

    val http: HttpClient = OkHttpHttpClient(
        client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build(),
        // Nominatim's usage policy asks for an identifying User-Agent.
        userAgent = "Gasolineras-Android/${BuildConfig.VERSION_NAME} (+https://oscarpg.github.io/gasolineras/)",
        timeoutMs = 60_000,
    )

    /** Downloaded prices: in cacheDir (the system may clear it), capped at 30 MB. */
    val cache = Cache(FileStorage(File(app.cacheDir, "data-cache"), maxBytes = 30L * 1024 * 1024), namespace = "v1:")

    val miteco = MitecoRepository(http, cache)

    val nominatim = NominatimGeocoder(http)
    val phoneGeocoder = AndroidGeocoder(app)
    val geocoder: Geocoder = FallbackGeocoder(phoneGeocoder, nominatim)
    val router: Router = OsrmRouter(http)

    /** User choices: in filesDir (kept until uninstall). */
    val preferences = PreferencesStore(FileStorage(File(app.filesDir, "preferences")))

    val location = LocationRepository(app)
}
