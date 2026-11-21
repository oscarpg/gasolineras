package es.gasolineras.ui.main

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import es.gasolineras.PriceDay
import es.gasolineras.R
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.StationRow
import es.gasolineras.ui.text.discountLabel
import es.gasolineras.ui.text.euros
import es.gasolineras.ui.text.km
import es.gasolineras.ui.text.label
import es.gasolineras.ui.text.price
import es.gasolineras.ui.text.textColor

private sealed interface ChartState {
    data object Loading : ChartState
    data class Ready(val days: List<PriceDay>) : ChartState
    data object Failed : ChartState
}

/** Details of one station: prices, distance and cost, price age, 7-day chart, directions and share. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StationDetailSheet(
    row: StationRow,
    fuel: FuelType,
    loadHistory: suspend () -> List<PriceDay>,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val s = row.station.station
    val dark = isSystemInDarkTheme()
    var chart by remember(s.id, fuel) { mutableStateOf<ChartState>(ChartState.Loading) }
    LaunchedEffect(s.id, fuel) {
        chart = try {
            ChartState.Ready(loadHistory())
        } catch (e: Exception) {
            ChartState.Failed
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).navigationBarsPadding().padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(row.station.brand, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Text(s.address.ifEmpty { s.name.ifEmpty { stringResource(R.string.station_unnamed) } }, style = MaterialTheme.typography.bodyMedium)

            Row(verticalAlignment = androidx.compose.ui.Alignment.Bottom) {
                Text(
                    "${price(row.finalPrice)} €/l",
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = row.color.textColor(dark),
                )
                Text("  " + stringResource(fuel.label()), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 6.dp))
            }
            row.discount?.takeIf { row.finalPrice != row.basePrice }?.let {
                Text(stringResource(R.string.detail_discount, discountLabel(it), price(row.basePrice)), style = MaterialTheme.typography.bodyMedium)
            }

            val trip = row.cost.roundTripKm
            row.routeDetourKm?.let {
                Text(stringResource(R.string.detail_detour, km(it), km(trip ?: it * 2)), style = MaterialTheme.typography.bodyMedium)
            } ?: row.distanceFromUserKm?.let {
                Text(stringResource(R.string.detail_distance, km(it), km(trip ?: it * 2)), style = MaterialTheme.typography.bodyMedium)
            }
            if (row.cost.totalCost != null) {
                Text(
                    stringResource(R.string.detail_cost, euros(row.cost.tankCost!!), euros(row.cost.tripCost!!), euros(row.cost.totalCost!!)),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            row.staleness?.let { st ->
                Text(
                    when {
                        st.days == 0 -> stringResource(R.string.detail_changed)
                        st.days >= st.windowDays -> stringResource(R.string.detail_unchanged_at_least, st.since)
                        else -> stringResource(R.string.detail_unchanged, st.since)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            if (s.openingHours.isNotEmpty()) Text(stringResource(R.string.detail_hours, s.openingHours), style = MaterialTheme.typography.bodyMedium)

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { openDirections(context, s.lat, s.lon, row.station.brand) }) { Text(stringResource(R.string.detail_navigate)) }
                OutlinedButton(onClick = { share(context, row, fuel) }) {
                    Icon(Icons.Filled.Share, contentDescription = null)
                    Text("  " + stringResource(R.string.detail_share))
                }
            }

            HorizontalDivider()
            Text(stringResource(R.string.chart_title), style = MaterialTheme.typography.titleMedium)
            when (val c = chart) {
                ChartState.Loading -> Text(stringResource(R.string.chart_loading), style = MaterialTheme.typography.bodySmall)
                ChartState.Failed -> Text(stringResource(R.string.chart_error), style = MaterialTheme.typography.bodySmall)
                is ChartState.Ready -> {
                    PriceChart(c.days, todayLabel = stringResource(R.string.chart_today), description = stringResource(R.string.chart_description))
                    val known = c.days.mapNotNull { it.price }
                    if (known.size > 1 && known.distinct().size == 1) Text(stringResource(R.string.chart_flat), style = MaterialTheme.typography.bodySmall)
                }
            }

            HorizontalDivider()
            Text(stringResource(R.string.detail_prices), style = MaterialTheme.typography.titleMedium)
            FuelType.entries.forEach { f ->
                s.prices[f]?.let { p ->
                    Row(Modifier.fillMaxWidth()) {
                        Text(stringResource(f.label()), modifier = Modifier.weight(1f), fontWeight = if (f == fuel) FontWeight.Bold else null)
                        Text("${price(p)} €/l", fontWeight = if (f == fuel) FontWeight.Bold else null)
                    }
                }
            }
        }
    }
}

/** Hands the destination to any maps/navigation app (Google Maps, Waze, OsmAnd…). */
private fun openDirections(context: Context, lat: Double, lon: Double, label: String) {
    val uri = Uri.parse("geo:$lat,$lon?q=$lat,$lon(${Uri.encode(label)})")
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, R.string.detail_no_maps_app, Toast.LENGTH_SHORT).show()
    }
}

private fun share(context: Context, row: StationRow, fuel: FuelType) {
    val s = row.station.station
    val text = buildString {
        append(row.station.brand).append(" — ").append(context.getString(fuel.label())).append(": ").append(price(row.finalPrice)).append(" €/l\n")
        if (s.address.isNotEmpty()) append(s.address).append('\n')
        append("https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}")
    }
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
    context.startActivity(Intent.createChooser(send, null))
}
