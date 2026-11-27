package es.gasolineras.ui.brand

import androidx.annotation.DrawableRes
import androidx.compose.ui.graphics.Color
import es.gasolineras.R
import es.gasolineras.core.config.UNBRANDED
import es.gasolineras.map.api.MarkerBadge

/**
 * How each brand is drawn on the map and in the widget: its logo (from Wikipedia / Wikimedia
 * Commons, cropped to the symbol and resized; trademarks of their owners) or, without one, its
 * initials on the brand colour. Brands not listed get a neutral grey.
 */
object BrandBadges {
    private class Style(val background: Long, val foreground: Long, @DrawableRes val logo: Int? = null)

    private val STYLES: Map<String, Style> = mapOf(
        "REPSOL" to Style(0xFFE35205, 0xFFFFFFFF, R.drawable.brand_repsol),
        "MOEVE" to Style(0xFF00A19A, 0xFFFFFFFF, R.drawable.brand_moeve),
        "CEPSA" to Style(0xFFD6001C, 0xFFFFFFFF, R.drawable.brand_cepsa),
        "GALP" to Style(0xFFEE7203, 0xFFFFFFFF, R.drawable.brand_galp),
        "ENI" to Style(0xFFFFD100, 0xFF000000, R.drawable.brand_eni),
        "BP" to Style(0xFF007F00, 0xFFFFFFFF, R.drawable.brand_bp),
        "SHELL" to Style(0xFFFBCE07, 0xFFDD1D21, R.drawable.brand_shell),
        "PLENOIL" to Style(0xFF1B3F8B, 0xFFFFFFFF),
        "PLENERGY" to Style(0xFFF39200, 0xFFFFFFFF, R.drawable.brand_plenergy),
        "BALLENOIL" to Style(0xFF0071BC, 0xFFFFFFFF, R.drawable.brand_ballenoil),
        "PETROPRIX" to Style(0xFFE30613, 0xFFFFFFFF, R.drawable.brand_petroprix),
        "EASYGAS" to Style(0xFFE3141A, 0xFFFFFFFF, R.drawable.brand_easygas),
        "CARREFOUR" to Style(0xFF004E9F, 0xFFFFFFFF, R.drawable.brand_carrefour),
        "ALCAMPO" to Style(0xFFE2001A, 0xFFFFFFFF, R.drawable.brand_alcampo),
        "EROSKI" to Style(0xFFE30613, 0xFFFFFFFF, R.drawable.brand_eroski),
        "BONAREA" to Style(0xFFE4002B, 0xFFFFFFFF),
        "AVIA" to Style(0xFFE2001A, 0xFFFFFFFF),
        "Q8" to Style(0xFF003B7A, 0xFFFFD100),
        "PETRONOR" to Style(0xFF00843D, 0xFFFFFFFF, R.drawable.brand_petronor),
        "CAMPSA" to Style(0xFFC8102E, 0xFFFFFFFF, R.drawable.brand_campsa),
        "DISA" to Style(0xFFE30613, 0xFFFFFFFF),
        "COSTCO" to Style(0xFF005DAA, 0xFFFFFFFF),
    )
    private val DEFAULT = Style(0xFF546E7A, 0xFFFFFFFF)

    private val badges = java.util.concurrent.ConcurrentHashMap<String, MarkerBadge>()

    /** The brand's logo, if it has one. */
    @DrawableRes
    fun logo(brand: String): Int? = STYLES[brand]?.logo

    /** The map badge for a brand (cached: one instance per brand). */
    fun badge(brand: String): MarkerBadge = badges.getOrPut(brand) {
        val style = STYLES[brand] ?: DEFAULT
        MarkerBadge(style.logo, brandInitials(brand), Color(style.background), Color(style.foreground))
    }
}

/** Up to two letters for a brand: "REPSOL" → "RE", "GAS EXPRESS" → "GE", "Q8" → "Q8". */
fun brandInitials(brand: String): String {
    if (brand.isBlank() || brand == UNBRANDED) return ""
    val words = brand.trim().split(Regex("\\s+"))
    val letters = if (words.size > 1) words.joinToString("") { it.take(1) } else brand.trim()
    return letters.take(2).uppercase()
}
