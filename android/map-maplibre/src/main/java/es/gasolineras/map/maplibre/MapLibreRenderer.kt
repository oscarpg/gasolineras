package es.gasolineras.map.maplibre

import androidx.compose.foundation.layout.PaddingValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
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
import es.gasolineras.map.api.MarkerBadge
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
import org.maplibre.android.style.expressions.Expression.literal
import org.maplibre.android.style.expressions.Expression.step
import org.maplibre.android.style.expressions.Expression.stop
import org.maplibre.android.style.expressions.Expression.toColor
import org.maplibre.android.style.expressions.Expression.zoom
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.iconAllowOverlap
import org.maplibre.android.style.layers.PropertyFactory.iconAnchor
import org.maplibre.android.style.layers.PropertyFactory.iconIgnorePlacement
import org.maplibre.android.style.layers.PropertyFactory.iconImage
import org.maplibre.android.style.layers.PropertyFactory.iconOffset
import org.maplibre.android.style.layers.PropertyFactory.iconPadding
import org.maplibre.android.style.layers.PropertyFactory.iconSize
import org.maplibre.android.style.layers.PropertyFactory.symbolSortKey
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
 *
 * Zoomed in, each marker is a bubble with its brand badge and price, pointing at a dot on the
 * station. Bubble images are drawn only when MapLibre asks for one it's about to lay out (so
 * only for nearby stations), shared by markers that look the same, and dropped when no marker
 * uses them any more. Bubbles that would overlap are hidden, earlier markers first; the dots stay.
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
        // Badges by image key, for drawing bubbles on demand; and the bubble images in the style.
        val badges = remember { HashMap<String, MarkerBadge>() }
        val bubbleImages = remember { HashSet<String>() }

        MapViewLifecycle(mapView)

        LaunchedEffect(mapView) {
            mapView.getMapAsync { m ->
                m.uiSettings.isRotateGesturesEnabled = false
                m.uiSettings.isTiltGesturesEnabled = false
                mapView.addOnStyleImageMissingListener { id ->
                    val s = loadedStyle ?: return@addOnStyleImageMissingListener
                    val bubble = parseBubbleId(id, badges) ?: return@addOnStyleImageMissingListener
                    s.addImage(id, bubbleBitmap(context, bubble))
                    bubbleImages += id
                }
                m.addOnMapClickListener { point ->
                    // Fingers are bigger than markers: look around the tap and take the nearest marker.
                    val tap = m.projection.toScreenLocation(point)
                    val r = TAP_RADIUS_DP * density.density
                    val area = RectF(tap.x - r, tap.y - r, tap.x + r, tap.y + r)
                    val id = m.queryRenderedFeatures(area, SELECTED_BUBBLE_LAYER, SELECTED_LAYER, BUBBLE_LAYER, MARKER_LAYER, LABEL_LAYER)
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
            bubbleImages.clear() // a new style starts without images
            m.setStyle(Style.Builder().fromUri(styleUrl)) { s ->
                addLayers(s)
                loadedStyle = s
            }
        }

        // Markers: rebuilt only when the list changes; the GeoJSON is built off the main thread.
        LaunchedEffect(loadedStyle, content.markers) {
            val s = loadedStyle ?: return@LaunchedEffect
            val markers = content.markers
            val (json, wanted) = withContext(Dispatchers.Default) {
                markersGeoJson(markers) to markers.mapTo(HashSet()) { it.bubbleId() }
            }
            markers.forEach { m -> m.badge?.let { badges[it.key()] = it } }
            // Drop bubbles no marker shows any more (e.g. after prices or filters change).
            bubbleImages.filterNot { it in wanted }.forEach { s.removeImage(it); bubbleImages -= it }
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
                // Zoomed in, a smaller dot that the bubble points at.
                circleRadius(step(zoom(), literal(9f), stop(BUBBLE_MIN_ZOOM, literal(5f)))),
                circleStrokeColor("#FFFFFF"),
                circleStrokeWidth(2f),
            ),
        )
        s.addLayer(
            SymbolLayer(BUBBLE_LAYER, MARKER_SOURCE).withProperties(
                iconImage(get(PROP_BUBBLE)),
                iconAnchor(Property.ICON_ANCHOR_BOTTOM),
                iconOffset(arrayOf(0f, -BUBBLE_LIFT_DP)),
                iconPadding(2f),
                // Earlier markers (the list's order) win when bubbles would overlap.
                symbolSortKey(get(PROP_ORDER)),
            ).apply { minZoom = BUBBLE_MIN_ZOOM },
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
            ).apply { maxZoom = BUBBLE_MIN_ZOOM }, // zoomed in, the price is in the bubble
        )
        s.addSource(GeoJsonSource(SELECTED_SOURCE))
        s.addLayer(
            CircleLayer(SELECTED_LAYER, SELECTED_SOURCE).withProperties(
                circleColor(toColor(get(PROP_COLOR))),
                circleRadius(step(zoom(), literal(12f), stop(BUBBLE_MIN_ZOOM, literal(7f)))),
                circleStrokeColor("#FFFFFF"),
                circleStrokeWidth(3f),
            ),
        )
        s.addLayer(
            SymbolLayer(SELECTED_BUBBLE_LAYER, SELECTED_SOURCE).withProperties(
                iconImage(get(PROP_BUBBLE)),
                iconAnchor(Property.ICON_ANCHOR_BOTTOM),
                iconOffset(arrayOf(0f, -BUBBLE_LIFT_DP)),
                iconSize(SELECTED_SCALE),
                iconAllowOverlap(true),
                iconIgnorePlacement(true),
            ).apply { minZoom = BUBBLE_MIN_ZOOM },
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
        const val BUBBLE_LAYER = "gas-markers-bubbles"
        const val SELECTED_BUBBLE_LAYER = "gas-selected-bubble"
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

        /** From this zoom, markers are bubbles; below it they are plain dots with a price label. */
        const val BUBBLE_MIN_ZOOM = 11f
        /** Gap (dp) between the bubble's tip and the station, so the dot shows. */
        const val BUBBLE_LIFT_DP = 3f
        const val SELECTED_SCALE = 1.15f
    }
}

