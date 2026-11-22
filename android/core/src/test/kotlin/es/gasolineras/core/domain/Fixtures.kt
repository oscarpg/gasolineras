package es.gasolineras.core.domain

/** Port of tests/state/fixtures.ts. */
fun prices(vararg p: Pair<FuelType, Double>): FuelPrices = mapOf(*p)

fun station(
    id: String,
    code: String = id,
    bulletinDate: String = "21/11/2026",
    lat: Double = 40.4,
    lon: Double = -3.7,
    prices: FuelPrices = prices(FuelType.GASOLINA_95 to 1.5),
) = Station(
    id = id, code = code, provinceCode = "28", bulletinDate = bulletinDate, name = "REPSOL",
    address = "Calle $id", lat = lat, lon = lon, openingHours = "24H", prices = prices,
)

fun branded(
    id: String,
    lat: Double = 40.4,
    lon: Double = -3.7,
    brand: String = "REPSOL",
    prices: FuelPrices = prices(FuelType.GASOLINA_95 to 1.5),
) = BrandedStation(station(id, lat = lat, lon = lon, prices = prices), brand)
