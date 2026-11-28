package es.gasolineras.map.api

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

/**
 * Provider-agnostic map API. Screens only use these types; the map SDK (MapLibre today)
 * lives in its own module behind [MapRenderer]. See docs/ANDROID_PLAN.md §3.1.
 */

/** Latitude, longitude in decimal degrees (WGS84). */
@Immutable
data class GeoPoint(val lat: Double, val lon: Double)

@Immutable
data class MapMarker(
    val id: String,
    val position: GeoPoint,
    /** Short text drawn next to the marker (e.g. the price). */
    val label: String,
    val color: Color,
    /** Drawn in the marker's bubble when zoomed in; null shows the price alone. */
    val badge: MarkerBadge? = null,
)

/**
 * A brand's mark: its logo (a drawable resource id) or, without one, its initials on
 * [background]. Equal badges are drawn once and shared by every marker that uses them.
 */
@Immutable
data class MarkerBadge(
    val logo: Int?,
    val initials: String,
    val background: Color,
    val foreground: Color,
)

@Immutable
data class CameraTarget(val center: GeoPoint, val zoom: Double)

/** Where the map's look and tiles come from. Changing tile provider = changing these values. */
@Immutable
data class MapStyle(
    val styleUrl: String,
    val darkStyleUrl: String,
)

/** Everything a map screen passes to the renderer. */
@Immutable
data class MapContent(
    /** Keep the same list instance while it doesn't change: renderers redraw markers only when it does. */
    val markers: List<MapMarker> = emptyList(),
    /** Highlighted marker. Changing it doesn't redraw the other markers. */
    val selectedId: String? = null,
    val route: List<GeoPoint>? = null,
    val userPosition: GeoPoint? = null,
)

interface MapRenderer {
    /**
     * Draws the map. When [camera] changes the map animates to it; user gestures don't
     * change [camera] but are reported through [onCameraIdle].
     */
    @Composable
    fun Map(
        content: MapContent,
        camera: CameraTarget,
        darkTheme: Boolean,
        onMarkerClick: (id: String) -> Unit,
        onCameraIdle: (CameraTarget) -> Unit,
        modifier: Modifier,
        contentPadding: PaddingValues,
    )
}
