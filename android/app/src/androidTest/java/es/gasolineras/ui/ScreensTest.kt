package es.gasolineras.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import es.gasolineras.MainUiState
import es.gasolineras.PriceDay
import es.gasolineras.R
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.LatLng
import es.gasolineras.core.domain.Preferences
import es.gasolineras.core.domain.Station
import es.gasolineras.state.ControllerState
import es.gasolineras.state.Status
import es.gasolineras.state.VisibleStationsSelector
import es.gasolineras.state.addStations
import es.gasolineras.state.createInitialState
import es.gasolineras.state.setUserPosition
import es.gasolineras.ui.main.ResultsSheet
import es.gasolineras.ui.main.StationDetailSheet
import es.gasolineras.ui.text.km
import es.gasolineras.ui.text.price
import es.gasolineras.ui.theme.GasolinerasTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate

/** The main screens rendered with fixed data: texts, accessibility descriptions and actions. */
@RunWith(AndroidJUnit4::class)
class ScreensTest {
    @get:Rule val compose = createComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    private fun station(id: String, name: String, lat: Double, price: Double) = Station(
        id = id, code = id, provinceCode = "28", bulletinDate = "21/11/2026", name = name,
        address = "Calle $id, Madrid", lat = lat, lon = -3.7, openingHours = "L-D: 24H",
        prices = mapOf(FuelType.GASOLINA_95 to price, FuelType.GASOLEO_A to price - 0.1),
    )

    private val ui: MainUiState = run {
        val app = createInitialState(Preferences.DEFAULT)
            .addStations(listOf(station("1", "CEPSA", 40.41, 1.459), station("2", "E.S. REPSOL", 40.43, 1.509)))
            .setUserPosition(LatLng(40.4, -3.7))
        MainUiState(app, VisibleStationsSelector().select(app), ControllerState(status = Status.Ready))
    }

    @Test
    fun resultsShowSummaryAndAccessibleRows() {
        var opened: String? = null
        compose.setContent {
            GasolinerasTheme {
                ResultsSheet(ui, online = true, onFuel = {}, onCar = {}, onFavouritesOnly = {}, onOpenFilters = {}, onWiden = {}, onClearFilters = {}, onSortByTotalCost = {}, onStation = { opened = it }, onRetry = {}, onDismissError = {})
            }
        }
        compose.onNodeWithText(context.getString(R.string.preview_summary_radius, 2, 15)).assertIsDisplayed()

        val cheapest = ui.visible.rows.first()
        assertEquals("CEPSA", cheapest.station.brand)
        val description = context.getString(R.string.a11y_station, "CEPSA", price(cheapest.finalPrice), km(cheapest.distanceFromUserKm!!))
        compose.onNodeWithContentDescription(description).assertIsDisplayed().performClick()
        assertEquals("1", opened)
    }

    @Test
    fun offlineBannerAppearsWithoutConnection() {
        compose.setContent {
            GasolinerasTheme {
                ResultsSheet(ui, online = false, onFuel = {}, onCar = {}, onFavouritesOnly = {}, onOpenFilters = {}, onWiden = {}, onClearFilters = {}, onSortByTotalCost = {}, onStation = {}, onRetry = {}, onDismissError = {})
            }
        }
        compose.onNodeWithText(context.getString(R.string.offline_banner)).assertIsDisplayed()
    }

    @Test
    fun stationDetailsShowPriceChartAndActions() {
        var shownOnMap = false
        val row = ui.visible.rows.first()
        val history = (6 downTo 0).map { PriceDay(LocalDate.of(2026, 11, 21).minusDays(it.toLong()), if (it > 3) 1.479 else 1.459) }
        compose.setContent {
            GasolinerasTheme {
                StationDetailSheet(row, FuelType.GASOLINA_95, loadHistory = { history }, favourite = false, onToggleFavourite = {}, onShowOnMap = { shownOnMap = true }, onDismiss = {})
            }
        }
        // The price appears as the headline and again in the all-fuels list
        compose.onAllNodesWithText("${price(row.finalPrice)} €/l").onFirst().assertIsDisplayed()
        compose.onNodeWithText(context.getString(R.string.detail_navigate)).assertIsDisplayed()
        compose.onNodeWithContentDescription(context.getString(R.string.detail_share)).assertIsDisplayed()
        compose.waitUntil(5_000) {
            compose.onAllNodesWithContentDescriptionCount(context.getString(R.string.chart_description)) > 0
        }
        compose.onNodeWithText(context.getString(R.string.detail_show_on_map)).performClick()
        assertTrue(shownOnMap)
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithContentDescriptionCount(text: String): Int =
        onAllNodes(androidx.compose.ui.test.hasContentDescription(text)).fetchSemanticsNodes().size
}