/** What a bubble shows: its image name encodes all of it, so it can be drawn on demand. */
private class Bubble(val badge: MarkerBadge?, val label: String, val color: Int)

/** Style image key for a badge: equal badges give equal keys. */
private fun MarkerBadge.key(): String =
    if (logo != null) "logo:$logo" else "ini:$initials:${background.toHex()}:${foreground.toHex()}"

/** Style image name for a marker's bubble: markers that look the same share one image. */
private fun MapMarker.bubbleId(): String = "bubble|${badge?.key().orEmpty()}|$label|${color.toHex()}"

private fun parseBubbleId(id: String, badges: Map<String, MarkerBadge>): Bubble? {
    val parts = id.split('|')
    if (parts.size != 4 || parts[0] != "bubble") return null
    val color = runCatching { android.graphics.Color.parseColor(parts[3]) }.getOrNull() ?: return null
    return Bubble(badges[parts[1]], parts[2], color)
}

/**
 * A rounded box with the brand badge and the price on a darker shade of the price colour,
 * bordered in the price colour, with a pointer at the bottom centre (the icon's anchor).
 */
private fun bubbleBitmap(context: Context, bubble: Bubble): Bitmap {
    val metrics = context.resources.displayMetrics
    val dp = metrics.density
    val fontScale = context.resources.configuration.fontScale.coerceIn(1f, 1.3f)

    val pad = 3 * dp
    val border = 2 * dp
    val badgeSize = BADGE_DP * dp
    val gap = 5 * dp
    val pointerH = 8 * dp
    val pointerW = 14 * dp

    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        textSize = 15 * dp * fontScale
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
    }
    val chipW = text.measureText(bubble.label) + 14 * dp
    val chipH = maxOf(24 * dp, text.textSize + 8 * dp)
    val boxH = maxOf(badgeSize, chipH) + 2 * pad
    val badgeW = if (bubble.badge != null) badgeSize + gap else 0f
    val boxW = pad + badgeW + chipW + pad

    val width = kotlin.math.ceil(boxW + 2).toInt()
    val height = kotlin.math.ceil(boxH + pointerH + 2).toInt()
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { density = metrics.densityDpi }
    val canvas = Canvas(bitmap)
    canvas.translate(1f, 1f) // room for anti-aliased edges

    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    // Pointer, then the box over its base.
    paint.color = bubble.color
    canvas.drawPath(
        Path().apply {
            moveTo(boxW / 2 - pointerW / 2, boxH - border)
            lineTo(boxW / 2 + pointerW / 2, boxH - border)
            lineTo(boxW / 2, boxH + pointerH)
            close()
        },
        paint,
    )
    val box = RectF(border / 2, border / 2, boxW - border / 2, boxH - border / 2)
    paint.color = android.graphics.Color.WHITE
    canvas.drawRoundRect(box, boxH / 2, boxH / 2, paint)
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = border
    paint.color = bubble.color
    canvas.drawRoundRect(box, boxH / 2, boxH / 2, paint)
    paint.style = Paint.Style.FILL

    bubble.badge?.let { drawBadge(context, canvas, it, pad, (boxH - badgeSize) / 2, badgeSize) }

    val chip = RectF(pad + badgeW, (boxH - chipH) / 2, pad + badgeW + chipW, (boxH + chipH) / 2)
    paint.color = darker(bubble.color)
    canvas.drawRoundRect(chip, chipH / 2, chipH / 2, paint)
    canvas.drawText(bubble.label, chip.centerX(), chip.centerY() - (text.descent() + text.ascent()) / 2, text)
    return bitmap
}

