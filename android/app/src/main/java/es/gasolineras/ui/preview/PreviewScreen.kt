package es.gasolineras.ui.preview

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import es.gasolineras.MainViewModel
import es.gasolineras.R
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.ScaleColor
import es.gasolineras.core.domain.StationRow
import es.gasolineras.state.HistoryStatus
import es.gasolineras.ui.text.errorText
import es.gasolineras.ui.text.label
import es.gasolineras.ui.text.statusText
import java.util.Locale

/**
 * Phase 3 preview: the real app state (location → province → prices → filtered list) with a
 * plain list UI. Phase 4 replaces it with the map and bottom sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PreviewScreen(viewModel: MainViewModel, onBack: () -> Unit) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val prefs = ui.app.preferences
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { viewModel.start() }
    val gpsPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { viewModel.requestGps() }
    val locationPermissions = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    LaunchedEffect(Unit) { permission.launch(locationPermissions) }

    var address by rememberSaveable { mutableStateOf("") }
    var destination by rememberSaveable { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.preview_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.navigate_back))
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
            item {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { gpsPermission.launch(locationPermissions) }) { Text(stringResource(R.string.preview_my_location)) }
                        FilledTonalButton(onClick = { viewModel.refresh() }, enabled = ui.app.loadedProvinces.isNotEmpty()) {
                            Text(stringResource(R.string.preview_refresh))
                        }
                    }
                    OutlinedTextField(
                        value = address,
                        onValueChange = { address = it },
                        label = { Text(stringResource(R.string.preview_search_hint)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { if (address.isNotBlank()) viewModel.searchAddress(address) }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = destination,
                            onValueChange = { destination = it },
                            label = { Text(stringResource(R.string.preview_route_hint)) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                            keyboardActions = KeyboardActions(onGo = { if (destination.isNotBlank()) viewModel.calculateRoute(destination) }),
                            modifier = Modifier.weight(1f),
                        )
                        if (ui.app.route != null) {
                            TextButton(onClick = { viewModel.clearRoute() }) { Text(stringResource(R.string.preview_clear_route)) }
                        }
                    }
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FuelType.entries.forEach { fuel ->
                            FilterChip(
                                selected = prefs.fuel == fuel,
                                onClick = { viewModel.setFuel(fuel) },
                                label = { Text(stringResource(fuel.label())) },
                            )
                        }
                    }
                    if (prefs.activeCar != null) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(stringResource(R.string.preview_sort_cost), modifier = Modifier.weight(1f))
                            Switch(checked = prefs.sortByTotalCost, onCheckedChange = viewModel::setSortByTotalCost)
                        }
                    }
                }
            }

            ui.controller.error?.let { shown ->
                item {
                    OutlinedCard(Modifier.padding(16.dp).fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text(errorText(shown.error), color = MaterialTheme.colorScheme.error)
                            Row {
                                shown.retry?.let { retry -> TextButton(onClick = retry) { Text(stringResource(R.string.message_retry)) } }
                                TextButton(onClick = { viewModel.dismissError() }) { Text(stringResource(R.string.message_dismiss)) }
                            }
                        }
                    }
                }
            }

            item {
                Column(Modifier.padding(16.dp)) {
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
                        Spacer(Modifier.padding(4.dp))
                        Text(stringResource(R.string.preview_history_loading, it.days), style = MaterialTheme.typography.bodySmall)
                        LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 4.dp))
                    }
                    if (status == null && ui.visible.rows.isEmpty()) {
                        Text(stringResource(R.string.preview_none), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                HorizontalDivider()
            }

            items(ui.visible.rows, key = { it.station.id }) { row -> StationListItem(row) }
        }
    }
}

@Composable
private fun StationListItem(row: StationRow) {
    val s = row.station.station
    ListItem(
        headlineContent = { Text(row.station.brand, fontWeight = FontWeight.Medium) },
        supportingContent = {
            Column {
                Text(s.address.ifEmpty { s.name.ifEmpty { stringResource(R.string.station_unnamed) } }, style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    val km = row.routeDetourKm ?: row.distanceFromUserKm
                    km?.let { Text(String.format(Locale.getDefault(), "%.1f km", it), style = MaterialTheme.typography.bodySmall) }
                    row.staleness?.let { st ->
                        AssistChip(
                            onClick = {},
                            label = {
                                Text(
                                    if (st.days >= st.windowDays) stringResource(R.string.preview_age_at_least, st.days)
                                    else stringResource(R.string.preview_age, st.days),
                                )
                            },
                        )
                    }
                }
            }
        },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    String.format(Locale.getDefault(), "%.3f €", row.finalPrice),
                    color = row.color.forText().toColor(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                if (row.discount != null && row.finalPrice != row.basePrice) {
                    Text(String.format(Locale.getDefault(), "%.3f €", row.basePrice), style = MaterialTheme.typography.bodySmall)
                }
                row.cost.totalCost?.let { Text(String.format(Locale.getDefault(), "%.2f € total", it), style = MaterialTheme.typography.bodySmall) }
            }
        },
    )
}

fun ScaleColor.toColor(): Color = Color.hsl(hue.toFloat(), saturation / 100f, lightness / 100f)
