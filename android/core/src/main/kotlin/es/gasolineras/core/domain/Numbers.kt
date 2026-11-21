package es.gasolineras.core.domain

/** The leading number JavaScript's parseFloat would read. */
private val LEADING_NUMBER = Regex("""^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?""")

/**
 * Parses a number written with a Spanish decimal comma ("1,459") or a dot.
 * Like the web app (parseFloat), reads the leading number and ignores trailing text.
 * Returns null for empty or non-numeric input.
 */
fun parseSpanishNumber(value: String?): Double? {
    val text = value?.replaceFirst(',', '.') ?: return null
    return LEADING_NUMBER.find(text)?.value?.trim()?.toDoubleOrNull()?.takeIf { it.isFinite() }
}
