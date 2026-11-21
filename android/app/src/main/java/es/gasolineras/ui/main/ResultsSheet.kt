package es.gasolineras.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import es.gasolineras.MainUiState
import es.gasolineras.R
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.PriceStaleness
import es.gasolineras.core.domain.StationRow
import es.gasolineras.state.HistoryStatus
import es.gasolineras.ui.text.errorText
import es.gasolineras.ui.text.euros
import es.gasolineras.ui.text.km
import es.gasolineras.ui.text.label
import es.gasolineras.ui.text.price
import es.gasolineras.ui.text.statusText
import es.gasolineras.ui.text.textColor

/** Bottom sheet content: status/summary, fuel chips, sort switch, errors and the station list. */
@Composable
fun ResultsSheet(
    ui: MainUiState,
    onFuel: (FuelType) -> Unit,
    onSortByTotalCost: (Boolean) -> Unit,
    onStation: (String) -> Unit,
    onRetry: () -> Unit,
    onDismissError: () -> Unit,
) {
    val prefs = ui.app.preferences
    LazyColumn(contentPadding = WindowInsets.navigationBars.asPaddingValues()) {
        item {
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp)) {
                val status = statusText(ui.controller.status)
                Text(
                    status ?: if (ui.app.route != null) {
                        stringResource(R.string.preview_summary_route, ui.visible.rows.size)
                    } else {
                        stringResource(R.string.preview_summary_radius, ui.visible.rows.size, prefs.searchRadiusKm.toInt())
                    },
                    style = MaterialTheme.typography.titleMedium,
                )
                ui.app.historyStatus?.takeIf { it.kind == HistoryStatus.Kind.LOADING }?.let {
                    Text(stringResource(R.string.preview_history_loading, it.days), style = MaterialTheme.typography.bodySmall)
                    LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 4.dp))
                }
            }
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FuelType.entries.forEach { fuel ->
                    FilterChip(selected = prefs.fuel == fuel, onClick = { onFuel(fuel) }, label = { Text(stringResource(fuel.label())) })
                }
            }
            if (prefs.activeCar != null) {
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.preview_sort_cost), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = prefs.sortByTotalCost, onCheckedChange = onSortByTotalCost)
                }
            }
            ui.controller.error?.let { shown ->
                OutlinedCard(Modifier.padding(16.dp).fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text(errorText(shown.error), color = MaterialTheme.colorScheme.error)
                        Row {
                            if (shown.retry != null) TextButton(onClick = onRetry) { Text(stringResource(R.string.message_retry)) }
                            TextButton(onClick = onDismissError) { Text(stringResource(R.string.message_dismiss)) }
                        }
                    }
                }
            }
            if (statusText(ui.controller.status) == null && ui.visible.rows.isEmpty()) {
                Text(stringResource(R.string.preview_none), Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
            }
            HorizontalDivider(Modifier.padding(top = 8.dp))
        }
        items(ui.visible.rows, key = { it.station.id }) { row ->
            StationRowItem(row, sortedByTotalCost = ui.visible.sortedByTotalCost, onClick = { onStation(row.station.id) })
        }
    }
}

@Composable
private fun StationRowItem(row: StationRow, sortedByTotalCost: Boolean, onClick: () -> Unit) {
    val s = row.station.station
    val dark = isSystemInDarkTheme()
    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        headlineContent = { Text(row.station.brand, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Column {
                Text(
                    s.address.ifEmpty { s.name.ifEmpty { stringResource(R.string.station_unnamed) } },
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    listOfNotNull(
                        (row.routeDetourKm ?: row.distanceFromUserKm)?.let { "${km(it)} km" },
                        row.staleness?.let { ageLabel(it) },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${price(row.finalPrice)} €",
                    color = row.color.textColor(dark),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                if (row.finalPrice != row.basePrice) {
                    Text("${price(row.basePrice)} €", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (sortedByTotalCost) row.cost.totalCost?.let { Text("${euros(it)} €", style = MaterialTheme.typography.bodySmall) }
            }
        },
    )
}

@Composable
fun ageLabel(s: PriceStaleness): String =
    if (s.days >= s.windowDays) stringResource(R.string.preview_age_at_least, s.days) else stringResource(R.string.preview_age, s.days)
