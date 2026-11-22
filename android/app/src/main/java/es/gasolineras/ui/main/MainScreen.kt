package es.gasolineras.ui.main

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import es.gasolineras.MainViewModel
import es.gasolineras.R
import es.gasolineras.core.domain.StationRow
import es.gasolineras.map.api.GeoPoint
import es.gasolineras.map.api.MapContent
import es.gasolineras.map.api.MapMarker
import es.gasolineras.map.api.MapRenderer
import es.gasolineras.ui.text.price
import es.gasolineras.ui.text.toColor
import kotlinx.coroutines.launch

private val SHEET_PEEK = 200.dp
private val SIDE_PANEL_WIDTH = 400.dp
private const val WIDE_LAYOUT_DP = 600

/**
 * The app's main screen: full-screen map with price markers, a search bar for an address or a
 * route destination, a "my location" button, and the results in a bottom sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(viewModel: MainViewModel, renderer: MapRenderer, onOpenSettings: () -> Unit, onOpenDiagnostics: () -> Unit) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val camera by viewModel.camera.collectAsStateWithLifecycle()
    val selectedId by viewModel.selectedStationId.collectAsStateWithLifecycle()
    val detailOpen by viewModel.detailOpen.collectAsStateWithLifecycle()
    val scaffoldState = rememberBottomSheetScaffoldState()
    val scope = rememberCoroutineScope()
    val locationPermissions = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    val startPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { viewModel.start() }
    val gpsPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { viewModel.requestGps() }
    LaunchedEffect(Unit) { startPermission.launch(locationPermissions) }

    val markers = remember(ui.visible) { ui.visible.rows.map { it.toMarker() } }
    val content = remember(markers, selectedId, ui.app.route, ui.app.userPosition) {
        MapContent(
            markers = markers,
            selectedId = selectedId,
            route = ui.app.route?.map { GeoPoint(it.lat, it.lon) },
            userPosition = ui.app.userPosition?.let { GeoPoint(it.lat, it.lon) },
        )
    }

    val online by viewModel.online.collectAsStateWithLifecycle()
    val wide = LocalConfiguration.current.screenWidthDp >= WIDE_LAYOUT_DP

    val results: @Composable () -> Unit = {
        ResultsSheet(
            ui = ui,
            online = online,
            onFuel = viewModel::setFuel,
            onSortByTotalCost = viewModel::setSortByTotalCost,
            onStation = { viewModel.selectStation(it) },
            onRetry = { ui.controller.error?.retry?.invoke() },
            onDismissError = viewModel::dismissError,
        )
    }

    // The map with its overlays; [bottomInset] keeps markers and the button clear of the sheet.
    val mapArea: @Composable (bottomInset: Dp) -> Unit = { bottomInset ->
        Box(Modifier.fillMaxSize()) {
            renderer.Map(
                content = content,
                camera = camera,
                darkTheme = isSystemInDarkTheme(),
                onMarkerClick = { viewModel.selectStation(it, moveCamera = false) }, // reopens details of a highlighted station too
                onCameraIdle = {},
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 72.dp, bottom = bottomInset),
            )
            Column(Modifier.statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp)) {
                SearchBar(
                    onSearch = viewModel::searchAddress,
                    onRoute = viewModel::calculateRoute,
                    onRefresh = { viewModel.refresh() },
                    onOpenSettings = onOpenSettings,
                    onOpenDiagnostics = onOpenDiagnostics,
                )
                if (ui.app.route != null) {
                    AssistChip(
                        onClick = viewModel::clearRoute,
                        label = { Text(stringResource(R.string.main_route_active) + " · " + stringResource(R.string.preview_clear_route)) },
                        trailingIcon = { Icon(Icons.Filled.Clear, contentDescription = null) },
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
            FloatingActionButton(
                onClick = { gpsPermission.launch(locationPermissions) },
                modifier = Modifier.align(Alignment.BottomEnd)
                    .then(if (bottomInset == 0.dp) Modifier.navigationBarsPadding() else Modifier) // no sheet below it
                    .padding(end = 16.dp, bottom = bottomInset + 16.dp),
            ) {
                Icon(Icons.Filled.LocationOn, contentDescription = stringResource(R.string.preview_my_location))
            }
        }
    }

    if (wide) {
        // Tablets, foldables and landscape: list beside the map.
        Row(Modifier.fillMaxSize()) {
            Surface(tonalElevation = 1.dp, modifier = Modifier.width(SIDE_PANEL_WIDTH).fillMaxHeight()) {
                Column(Modifier.statusBarsPadding().padding(top = 8.dp)) { results() }
            }
            Box(Modifier.weight(1f)) { mapArea(0.dp) }
        }
    } else {
        BottomSheetScaffold(
            scaffoldState = scaffoldState,
            sheetPeekHeight = SHEET_PEEK,
            sheetContent = { results() },
        ) { mapArea(SHEET_PEEK) }
    }

    val selectedRow = selectedId?.let { id -> ui.visible.rows.firstOrNull { it.station.id == id } }
    if (selectedRow != null && detailOpen) {
        StationDetailSheet(
            row = selectedRow,
            fuel = ui.app.preferences.fuel,
            loadHistory = { viewModel.priceHistory(selectedRow.station.station, ui.app.preferences.fuel) },
            onShowOnMap = {
                viewModel.showSelectedOnMap()
                if (!wide) scope.launch { scaffoldState.bottomSheetState.partialExpand() }
            },
            onDismiss = { viewModel.selectStation(null) },
        )
    }
}

private fun StationRow.toMarker() = MapMarker(
    id = station.id,
    position = GeoPoint(station.station.lat, station.station.lon),
    label = price(finalPrice),
    color = color.toColor(),
)

/** Address or destination search: the keyboard's search key sets the origin, the arrow makes a route. */
@Composable
private fun SearchBar(
    onSearch: (String) -> Unit,
    onRoute: (String) -> Unit,
    onRefresh: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenDiagnostics: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var menu by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    Surface(shape = MaterialTheme.shapes.extraLarge, tonalElevation = 6.dp, shadowElevation = 6.dp, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text(stringResource(R.string.main_search_hint)) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = if (query.isNotEmpty()) {
                    { IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.main_clear_search)) } }
                } else {
                    null
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    if (query.isNotBlank()) {
                        onSearch(query)
                        focus.clearFocus()
                    }
                }),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                modifier = Modifier.weight(1f),
            )
            if (query.isNotBlank()) {
                IconButton(onClick = {
                    onRoute(query)
                    focus.clearFocus()
                }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = stringResource(R.string.main_route_here))
                }
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = stringResource(R.string.main_more)) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    if (query.isNotBlank()) {
                        DropdownMenuItem(text = { Text(stringResource(R.string.main_use_as_origin)) }, onClick = {
                            menu = false
                            onSearch(query)
                            focus.clearFocus()
                        })
                        DropdownMenuItem(text = { Text(stringResource(R.string.main_route_here)) }, onClick = {
                            menu = false
                            onRoute(query)
                            focus.clearFocus()
                        })
                    }
                    DropdownMenuItem(text = { Text(stringResource(R.string.settings_open)) }, onClick = {
                        menu = false
                        onOpenSettings()
                    })
                    DropdownMenuItem(text = { Text(stringResource(R.string.preview_refresh)) }, onClick = {
                        menu = false
                        onRefresh()
                    })
                    DropdownMenuItem(text = { Text(stringResource(R.string.diag_title)) }, onClick = {
                        menu = false
                        onOpenDiagnostics()
                    })
                }
            }
        }
    }
}
