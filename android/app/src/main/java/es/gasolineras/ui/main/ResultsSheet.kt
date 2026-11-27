package es.gasolineras.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import es.gasolineras.MainUiState
import es.gasolineras.MainViewModel
import es.gasolineras.R
import es.gasolineras.core.domain.AgeFilterOption
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.MAX_SEARCH_RADIUS_KM
import es.gasolineras.core.domain.PriceStaleness
import es.gasolineras.core.domain.StationRow
import es.gasolineras.state.HistoryStatus
import es.gasolineras.ui.settings.activeFilterCount
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
    online: Boolean,
    onFuel: (FuelType) -> Unit,
    onCar: (String?) -> Unit,
    onFavouritesOnly: (Boolean) -> Unit,
    onOpenFilters: () -> Unit,
    onWiden: () -> Unit,
    onClearFilters: () -> Unit,
    onSortOrder: (MainViewModel.SortOrder) -> Unit,
    onStation: (String) -> Unit,
    onRetry: () -> Unit,
    onDismissError: () -> Unit,
) {
    val prefs = ui.app.preferences
    LazyColumn(contentPadding = WindowInsets.navigationBars.asPaddingValues()) {
        item {
            if (!online) {
                Surface(color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), shape = MaterialTheme.shapes.small) {
                    Text(
                        stringResource(R.string.offline_banner),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp)) {
                val status = statusText(ui.controller.status)
                val filters = activeFilterCount(prefs)
                Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    status ?: if (ui.app.favouritesOnly) {
                        stringResource(R.string.fav_summary, ui.visible.rows.size)
                    } else if (ui.app.route != null) {
                        stringResource(R.string.preview_summary_route, ui.visible.rows.size)
                    } else {
                        stringResource(R.string.preview_summary_radius, ui.visible.rows.size, prefs.searchRadiusKm.toInt())
                    },
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                    // Station filters, next to the list they affect
                    FilledTonalButton(onClick = onOpenFilters, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)) {
                        Text(if (filters > 0) stringResource(R.string.filters_button_count, filters) else stringResource(R.string.filters_button))
                    }
                }
                ui.app.historyStatus?.takeIf { it.kind == HistoryStatus.Kind.LOADING }?.let {
                    Text(stringResource(R.string.preview_history_loading, it.days), style = MaterialTheme.typography.bodySmall)
                    LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 4.dp))
                }
            }
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = ui.app.favouritesOnly,
                    onClick = { onFavouritesOnly(!ui.app.favouritesOnly) },
                    label = { Text(stringResource(R.string.fav_chip, prefs.favourites.size)) },
                    leadingIcon = { Icon(if (ui.app.favouritesOnly) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, contentDescription = null, modifier = Modifier.size(18.dp)) },
                )
                FuelType.entries.forEach { fuel ->
                    FilterChip(selected = prefs.fuel == fuel, onClick = { onFuel(fuel) }, label = { Text(stringResource(fuel.label())) })
                }
            }
            if (prefs.cars.isNotEmpty()) {
                // One tap to switch car (and its fuel), or to drop it.
                Row(
                    Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(selected = prefs.activeCarId == null, onClick = { onCar(null) }, label = { Text(stringResource(R.string.cars_none_chip)) })
                    prefs.cars.forEach { car ->
                        FilterChip(selected = prefs.activeCarId == car.id, onClick = { onCar(car.id) }, label = { Text(car.name) })
                    }
                }
            }
            // Sort order: price (default), distance, or total cost when a car is active.
            val order = when {
                prefs.sortByDistance -> MainViewModel.SortOrder.DISTANCE
                prefs.sortByTotalCost && prefs.activeCar != null -> MainViewModel.SortOrder.TOTAL_COST
                else -> MainViewModel.SortOrder.PRICE
            }
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.sort_label), style = MaterialTheme.typography.labelLarge)
                listOfNotNull(
                    MainViewModel.SortOrder.PRICE to R.string.sort_price,
                    MainViewModel.SortOrder.DISTANCE to R.string.sort_distance,
                    (MainViewModel.SortOrder.TOTAL_COST to R.string.sort_total).takeIf { prefs.activeCar != null },
                ).forEach { (o, label) ->
                    FilterChip(selected = order == o, onClick = { onSortOrder(o) }, label = { Text(stringResource(label)) })
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
                if (ui.app.favouritesOnly) {
                    Text(stringResource(R.string.fav_none), Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
                } else if (ui.app.userPosition != null) {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Text(stringResource(R.string.preview_none), style = MaterialTheme.typography.bodyMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                            if (ui.app.route == null && prefs.searchRadiusKm < MAX_SEARCH_RADIUS_KM) {
                                FilledTonalButton(onClick = onWiden) {
                                    Text(stringResource(R.string.empty_widen, minOf(MAX_SEARCH_RADIUS_KM, prefs.searchRadiusKm + 10).toInt()))
                                }
                            }
                            if (prefs.brands.isNotEmpty() || prefs.ageFilterOption != AgeFilterOption.ALL) {
                                OutlinedButton(onClick = onClearFilters) { Text(stringResource(R.string.empty_clear_filters)) }
                            }
                        }
                    }
                }
            }
            HorizontalDivider(Modifier.padding(top = 8.dp))
        }
        val favourites = prefs.favouriteIds
        items(ui.visible.rows, key = { it.station.id }) { row ->
            StationRowItem(row, favourite = row.station.id in favourites, sortedByTotalCost = ui.visible.sortedByTotalCost, onClick = { onStation(row.station.id) })
        }
    }
}

