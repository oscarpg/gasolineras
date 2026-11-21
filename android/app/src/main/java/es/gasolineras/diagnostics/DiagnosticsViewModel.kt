package es.gasolineras.diagnostics

import android.app.Application
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import es.gasolineras.BuildConfig
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.util.Locale

class DiagnosticsViewModel(application: Application) : AndroidViewModel(application) {
    private val network = NetworkProbes()
    private val locationProbe = LocationProbe(application)

    val device = DeviceInfo(
        manufacturer = Build.MANUFACTURER,
        model = Build.MODEL,
        androidRelease = Build.VERSION.RELEASE,
        sdkInt = Build.VERSION.SDK_INT,
        locale = Locale.getDefault().toLanguageTag(),
        appVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
    )

    var networkRunning by mutableStateOf(false)
        private set
    var miteco by mutableStateOf<MitecoProbeResult?>(null)
        private set
    var tiles by mutableStateOf<HttpProbeResult?>(null)
        private set
    var locationRunning by mutableStateOf(false)
        private set
    var location by mutableStateOf<LocationProbeResult?>(null)
        private set
    var mapResult by mutableStateOf<Pair<Int, FrameStats>?>(null)
        private set

    /** Real stations from the MITECO probe, or a synthetic set around Madrid. */
    val mapStations: List<ProbeStation>
        get() = miteco?.stations?.takeIf { it.size >= MIN_REAL_STATIONS } ?: syntheticStations()

    val report: String
        get() = DiagnosticsReport.full(device, miteco, tiles, location, mapResult)

    fun runNetwork() {
        if (networkRunning) return
        networkRunning = true
        viewModelScope.launch {
            val mitecoJob = async { network.miteco() }
            val tilesJob = async { network.mapTiles() }
            miteco = mitecoJob.await()
            tiles = tilesJob.await()
            networkRunning = false
        }
    }

    fun runLocation() {
        if (locationRunning) return
        locationRunning = true
        viewModelScope.launch {
            location = locationProbe.run()
            locationRunning = false
        }
    }

    fun onMapTestFinished(markers: Int, stats: FrameStats) {
        mapResult = markers to stats
    }

    private companion object {
        const val MIN_REAL_STATIONS = 200
        const val SYNTHETIC_COUNT = 1_500

        fun syntheticStations(): List<ProbeStation> {
            val random = java.util.Random(28)
            return List(SYNTHETIC_COUNT) { i ->
                ProbeStation(
                    id = "synthetic-$i",
                    name = "Test $i",
                    lat = 40.42 + random.nextGaussian() * 0.25,
                    lon = -3.70 + random.nextGaussian() * 0.35,
                    price = 1.40 + random.nextDouble() * 0.40,
                )
            }
        }
    }
}
