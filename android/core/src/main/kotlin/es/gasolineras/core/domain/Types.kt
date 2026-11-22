package es.gasolineras.core.domain

import kotlinx.serialization.Serializable

/** Core domain types. Pure data: no Android, no map SDK, no I/O. Port of src/domain/types.ts. */

/** Latitude, longitude in decimal degrees (WGS84). */
data class LatLng(val lat: Double, val lon: Double)

/**
 * Supported fuels, in menu order. [mitecoField] is the price field in MITECO responses
 * (matched case-insensitively: MITECO has changed capitalisation before).
 */
@Serializable
enum class FuelType(val mitecoField: String) {
    GASOLEO_A("Precio Gasoleo A"),
    GASOLEO_PREMIUM("Precio Gasoleo Premium"),
    GASOLINA_95("Precio Gasolina 95 E5"),
    GASOLINA_98("Precio Gasolina 98 E5"),
    GLP("Precio Gases licuados del petróleo"),
    GNC("Precio Gas Natural Comprimido"),
    GNL("Precio Gas Natural Licuado"),
    ;

    companion object {
        val DEFAULT = GASOLINA_95

        /** The fuel with this id (as saved in preferences), or null. */
        fun fromId(id: String?): FuelType? = entries.firstOrNull { it.name == id }
    }
}

/** €/litre per fuel. A fuel the station doesn't sell is absent. */
typealias FuelPrices = Map<FuelType, Double>

/** The parts of a car that matter for cost calculations. */
interface CarSpecs {
    val tankLitres: Double
    val consumptionL100km: Double
}

data class SimpleCarSpecs(
    override val tankLitres: Double,
    override val consumptionL100km: Double,
) : CarSpecs

/** A saved car. */
data class Car(
    val id: String,
    val name: String,
    val fuel: FuelType,
    override val tankLitres: Double,
    override val consumptionL100km: Double,
) : CarSpecs

/** `CTS` = euro cents per litre off; `PCT` = percentage off. Names kept for saved-prefs compatibility. */
enum class DiscountType { CTS, PCT }

data class Discount(val type: DiscountType, val value: Double)

/** How long a station's price has stayed the same. */
data class Staleness(
    /** Consecutive past days with the same price as today (0 = changed since yesterday). */
    val days: Int,
    /** Bulletin date (dd-mm-yyyy) from which the current price has been unchanged. */
    val since: String,
)

/** Staleness of one station's price for one fuel, plus how far back it was checked. */
data class PriceStaleness(
    val days: Int,
    val since: String,
    /** Number of past days compared; `days == windowDays` means "at least that old". */
    val windowDays: Int,
)

/** Filter on how many days a price has gone without changing. */
sealed interface AgeFilter {
    data object All : AgeFilter
    data class AtMost(val days: Int) : AgeFilter
    data class Exactly(val days: Int) : AgeFilter
    data class MoreThan(val days: Int) : AgeFilter
}

/** A petrol station as reported by MITECO, normalised. */
@Serializable
data class Station(
    /** Stable id: MITECO code (or sign) + coordinates. */
    val id: String,
    /** MITECO station code (IDEESS); empty if missing. */
    val code: String,
    val provinceCode: String,
    /** Date of the bulletin the prices come from, as MITECO writes it. */
    val bulletinDate: String,
    /** Sign text ("Rótulo"). */
    val name: String,
    val address: String,
    val lat: Double,
    val lon: Double,
    val openingHours: String,
    val prices: FuelPrices,
) {
    val position: LatLng get() = LatLng(lat, lon)
}

/** A station with its brand worked out from the sign. */
data class BrandedStation(val station: Station, val brand: String) {
    val id: String get() = station.id
}

/** One day of historical prices for a province: station code → prices it had that day. */
typealias HistoryPrices = Map<String, FuelPrices>

/** Staleness per station id, per fuel. */
typealias StalenessIndex = Map<String, Map<FuelType, PriceStaleness>>