@Composable
private fun StationRowItem(row: StationRow, favourite: Boolean, sortedByTotalCost: Boolean, onClick: () -> Unit) {
    val s = row.station.station
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    val navigateLabel = stringResource(R.string.detail_navigate)
    val navigate = { openDirections(context, row.station.station.lat, row.station.station.lon, row.station.brand) }
    val distance = row.routeDetourKm ?: row.distanceFromUserKm
    val description = (
        if (distance != null) {
            stringResource(R.string.a11y_station, row.station.brand, price(row.finalPrice), km(distance))
        } else {
            stringResource(R.string.a11y_station_no_distance, row.station.brand, price(row.finalPrice))
        }
        ) + if (favourite) ", " + stringResource(R.string.a11y_favourite) else ""
    ListItem(
        modifier = Modifier.clickable(onClick = onClick).clearAndSetSemantics {
            contentDescription = description
            role = Role.Button
            customActions = listOf(CustomAccessibilityAction(navigateLabel) { navigate(); true })
        },
        headlineContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (favourite) {
                    Icon(Icons.Filled.Favorite, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp).padding(end = 4.dp))
                }
                Text(row.station.brand, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        },
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
            Row(verticalAlignment = Alignment.CenterVertically) {
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
                // Directions without opening the details
                IconButton(onClick = navigate) {
                    Icon(painterResource(R.drawable.ic_directions), contentDescription = navigateLabel, tint = MaterialTheme.colorScheme.primary)
                }
            }
        },
    )
}

/** When the price last changed: "updated today", "updated yesterday", "updated 2 days ago"… */
@Composable
fun ageLabel(s: PriceStaleness): String = when {
    // days == windowDays: every checked day had the same price, so it is at least that old.
    s.isAtLeast() && s.days == 1 -> stringResource(R.string.age_label_yesterday_or_earlier)
    s.isAtLeast() -> pluralStringResource(R.plurals.age_label_at_least, s.days, s.days)
    s.days == 0 -> stringResource(R.string.age_label_today)
    s.days == 1 -> stringResource(R.string.age_label_yesterday)
    else -> pluralStringResource(R.plurals.age_label_days_ago, s.days, s.days)
}

fun PriceStaleness.isAtLeast(): Boolean = windowDays > 0 && days >= windowDays

/** MITECO's dd-mm-yyyy as dd/mm/yyyy. */
fun PriceStaleness.sinceLabel(): String = since.replace('-', '/')
