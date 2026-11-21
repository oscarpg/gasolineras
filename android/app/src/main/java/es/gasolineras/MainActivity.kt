package es.gasolineras

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import es.gasolineras.diagnostics.DiagnosticsScreen
import es.gasolineras.diagnostics.DiagnosticsViewModel
import es.gasolineras.diagnostics.MapTestScreen
import es.gasolineras.ui.theme.GasolinerasTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            GasolinerasTheme {
                val viewModel: DiagnosticsViewModel = viewModel()
                var showMapTest by rememberSaveable { mutableStateOf(false) }
                if (showMapTest) {
                    BackHandler { showMapTest = false }
                    MapTestScreen(
                        renderer = MapModule.renderer,
                        stations = viewModel.mapStations,
                        onFinished = viewModel::onMapTestFinished,
                        onBack = { showMapTest = false },
                    )
                } else {
                    DiagnosticsScreen(viewModel, onOpenMapTest = { showMapTest = true })
                }
            }
        }
    }
}
