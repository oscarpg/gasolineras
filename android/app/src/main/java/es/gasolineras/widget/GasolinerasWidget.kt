package es.gasolineras.widget

import android.content.Context
import android.text.format.DateUtils
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import es.gasolineras.MainActivity
import es.gasolineras.R
import es.gasolineras.ui.text.km
import es.gasolineras.ui.text.label
import es.gasolineras.ui.text.price
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Home-screen widget: the cheapest station nearby (small) or the top 3 with distance (medium).
 * Drawn from the saved [WidgetSnapshot]; see [WidgetUpdater] and [WidgetWork] for updates.
 */
class GasolinerasWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(SMALL, MEDIUM))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = withContext(Dispatchers.IO) { WidgetStore(context).readSnapshot() }
        provideContent { GlanceTheme { Content(snapshot) } }
    }

    companion object {
        val SMALL = DpSize(120.dp, 60.dp)
        val MEDIUM = DpSize(250.dp, 140.dp)
        val STATION_ID = ActionParameters.Key<String>(MainActivity.EXTRA_STATION_ID)
    }
}

@Composable
private fun Content(snapshot: WidgetSnapshot?) {
    val context = LocalContext.current
    val medium = LocalSize.current.height >= GasolinerasWidget.MEDIUM.height
    val onSurface = GlanceTheme.colors.onSurface
    val muted = GlanceTheme.colors.onSurfaceVariant
    Column(
        modifier = GlanceModifier.fillMaxSize().background(GlanceTheme.colors.widgetBackground).cornerRadius(16.dp).padding(12.dp),
    ) {
        // Header: fuel and refresh
        Row(GlanceModifier.fillMaxWidth().clickable(actionStartActivity<MainActivity>()), verticalAlignment = Alignment.CenterVertically) {
            Text(
                snapshot?.let { context.getString(it.fuel.label()) } ?: context.getString(R.string.app_name),
                style = TextStyle(color = muted, fontSize = 12.sp, fontWeight = FontWeight.Medium),
                modifier = GlanceModifier.defaultWeight(),
            )
            Text(
                "↻",
                style = TextStyle(color = muted, fontSize = 16.sp),
                modifier = GlanceModifier.padding(horizontal = 4.dp).clickable(actionRunCallback<RefreshCallback>()),
            )
        }
        Spacer(GlanceModifier.height(4.dp))
        when {
            snapshot == null || snapshot.state == WidgetSnapshot.State.NO_ORIGIN ->
                Message(context.getString(R.string.widget_no_origin), onSurface)
            snapshot.state == WidgetSnapshot.State.NO_DATA -> Message(context.getString(R.string.widget_no_data), onSurface)
            snapshot.items.isEmpty() -> Message(context.getString(R.string.preview_none), onSurface)
            else -> {
                val items = if (medium) snapshot.items else snapshot.items.take(1)
                items.forEach { item -> ItemRow(item, showDistance = medium, onSurface = onSurface, muted = muted) }
                if (medium) {
                    Spacer(GlanceModifier.defaultWeight())
                    Text(
                        context.getString(
                            R.string.widget_updated,
                            DateUtils.getRelativeTimeSpanString(snapshot.updatedAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS),
                        ),
                        style = TextStyle(color = muted, fontSize = 11.sp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ItemRow(item: WidgetItem, showDistance: Boolean, onSurface: ColorProvider, muted: ColorProvider) {
    Row(
        GlanceModifier.fillMaxWidth().padding(vertical = 3.dp)
            .clickable(actionStartActivity<MainActivity>(actionParametersOf(GasolinerasWidget.STATION_ID to item.id))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            item.brand,
            style = TextStyle(color = onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium),
            maxLines = 1,
            modifier = GlanceModifier.defaultWeight(),
        )
        if (showDistance && item.distanceKm != null) {
            Text("${km(item.distanceKm)} km", style = TextStyle(color = muted, fontSize = 12.sp))
            Spacer(GlanceModifier.width(8.dp))
        }
        Text(
            "${price(item.price)} €",
            style = TextStyle(color = ColorProvider(Color.hsl(item.hue.toFloat(), 0.82f, 0.36f)), fontSize = 16.sp, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun Message(text: String, color: ColorProvider) =
    Text(text, style = TextStyle(color = color, fontSize = 13.sp), modifier = GlanceModifier.clickable(actionStartActivity<MainActivity>()))

/** The widget's refresh button. */
class RefreshCallback : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        WidgetWork.refreshNow(context)
    }
}

class GasolinerasWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GasolinerasWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetWork.schedule(context)
        WidgetWork.refreshNow(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetWork.cancel(context)
    }
}
