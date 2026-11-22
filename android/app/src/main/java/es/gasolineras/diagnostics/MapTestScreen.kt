package es.gasolineras.diagnostics

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import es.gasolineras.R
import es.gasolineras.map.api.CameraTarget
import es.gasolineras.map.api.GeoPoint
import es.gasolineras.map.api.MapContent
import es.gasolineras.map.api.MapMarker
import es.gasolineras.map.api.MapRenderer
import kotlinx.coroutines.delay
import java.util.Locale

/** Draws every station and flies the camera around while counting frames. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapTestScreen(
    renderer: MapRenderer,
    stations: List<ProbeStation>,
    onFinished: (markers: Int, stats: FrameStats) -> Unit,
    onBack: () -> Unit,
) {
    val markers = remember(stations) { stations.toMarkers() }
    val tour = remember(stations) { cameraTour(stations) }
    var camera by remember { mutableStateOf(tour.first()) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<FrameStats?>(null) }
    val currentOnFinished by rememberUpdatedState(onFinished)

    LaunchedEffect(tour) {
        delay(STYLE_LOAD_GRACE_MS)
        val meter = FrameMeter()
        meter.start()
        for (target in tour.drop(1)) {
            camera = target
            delay(STEP_MS)
        }
        val stats = meter.stop()
        result = stats
        currentOnFinished(markers.size, stats)
    }

    val content = remember(markers, selectedId) {
        MapContent(markers = markers, selectedId = selectedId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.map_test_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.navigate_back))
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding())) {
            renderer.Map(
                content = content,
                camera = camera,
                darkTheme = isSystemInDarkTheme(),
                onMarkerClick = { selectedId = it },
                onCameraIdle = {},
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(0.dp),
            )
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(16.dp)
                    .fillMaxWidth(),
                shape = MaterialTheme.shapes.large,
                tonalElevation = 3.dp,
                shadowElevation = 3.dp,
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        stringResource(if (result == null) R.string.map_test_running else R.string.map_test_done),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        stringResource(R.string.map_test_markers, markers.size),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    result?.let {
                        Text(DiagnosticsReport.map(markers.size, it), style = MaterialTheme.typography.bodySmall)
                    }
                    selectedId?.let { id ->
                        stations.firstOrNull { it.id == id }?.let { s ->
                            Text(
                                listOfNotNull(s.name, s.price?.let { p -> String.format(Locale.ROOT, "%.3f €/l", p) })
                                    .joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
    }
}

private const val STYLE_LOAD_GRACE_MS = 3_000L
private const val STEP_MS = 1_500L

private fun List<ProbeStation>.toMarkers(): List<MapMarker> {
    val prices = mapNotNull { it.price }
    val min = prices.minOrNull() ?: 0.0
    val max = prices.maxOrNull() ?: 0.0
    return map { s ->
        MapMarker(
            id = s.id,
            position = GeoPoint(s.lat, s.lon),
            label = s.price?.let { String.format(Locale.ROOT, "%.3f", it) }.orEmpty(),
            color = priceColor(s.price, min, max),
        )
    }
}

/** Green (cheapest) → red (most expensive), like the web app's colour scale. */
private fun priceColor(price: Double?, min: Double, max: Double): Color {
    if (price == null) return Color.Gray
    val t = if (max > min) ((price - min) / (max - min)).toFloat() else 0f
    return Color.hsl(hue = 120f * (1f - t), saturation = 0.7f, lightness = 0.42f)
}

private fun cameraTour(stations: List<ProbeStation>): List<CameraTarget> {
    val lat = stations.map { it.lat }.average().takeIf { !it.isNaN() } ?: 40.42
    val lon = stations.map { it.lon }.average().takeIf { !it.isNaN() } ?: -3.70
    fun at(dLat: Double, dLon: Double, zoom: Double) = CameraTarget(GeoPoint(lat + dLat, lon + dLon), zoom)
    return listOf(
        at(0.0, 0.0, 10.0),
        at(0.0, 0.0, 12.0),
        at(0.08, 0.10, 13.5),
        at(-0.10, -0.08, 12.5),
        at(0.0, 0.0, 9.0),
        at(0.05, -0.12, 11.0),
        at(0.0, 0.0, 10.0),
    )
}
