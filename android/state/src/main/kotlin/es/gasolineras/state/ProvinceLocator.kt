package es.gasolineras.state

import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.ProvinceShapes

/** Which provinces a point, a search circle or a route touch. */
interface ProvinceLocator {
    fun provinceAt(point: LatLng): String?
    fun provincesWithin(point: LatLng, radiusKm: Double): List<String>
    fun provincesAlongRoute(route: List<LatLng>, detourKm: Double): List<String>
}

/** [ProvinceLocator] over the bundled IGN province outlines (offline). */
class ShapesProvinceLocator(private val shapes: () -> ProvinceShapes = { ProvinceShapes.bundled }) : ProvinceLocator {
    override fun provinceAt(point: LatLng) = shapes().provinceAt(point)
    override fun provincesWithin(point: LatLng, radiusKm: Double) = shapes().provincesWithin(point, radiusKm)
    override fun provincesAlongRoute(route: List<LatLng>, detourKm: Double) = shapes().provincesAlongRoute(route, detourKm)
}

/** Extra distance added to the radius/detour: the outlines are simplified (~200 m, plus smoothing). */
const val PROVINCE_MARGIN_KM = 2.0
