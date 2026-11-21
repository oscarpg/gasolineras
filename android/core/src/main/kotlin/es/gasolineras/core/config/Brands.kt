package es.gasolineras.core.config

/**
 * Brands recognised inside a station's "Rótulo" (sign text).
 * Order matters: the first match wins, so put more specific names first.
 */
val KNOWN_BRANDS: List<String> = listOf(
    "REPSOL", "MOEVE", "CEPSA", "CARBUGAL", "GALP", "BP", "SHELL", "PLENOIL", "PLENERGY",
    "BALLENOIL", "PETROPRIX", "PETROCASH", "SBC", "ORTIGAL", "STAROIL", "VALCARCE", "GALURESA",
    "EROSKI", "CARREFOUR", "ALCAMPO", "BONAREA", "BONÀREA", "AVIA", "Q8", "PETRONOR", "CAMPSA",
    "DISA", "MEROIL", "BEROIL", "AUTONETOIL", "EASYGAS", "GAS EXPRESS", "GASEXPRESS", "OILPRIX",
    "COSTCO", "MAKRO", "LECLERC", "HAFESA", "AGLA", "MAXOIL", "FARRUCO", "IDS", "AS24", "DYNEFF",
    "TAMOIL", "AN ENERGETICOS",
)

/** Spellings that should be reported under another canonical name. */
val BRAND_ALIASES: Map<String, String> = mapOf("BONÀREA" to "BONAREA")

/** Name used when a sign has no recognisable text. */
const val UNBRANDED = "SIN MARCA"
