package es.gasolineras.core.domain

import kotlin.math.roundToInt

/** An HSL colour of the price scale. Platform code converts it to its own colour type. */
data class ScaleColor(val hue: Int, val saturation: Int = SATURATION, val lightness: Int = LIGHTNESS) {
    /** Darker version for text: map pins keep the brighter colour, prices written in it use this one. */
    fun forText(): ScaleColor = copy(lightness = TEXT_LIGHTNESS)

    /** CSS form, as the web app writes it (used to check parity). */
    fun toCss(): String = "hsl($hue, $saturation%, $lightness%)"

    companion object {
        const val SATURATION = 82
        const val LIGHTNESS = 40

        /** Gives every hue of the scale at least 4.5:1 contrast on white (WCAG AA). */
        const val TEXT_LIGHTNESS = 26
    }
}

/** Green (cheapest) → red (most expensive) for a value within [min]..[max]. All equal → green. */
fun colorForValue(value: Double, min: Double, max: Double): ScaleColor {
    val ratio = if (max > min) (value - min) / (max - min) else 0.0
    return ScaleColor(hue = jsRound((1 - ratio) * 120))
}

/** JavaScript's Math.round: halves round towards +∞. */
internal fun jsRound(x: Double): Int = kotlin.math.floor(x + 0.5).roundToInt()