/** A round badge at ([left], [top]): the logo on white, or the initials on the brand colour. */
private fun drawBadge(context: Context, canvas: Canvas, badge: MarkerBadge, left: Float, top: Float, size: Float) {
    val radius = size / 2
    val cx = left + radius
    val cy = top + radius
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val logo = badge.logo?.let { context.getDrawable(it) }
    if (logo != null) {
        paint.color = android.graphics.Color.WHITE
        canvas.drawCircle(cx, cy, radius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = size / 28
        paint.color = 0x33000000
        canvas.drawCircle(cx, cy, radius - paint.strokeWidth / 2, paint)
        // Inset so a square logo's corners stay inside the circle.
        val inset = size * LOGO_INSET
        logo.setBounds((left + inset).toInt(), (top + inset).toInt(), (left + size - inset).toInt(), (top + size - inset).toInt())
        logo.draw(canvas)
    } else {
        paint.color = badge.background.toArgb()
        canvas.drawCircle(cx, cy, radius, paint)
        paint.color = badge.foreground.toArgb()
        paint.textSize = size * 0.42f
        paint.typeface = Typeface.DEFAULT_BOLD
        paint.textAlign = Paint.Align.CENTER
        canvas.drawText(badge.initials, cx, cy - (paint.descent() + paint.ascent()) / 2, paint)
    }
}

/** A darker shade of [color], dark enough for white text on it. */
private fun darker(color: Int): Int {
    val hsv = FloatArray(3)
    android.graphics.Color.colorToHSV(color, hsv)
    hsv[2] *= 0.62f
    return android.graphics.Color.HSVToColor(hsv)
}

/** Size (dp) of the brand badge inside a bubble. */
private const val BADGE_DP = 28f
private const val LOGO_INSET = 0.13f

private fun GeoPoint.toPoint(): Point = Point.fromLngLat(lon, lat)

private const val PROP_ID = "id"
private const val PROP_LABEL = "label"
private const val PROP_COLOR = "color"
private const val PROP_BUBBLE = "bubble"
private const val PROP_ORDER = "order"

/** GeoJSON text for markers (built as a string: faster than MapLibre's Feature objects for hundreds of points). */
private fun markersGeoJson(markers: List<MapMarker>): String = buildString(markers.size * 120) {
    append("""{"type":"FeatureCollection","features":[""")
    markers.forEachIndexed { i, m ->
        if (i > 0) append(',')
        append("""{"type":"Feature","geometry":{"type":"Point","coordinates":[""")
        append(m.position.lon).append(',').append(m.position.lat)
        append("""]},"properties":{"id":""").append(jsonString(m.id))
        append(""","label":""").append(jsonString(m.label))
        append(""","color":"""").append(m.color.toHex()).append('"')
        append(""","bubble":""").append(jsonString(m.bubbleId()))
        append(""","order":""").append(i)
        append("}}")
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
