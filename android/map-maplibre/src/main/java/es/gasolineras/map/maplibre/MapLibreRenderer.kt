package es.gasolineras.map.maplibre

import androidx.compose.foundation.layout.PaddingValues
import android.graphics.RectF
import androidx.compose.runtime.Composable
import kotlin.math.hypot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import es.gasolineras.map.api.CameraTarget
import es.gasolineras.map.api.GeoPoint
import es.gasolineras.map.api.MapContent
import es.gasolineras.map.api.MapMarker
import es.gasolineras.map.api.MapRenderer
import es.gasolineras.map.api.MapStyle
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression.get
import org.maplibre.android.style.expressions.Expression.toColor
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.lineCap
import org.maplibre.android.style.layers.PropertyFactory.lineColor
import org.maplibre.android.style.layers.PropertyFactory.lineJoin
import org.maplibre.android.style.layers.PropertyFactory.lineWidth
import org.maplibre.android.style.layers.PropertyFactory.textColor
import org.maplibre.android.style.layers.PropertyFactory.textField
import org.maplibre.android.style.layers.PropertyFactory.textFont
import org.maplibre.android.style.layers.PropertyFactory.textHaloColor
import org.maplibre.android.style.layers.PropertyFactory.textHaloWidth
import org.maplibre.android.style.layers.PropertyFactory.textOffset
import org.maplibre.android.style.layers.PropertyFactory.textOptional
import org.maplibre.android.style.layers.PropertyFactory.textSize
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point

/** OpenFreeMap vector styles: free, no API key. Swap these to change tile provider. */
val OpenFreeMapStyle = MapStyle(
    styleUrl = "https://tiles.openfreemap.org/styles/liberty",
    darkStyleUrl = "https://tiles.openfreemap.org/styles/dark",
)

/**
 * [MapRenderer] backed by MapLibre Native. The only class in the project that knows MapLibre.
 * Markers are drawn as a GeoJSON source + circle/symbol layers so thousands stay smooth.
 */
class MapLibreRenderer(private val style: MapStyle = OpenFreeMapStyle) : MapRenderer {

