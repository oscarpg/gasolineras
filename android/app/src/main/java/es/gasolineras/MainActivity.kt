package es.gasolineras

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import es.gasolineras.diagnostics.DiagnosticsScreen
import es.gasolineras.diagnostics.DiagnosticsViewModel
import es.gasolineras.diagnostics.MapTestScreen
import es.gasolineras.ui.main.MainScreen
import es.gasolineras.ui.theme.GasolinerasTheme

class MainActivity : ComponentActivity() {
    private val mainViewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            GasolinerasTheme {
                val diagnostics: DiagnosticsViewModel = viewModel()
                var screen by rememberSaveable { mutableStateOf(Screen.MAIN) }
                if (screen == Screen.DIAGNOSTICS) BackHandler { screen = Screen.MAIN }
                if (screen == Screen.MAP_TEST) BackHandler { screen = Screen.DIAGNOSTICS }
                when (screen) {
                    Screen.MAIN -> MainScreen(mainViewModel, MapModule.renderer, onOpenDiagnostics = { screen = Screen.DIAGNOSTICS })
                    Screen.DIAGNOSTICS -> DiagnosticsScreen(
                        diagnostics,
                        onOpenMapTest = { screen = Screen.MAP_TEST },
                        onBack = { screen = Screen.MAIN },
                    )
                    Screen.MAP_TEST -> MapTestScreen(
                        renderer = MapModule.renderer,
                        stations = diagnostics.mapStations,
                        onFinished = diagnostics::onMapTestFinished,
                        onBack = { screen = Screen.DIAGNOSTICS },
                    )
                }
            }
        }
    }

    override fun onStop() {
        super.onStop()
        mainViewModel.flush()
    }

    private enum class Screen { MAIN, DIAGNOSTICS, MAP_TEST }
}
