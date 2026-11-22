package es.gasolineras.core.domain

import es.gasolineras.core.config.BRAND_ALIASES
import es.gasolineras.core.config.KNOWN_BRANDS
import es.gasolineras.core.config.UNBRANDED
import java.text.Normalizer

private val COMBINING_MARKS = Regex("[̀-ͯ]")

private fun stripAccents(text: String): String =
    Normalizer.normalize(text, Normalizer.Form.NFD).replace(COMBINING_MARKS, "")

/** Known brands pre-compiled as whole-word regexes, in priority order. */
private val BRAND_MATCHERS: List<Pair<String, Regex>> = KNOWN_BRANDS.map { brand ->
    brand to Regex("(^|[^A-Z0-9])${Regex.escape(stripAccents(brand))}([^A-Z0-9]|$)")
}

private val GENERIC_PREFIX =
    Regex("""^(E\.?\s*S\.?|ESTACION\s+DE\s+SERVICIO|GASOLINERA|AREA\s+DE\s+SERVICIO)\s+""", RegexOption.IGNORE_CASE)

private val SEPARATOR = Regex("""\s+[-/,]\s+""")

/**
 * Turns a station sign ("Rótulo") into a brand name.
 *
 * 1. If a known brand appears as a whole word, returns that brand.
 * 2. Otherwise strips generic prefixes ("E.S.", "GASOLINERA"…) and keeps the
 *    text before the first " - ", " / " or " , " separator.
 * 3. Empty result → "SIN MARCA".
 */
fun normalizeBrand(sign: String = ""): String {
    val clean = stripAccents(sign.uppercase().trim())
    for ((brand, regex) in BRAND_MATCHERS) {
        if (regex.containsMatchIn(clean)) return BRAND_ALIASES[brand] ?: brand
    }
    val stripped = clean.replaceFirst(GENERIC_PREFIX, "").split(SEPARATOR).first().trim()
    return stripped.ifEmpty { UNBRANDED }
}

fun Station.branded(): BrandedStation = BrandedStation(this, normalizeBrand(name))