    @Composable
    override fun Map(
        content: MapContent,
        camera: CameraTarget,
        darkTheme: Boolean,
        onMarkerClick: (id: String) -> Unit,
        onCameraIdle: (CameraTarget) -> Unit,
        modifier: Modifier,
        contentPadding: PaddingValues,
    ) {
        val context = LocalContext.current
        val density = LocalDensity.current
        val layoutDirection = LocalLayoutDirection.current
        val mapView = remember {
            MapLibre.getInstance(context)
            MapView(context).apply { onCreate(null) }
        }
        var map by remember { mutableStateOf<MapLibreMap?>(null) }
        var loadedStyle by remember { mutableStateOf<Style?>(null) }
        var cameraInitialised by remember { mutableStateOf(false) }
        val currentOnMarkerClick by rememberUpdatedState(onMarkerClick)
        val currentOnCameraIdle by rememberUpdatedState(onCameraIdle)

        MapViewLifecycle(mapView)

        LaunchedEffect(mapView) {
            mapView.getMapAsync { m ->
                m.uiSettings.isRotateGesturesEnabled = false
                m.uiSettings.isTiltGesturesEnabled = false
                m.addOnMapClickListener { point ->
                    // Fingers are bigger than markers: look around the tap and take the nearest marker.
                    val tap = m.projection.toScreenLocation(point)
                    val r = TAP_RADIUS_DP * density.density
                    val area = RectF(tap.x - r, tap.y - r, tap.x + r, tap.y + r)
                    val id = m.queryRenderedFeatures(area, SELECTED_LAYER, MARKER_LAYER, LABEL_LAYER)
                        .mapNotNull { f ->
                            val p = f.geometry() as? Point ?: return@mapNotNull null
                            val id = f.getStringProperty(PROP_ID) ?: return@mapNotNull null
                            val at = m.projection.toScreenLocation(LatLng(p.latitude(), p.longitude()))
                            id to hypot(at.x - tap.x, at.y - tap.y)
                        }
                        .minByOrNull { it.second }
                        ?.first
                    if (id != null) currentOnMarkerClick(id)
                    id != null
                }
                m.addOnCameraIdleListener {
                    val position = m.cameraPosition
                    val target = position.target ?: return@addOnCameraIdleListener
                    currentOnCameraIdle(CameraTarget(GeoPoint(target.latitude, target.longitude), position.zoom))
                }
                map = m
            }
        }

        val styleUrl = if (darkTheme) style.darkStyleUrl else style.styleUrl
        LaunchedEffect(map, styleUrl) {
            val m = map ?: return@LaunchedEffect
            loadedStyle = null
            m.setStyle(Style.Builder().fromUri(styleUrl)) { s ->
                addLayers(s)
                loadedStyle = s
            }
        }

        // Markers: rebuilt only when the list changes; the GeoJSON is built off the main thread.
        LaunchedEffect(loadedStyle, content.markers) {
            val s = loadedStyle ?: return@LaunchedEffect
            val json = withContext(Dispatchers.Default) { markersGeoJson(content.markers) }
            s.getSourceAs<GeoJsonSource>(MARKER_SOURCE)?.setGeoJson(json)
        }

        // Selection: a one-feature source drawn on top, so selecting never touches the other markers.
        LaunchedEffect(loadedStyle, content.selectedId, content.markers) {
            val s = loadedStyle ?: return@LaunchedEffect
            val selected = content.selectedId?.let { id -> content.markers.firstOrNull { it.id == id } }
            s.getSourceAs<GeoJsonSource>(SELECTED_SOURCE)?.setGeoJson(markersGeoJson(listOfNotNull(selected)))
        }

        LaunchedEffect(loadedStyle, content.route) {
            val s = loadedStyle ?: return@LaunchedEffect
            val route = content.route
            val json = withContext(Dispatchers.Default) {
                FeatureCollection.fromFeatures(
                    listOfNotNull(
                        route?.takeIf { it.size >= 2 }?.let { Feature.fromGeometry(LineString.fromLngLats(it.map { p -> p.toPoint() })) },
                    ),
                ).toJson()
            }
            s.getSourceAs<GeoJsonSource>(ROUTE_SOURCE)?.setGeoJson(json)
        }

        LaunchedEffect(loadedStyle, content.userPosition) {
            val s = loadedStyle ?: return@LaunchedEffect
            s.getSourceAs<GeoJsonSource>(USER_SOURCE)?.setGeoJson(
                FeatureCollection.fromFeatures(listOfNotNull(content.userPosition?.let { Feature.fromGeometry(it.toPoint()) })),
            )
        }

        LaunchedEffect(map, camera, contentPadding) {
            val m = map ?: return@LaunchedEffect
            val padding = with(density) {
                doubleArrayOf(
                    contentPadding.calculateLeftPadding(layoutDirection).toPx().toDouble(),
                    contentPadding.calculateTopPadding().toPx().toDouble(),
                    contentPadding.calculateRightPadding(layoutDirection).toPx().toDouble(),
                    contentPadding.calculateBottomPadding().toPx().toDouble(),
                )
            }
            val position = CameraPosition.Builder()
                .target(LatLng(camera.center.lat, camera.center.lon))
                .zoom(camera.zoom)
                .padding(padding)
                .build()
            if (cameraInitialised) {
                m.animateCamera(CameraUpdateFactory.newCameraPosition(position), CAMERA_ANIMATION_MS)
            } else {
                m.cameraPosition = position
                cameraInitialised = true
            }
        }

        AndroidView(factory = { mapView }, modifier = modifier)
    }

