package es.gasolineras.state

import es.gasolineras.core.domain.BrandedStation
import es.gasolineras.core.domain.Car
import es.gasolineras.core.domain.FuelPrices
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.HistoryPrices
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.Preferences
import es.gasolineras.core.domain.Station
import es.gasolineras.data.geo.GeocodeResult
import es.gasolineras.data.geo.Geocoder
import es.gasolineras.data.geo.Router
import es.gasolineras.data.miteco.MitecoSource

/** Port of tests/state/fixtures.ts. */
fun prices(vararg p: Pair<FuelType, Double>): FuelPrices = mapOf(*p)

fun station(
    id: String,
    code: String = id,
    provinceCode: String = "28",
    bulletinDate: String = "21/11/2026",
    name: String = "REPSOL",
    lat: Double = 40.4,
    lon: Double = -3.7,
    prices: FuelPrices = prices(FuelType.GASOLINA_95 to 1.5),
) = Station(id, code, provinceCode, bulletinDate, name, "Calle $id", lat, lon, "24H", prices)

fun state(prefs: Preferences = Preferences.DEFAULT) = createInitialState(prefs)

val LEON = Car("c1", "León", FuelType.GASOLINA_95, 50.0, 6.0)
val VAN = Car("c2", "Furgoneta", FuelType.GASOLEO_A, 70.0, 8.5)

/** Fake MITECO: stations per province; history = same prices as today. */
class FakeMiteco(
    val stationsByProvince: MutableMap<String, List<Station>>,
    private val failDates: Set<String> = emptySet(),
) : MitecoSource {
    val calls = mutableListOf<String>()
    val cached = mutableSetOf<String>()

    override fun hasCachedProvince(code: String) = code in cached

    override suspend fun getProvinceStations(code: String, force: Boolean): List<Station> {
        calls += "stations:$code${if (force) ":force" else ""}"
        return stationsByProvince[code] ?: throw IllegalStateException("No se pudo descargar la información de las gasolineras.")
    }

    override suspend fun getHistoryDay(code: String, date: String): HistoryPrices {
        calls += "history:$code:$date"
        if (date in failDates) throw IllegalStateException("offline")
        return stationsByProvince[code].orEmpty().associate { it.code to prices(FuelType.GASOLINA_95 to it.prices.getValue(FuelType.GASOLINA_95)) }
    }
}

class FakeGeocoder(
    val places: Map<String, GeocodeResult?> = emptyMap(),
    val province: (LatLng) -> String? = { "28" },
) : Geocoder {
    override suspend fun search(query: String) = places[query]
    override suspend fun reverseProvince(position: LatLng) = province(position)
}

class FakeRouter(var result: List<LatLng>? = null) : Router {
    override suspend fun route(from: LatLng, to: LatLng) = result
}

class FakeGps(var position: LatLng? = LatLng(40.4, -3.7), var available: Boolean = true) : PositionProvider {
    override fun isAvailable() = available
    override suspend fun currentPosition() = position ?: throw IllegalStateException("denied")
}

fun BrandedStation.ids() = station.id

class FakeLocator(
    var at: (LatLng) -> String? = { "28" },
    var within: (LatLng, Double) -> List<String> = { _, _ -> listOf("28") },
    var along: (List<LatLng>, Double) -> List<String> = { _, _ -> listOf("28", "45") },
) : ProvinceLocator {
    val withinCalls = mutableListOf<Double>()
    override fun provinceAt(point: LatLng) = at(point)
    override fun provincesWithin(point: LatLng, radiusKm: Double) = within(point, radiusKm).also { withinCalls += radiusKm }
    override fun provincesAlongRoute(route: List<LatLng>, detourKm: Double) = along(route, detourKm)
}
