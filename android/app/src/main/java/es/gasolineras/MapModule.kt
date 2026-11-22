package es.gasolineras

import es.gasolineras.map.api.MapRenderer
import es.gasolineras.map.maplibre.MapLibreRenderer
import es.gasolineras.map.maplibre.OpenFreeMapStyle

/**
 * The one place that picks the map implementation and tiles.
 * To switch provider, change this binding (will move to Hilt in Phase 3).
 */
object MapModule {
    val renderer: MapRenderer by lazy { MapLibreRenderer(OpenFreeMapStyle) }
}