    private fun addLayers(s: Style) {
        s.addSource(GeoJsonSource(ROUTE_SOURCE))
        s.addLayer(
            LineLayer(ROUTE_LAYER, ROUTE_SOURCE).withProperties(
                lineColor(ROUTE_COLOR),
                lineWidth(5f),
                lineCap(Property.LINE_CAP_ROUND),
                lineJoin(Property.LINE_JOIN_ROUND),
            ),
        )
        s.addSource(GeoJsonSource(MARKER_SOURCE))
        s.addLayer(
            CircleLayer(MARKER_LAYER, MARKER_SOURCE).withProperties(
                circleColor(toColor(get(PROP_COLOR))),
                circleRadius(9f),
                circleStrokeColor("#FFFFFF"),
                circleStrokeWidth(2f),
            ),
        )
        s.addLayer(
            SymbolLayer(LABEL_LAYER, MARKER_SOURCE).withProperties(
                textField(get(PROP_LABEL)),
                textFont(arrayOf("Noto Sans Regular")),
                textSize(12f),
                textOffset(arrayOf(0f, 1.5f)),
                textColor("#202124"),
                textHaloColor("#FFFFFF"),
                textHaloWidth(1.5f),
                textOptional(true),
            ),
        )
        s.addSource(GeoJsonSource(SELECTED_SOURCE))
        s.addLayer(
            CircleLayer(SELECTED_LAYER, SELECTED_SOURCE).withProperties(
                circleColor(toColor(get(PROP_COLOR))),
                circleRadius(12f),
                circleStrokeColor("#FFFFFF"),
                circleStrokeWidth(3f),
            ),
        )
        s.addSource(GeoJsonSource(USER_SOURCE))
        s.addLayer(
            CircleLayer(USER_LAYER, USER_SOURCE).withProperties(
                circleColor(ROUTE_COLOR),
                circleRadius(8f),
                circleStrokeColor("#FFFFFF"),
                circleStrokeWidth(3f),
            ),
        )
    }

    private companion object {
        const val MARKER_SOURCE = "gas-markers"
        const val MARKER_LAYER = "gas-markers-circles"
        const val LABEL_LAYER = "gas-markers-labels"
        const val ROUTE_SOURCE = "gas-route"
        const val ROUTE_LAYER = "gas-route-line"
        const val SELECTED_SOURCE = "gas-selected"
        const val SELECTED_LAYER = "gas-selected-circle"
        const val USER_SOURCE = "gas-user"
        const val USER_LAYER = "gas-user-dot"
        const val ROUTE_COLOR = "#1A73E8"
        const val CAMERA_ANIMATION_MS = 600

        /** How far from the tap (dp) a marker still counts as tapped: about a fingertip. */
        const val TAP_RADIUS_DP = 24f
    }
}

private fun GeoPoint.toPoint(): Point = Point.fromLngLat(lon, lat)

private const val PROP_ID = "id"
private const val PROP_LABEL = "label"
private const val PROP_COLOR = "color"

/** GeoJSON text for markers (built as a string: faster than MapLibre's Feature objects for hundreds of points). */
private fun markersGeoJson(markers: List<MapMarker>): String = buildString(markers.size * 120) {
    append("""{"type":"FeatureCollection","features":[""")
    markers.forEachIndexed { i, m ->
        if (i > 0) append(',')
        append("""{"type":"Feature","geometry":{"type":"Point","coordinates":[""")
        append(m.position.lon).append(',').append(m.position.lat)
        append("""]},"properties":{"id":""").append(jsonString(m.id))
        append(""","label":""").append(jsonString(m.label))
        append(""","color":"""").append(m.color.toHex()).append(""""}}""")
    }
    append("]}")
}

private fun jsonString(s: String): String = buildString(s.length + 2) {
    append('"')
    for (c in s) {
        when {
            c == '"' -> append("\\\"")
            c == '\\' -> append("\\\\")
            c < ' ' -> append(String.format(java.util.Locale.ROOT, "\\u%04x", c.code))
            else -> append(c)
        }
    }
    append('"')
}

private fun Color.toHex(): String = String.format(java.util.Locale.ROOT, "#%06X", 0xFFFFFF and toArgb())

/** Forwards the host lifecycle to the MapView, as MapLibre requires. */
@Composable
private fun MapViewLifecycle(mapView: MapView) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            val state = lifecycle.currentState
            if (state.isAtLeast(Lifecycle.State.RESUMED)) mapView.onPause()
            if (state.isAtLeast(Lifecycle.State.STARTED)) mapView.onStop()
            mapView.onDestroy()
        }
    }
}
