package es.gasolineras.ui.main

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import es.gasolineras.PriceDay
import es.gasolineras.ui.text.price
import java.time.format.DateTimeFormatter

/**
 * Small line chart of a station's price over the last days. Days without data are skipped;
 * the line joins the known prices. The y axis spans the visible range (at least 2 cents).
 */
@Composable
fun PriceChart(days: List<PriceDay>, todayLabel: String, description: String, modifier: Modifier = Modifier) {
    val lineColor = MaterialTheme.colorScheme.primary
    val gridColor = MaterialTheme.colorScheme.outlineVariant
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant
    val measurer = rememberTextMeasurer()
    val labelStyle = MaterialTheme.typography.labelSmall.copy(color = labelColor)
    val dayFormat = DateTimeFormatter.ofPattern("d/M")

    Canvas(modifier.fillMaxWidth().height(140.dp).semantics { contentDescription = description }) {
        val known = days.withIndex().filter { it.value.price != null }
        if (known.isEmpty()) return@Canvas
        val prices = known.map { it.value.price!! }
        var lo = prices.min()
        var hi = prices.max()
        if (hi - lo < 0.02) {
            val mid = (hi + lo) / 2
            lo = mid - 0.01
            hi = mid + 0.01
        }
        val left = 0f
        val right = size.width
        val top = 18.dp.toPx()
        val bottom = size.height - 18.dp.toPx()
        fun x(i: Int) = left + (right - left) * (i + 0.5f) / days.size
        fun y(p: Double) = (bottom - (bottom - top) * ((p - lo) / (hi - lo))).toFloat()

        // Grid lines at the low and high prices
        listOf(lo, hi).forEach { p -> drawLine(gridColor, Offset(left, y(p)), Offset(right, y(p)), strokeWidth = 1.dp.toPx()) }

        // Line and points
        known.zipWithNext().forEach { (a, b) ->
            drawLine(lineColor, Offset(x(a.index), y(a.value.price!!)), Offset(x(b.index), y(b.value.price!!)), strokeWidth = 3.dp.toPx(), cap = StrokeCap.Round)
        }
        known.forEachIndexed { k, (i, day) ->
            val center = Offset(x(i), y(day.price!!))
            drawCircle(lineColor, radius = 4.dp.toPx(), center = center)
            // Label the first, the last and every change
            val changed = k == 0 || k == known.size - 1 || known[k - 1].value.price != day.price
            if (changed) {
                val text = measurer.measure(price(day.price), labelStyle)
                val tx = (center.x - text.size.width / 2).coerceIn(0f, size.width - text.size.width)
                drawText(text, topLeft = Offset(tx, (center.y - text.size.height - 4.dp.toPx()).coerceAtLeast(0f)))
            }
        }
        drawCircle(lineColor.copy(alpha = 0.25f), radius = 8.dp.toPx(), center = Offset(x(known.last().index), y(prices.last())), style = Stroke(2.dp.toPx()))

        // Day labels
        days.forEachIndexed { i, day ->
            val label = if (i == days.size - 1) todayLabel else day.date.format(dayFormat)
            val text = measurer.measure(label, TextStyle(color = labelColor, fontSize = labelStyle.fontSize))
            drawText(text, topLeft = Offset(x(i) - text.size.width / 2, size.height - text.size.height))
        }
    }
}
