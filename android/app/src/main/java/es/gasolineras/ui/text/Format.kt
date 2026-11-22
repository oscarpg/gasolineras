package es.gasolineras.ui.text

import androidx.compose.ui.graphics.Color
import es.gasolineras.core.domain.Discount
import es.gasolineras.core.domain.DiscountType
import es.gasolineras.core.domain.ScaleColor
import java.util.Locale

/** Formatting in the user's locale (decimal comma in Spanish). */
fun price(value: Double): String = String.format(Locale.getDefault(), "%.3f", value)
fun euros(value: Double): String = String.format(Locale.getDefault(), "%.2f", value)
fun km(value: Double): String = String.format(Locale.getDefault(), "%.1f", value)

fun discountLabel(d: Discount): String = when (d.type) {
    DiscountType.CTS -> String.format(Locale.getDefault(), "%s cts/l", trim(d.value))
    DiscountType.PCT -> String.format(Locale.getDefault(), "%s %%", trim(d.value))
}

private fun trim(v: Double): String = if (v == Math.floor(v)) v.toLong().toString() else String.format(Locale.getDefault(), "%.1f", v)

/** The scale colour for shapes (map pins). */
fun ScaleColor.toColor(): Color = Color.hsl(hue.toFloat(), saturation / 100f, lightness / 100f)

/** The scale colour for text: darker on light backgrounds (WCAG AA), lighter on dark ones. */
fun ScaleColor.textColor(dark: Boolean): Color =
    if (dark) Color.hsl(hue.toFloat(), saturation / 100f, 0.68f) else forText().toColor()
