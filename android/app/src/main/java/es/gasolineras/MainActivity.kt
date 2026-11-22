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
import es.gasolineras.ui.AppLocales
import es.gasolineras.ui.main.MainScreen
import es.gasolineras.ui.settings.SettingsScreen
import android.content.Context
import android.content.Intent
import es.gasolineras.ui.theme.GasolinerasTheme

class MainActivity : ComponentActivity() {
    private val mainViewModel: MainViewModel by viewModels()

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(AppLocales.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Android 13+: the language may have been changed in system settings.
        AppLocales.systemChoice(this).let { system ->
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU && system != mainViewModel.ui.value.app.preferences.locale) {
                mainViewModel.setLocale(system)
            }
        }
        handleWidgetTap(intent)
        setContent {
            GasolinerasTheme {
                val diagnostics: DiagnosticsViewModel = viewModel()
                var screen by rememberSaveable { mutableStateOf(Screen.MAIN) }
                if (screen == Screen.DIAGNOSTICS || screen == Screen.SETTINGS) BackHandler { screen = Screen.MAIN }
                if (screen == Screen.MAP_TEST) BackHandler { screen = Screen.DIAGNOSTICS }
                when (screen) {
                    Screen.MAIN -> MainScreen(
                        mainViewModel,
                        MapModule.renderer,
                        onOpenSettings = { screen = Screen.SETTINGS },
                        onOpenDiagnostics = { screen = Screen.DIAGNOSTICS },
                    )
                    Screen.SETTINGS -> SettingsScreen(
                        mainViewModel,
                        onLocaleChosen = { AppLocales.apply(this@MainActivity, it) },
                        onBack = { screen = Screen.MAIN },
                    )
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

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleWidgetTap(intent)
    }

    /** A station tapped on the home-screen widget. */
    private fun handleWidgetTap(intent: Intent?) {
        intent?.getStringExtra(EXTRA_STATION_ID)?.let { id ->
            intent.removeExtra(EXTRA_STATION_ID)
            mainViewModel.openStationWhenAvailable(id)
        }
    }

    override fun onStop() {
        super.onStop()
        mainViewModel.flush()
    }

    companion object {
        const val EXTRA_STATION_ID = "station_id"
    }

    private enum class Screen { MAIN, SETTINGS, DIAGNOSTICS, MAP_TEST }
}
