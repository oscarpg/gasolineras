package es.gasolineras.diagnostics

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import es.gasolineras.R
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiagnosticsScreen(viewModel: DiagnosticsViewModel, onOpenMapTest: () -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { viewModel.runLocation() }
    val dataPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { viewModel.runData() }
    val copiedMessage = stringResource(R.string.diag_report_copied)
    val notRun = stringResource(R.string.diag_not_run)
    val running = stringResource(R.string.diag_running)

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text(stringResource(R.string.diag_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.navigate_back))
                    }
                },
                scrollBehavior = scrollBehavior,
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(stringResource(R.string.diag_intro), style = MaterialTheme.typography.bodyLarge)
            }
            item {
                ResultCard(stringResource(R.string.diag_device), DiagnosticsReport.device(viewModel.device), ok = null)
            }
            item {
                ResultCard(
                    title = stringResource(R.string.diag_miteco),
                    body = when {
                        viewModel.networkRunning -> running
                        else -> viewModel.miteco?.let(DiagnosticsReport::miteco) ?: notRun
                    },
                    ok = viewModel.miteco?.ok,
                ) {
                    Button(onClick = viewModel::runNetwork, enabled = !viewModel.networkRunning) {
                        Text(stringResource(R.string.diag_run_network))
                    }
                }
            }
            item {
                ResultCard(
                    title = stringResource(R.string.diag_map_tiles),
                    body = when {
                        viewModel.networkRunning -> running
                        else -> viewModel.tiles?.let(DiagnosticsReport::mapTiles) ?: notRun
                    },
                    ok = viewModel.tiles?.ok,
                )
            }
            item {
                ResultCard(
                    title = stringResource(R.string.diag_location),
                    body = when {
                        viewModel.locationRunning -> running
                        else -> viewModel.location?.let(DiagnosticsReport::location) ?: notRun
                    },
                    ok = viewModel.location?.ok,
                ) {
                    Button(
                        onClick = {
                            permissionLauncher.launch(
                                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                            )
                        },
                        enabled = !viewModel.locationRunning,
                    ) { Text(stringResource(R.string.diag_run_location)) }
                }
            }
            item {
                ResultCard(
                    title = stringResource(R.string.diag_map_test),
                    body = viewModel.mapResult?.let { (markers, stats) -> DiagnosticsReport.map(markers, stats) } ?: notRun,
                    ok = viewModel.mapResult?.let { it.second.avgFps >= 45 },
                ) {
                    Button(onClick = onOpenMapTest) { Text(stringResource(R.string.diag_open_map)) }
                }
            }
            item {
                ResultCard(
                    title = stringResource(R.string.diag_data),
                    body = when {
                        viewModel.dataRunning -> running
                        else -> viewModel.data?.lines?.joinToString("\n") ?: notRun
                    },
                    ok = viewModel.data?.ok,
                ) {
                    Button(
                        onClick = {
                            dataPermissionLauncher.launch(
                                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                            )
                        },
                        enabled = !viewModel.dataRunning,
                    ) { Text(stringResource(R.string.diag_run_data)) }
                }
            }
            item {
                val report = viewModel.report
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(stringResource(R.string.diag_report), style = MaterialTheme.typography.titleMedium)
                        SelectionContainer {
                            Text(report, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
                        }
                        Row {
                            FilledTonalButton(onClick = {
                                context.getSystemService(ClipboardManager::class.java)
                                    ?.setPrimaryClip(ClipData.newPlainText("Gasolineras diagnostics", report))
                                scope.launch { snackbar.showSnackbar(copiedMessage) }
                            }) { Text(stringResource(R.string.diag_copy_report)) }
                            Spacer(Modifier.width(8.dp))
                            OutlinedButton(onClick = {
                                val send = Intent(Intent.ACTION_SEND)
                                    .setType("text/plain")
                                    .putExtra(Intent.EXTRA_TEXT, report)
                                context.startActivity(Intent.createChooser(send, null))
                            }) { Text(stringResource(R.string.diag_share_report)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ResultCard(
    title: String,
    body: String,
    ok: Boolean?,
    action: (@Composable () -> Unit)? = null,
) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row {
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                when (ok) {
                    true -> Text("✓", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleMedium)
                    false -> Text("✗", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleMedium)
                    null -> Unit
                }
            }
            Text(body, style = MaterialTheme.typography.bodyMedium)
            action?.invoke()
        }
    }
}
