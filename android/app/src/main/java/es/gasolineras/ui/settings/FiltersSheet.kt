package es.gasolineras.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import es.gasolineras.MainViewModel
import es.gasolineras.R
import es.gasolineras.core.domain.AgeFilterOption
import es.gasolineras.core.domain.MAX_CUSTOM_AGE_DAYS
import es.gasolineras.core.domain.MAX_ROUTE_DETOUR_KM
import es.gasolineras.core.domain.MAX_SEARCH_RADIUS_KM
import es.gasolineras.core.domain.MIN_CUSTOM_AGE_DAYS
import es.gasolineras.core.domain.MIN_ROUTE_DETOUR_KM
import es.gasolineras.core.domain.MIN_SEARCH_RADIUS_KM
import es.gasolineras.core.domain.Preferences
import es.gasolineras.state.AppState
import es.gasolineras.state.countBrands
import es.gasolineras.ui.brand.BrandLogo
import kotlin.math.roundToInt

/** How many station filters differ from the defaults (shown on the "Filters" button). */
fun activeFilterCount(p: Preferences): Int = listOf(
    p.searchRadiusKm != Preferences.DEFAULT.searchRadiusKm,
    p.ageFilterOption != AgeFilterOption.ALL,
    p.brands.isNotEmpty(),
    p.routeOnly || p.routeDetourKm != Preferences.DEFAULT.routeDetourKm,
).count { it }

/** Station filters: distance, route detour, price age and brands. Opened from the results list or the menu. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FiltersSheet(app: AppState, viewModel: MainViewModel, onDismiss: () -> Unit) {
    val prefs = app.preferences
    val brands = remember(app.stations) { countBrands(app.stations) }
    // The checklist stays open while choosing, even with nothing ticked (= no filter).
    var chooseBrands by rememberSaveable { mutableStateOf(prefs.brands.isNotEmpty()) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        LazyColumn(contentPadding = WindowInsets.navigationBars.asPaddingValues()) {
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.filters_title), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    if (activeFilterCount(prefs) > 0) {
                        TextButton(onClick = {
                            chooseBrands = false
                            viewModel.resetFilters()
                        }) { Text(stringResource(R.string.filters_reset)) }
                    }
                }
            }

            // Distance and route
            item { SectionTitle(R.string.settings_distance) }
            item {
                LabeledSlider(
                    label = stringResource(R.string.settings_radius, prefs.searchRadiusKm.roundToInt()),
                    value = prefs.searchRadiusKm,
                    range = MIN_SEARCH_RADIUS_KM..MAX_SEARCH_RADIUS_KM,
                    onChange = viewModel::setSearchRadius,
                )
                LabeledSlider(
                    label = stringResource(R.string.settings_detour, prefs.routeDetourKm.roundToInt()),
                    value = prefs.routeDetourKm,
                    range = MIN_ROUTE_DETOUR_KM..MAX_ROUTE_DETOUR_KM,
                    onChange = viewModel::setRouteDetour,
                )
                SwitchRow(stringResource(R.string.settings_route_only), prefs.routeOnly, viewModel::setRouteOnly)
            }

            // Price age
            item { SectionTitle(R.string.settings_age) }
            AgeFilterOption.entries.forEach { option ->
                item(key = "age-${option.id}") {
                    RadioRow(stringResource(option.label()), prefs.ageFilterOption == option) { viewModel.setAgeFilterOption(option) }
                }
            }
            if (prefs.ageFilterOption.isCustom) {
                item {
                    LabeledSlider(
                        label = stringResource(R.string.settings_custom_days, prefs.ageFilterCustomDays),
                        value = prefs.ageFilterCustomDays.toDouble(),
                        range = MIN_CUSTOM_AGE_DAYS.toDouble()..MAX_CUSTOM_AGE_DAYS.toDouble(),
                        onChange = { viewModel.setCustomAgeDays(it.roundToInt()) },
                    )
                }
            }

            // Brands
            item { SectionTitle(R.string.brands_title) }
            if (brands.isEmpty()) {
                item { Note(R.string.brands_waiting) }
            } else {
                item {
                    SwitchRow(stringResource(R.string.brands_all, brands.size), !chooseBrands) { all ->
                        chooseBrands = !all
                        viewModel.setAllBrands(all, brands.map { it.first })
                    }
                }
                if (chooseBrands) {
                    item {
                        Row(Modifier.padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { viewModel.setAllBrands(false, brands.map { it.first }) }) { Text(stringResource(R.string.brands_select_all)) }
                            TextButton(onClick = { viewModel.clearBrands() }) { Text(stringResource(R.string.brands_select_none)) }
                        }
                        if (prefs.brands.isEmpty()) Note(R.string.brands_none_selected)
                    }
                    brands.forEach { (brand, count) ->
                        item(key = "brand-$brand") {
                            Row(
                                Modifier.fillMaxWidth()
                                    .toggleable(value = brand in prefs.brands, role = Role.Checkbox) { viewModel.setBrandSelected(brand, it) }
                                    .padding(horizontal = 16.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(checked = brand in prefs.brands, onCheckedChange = null)
                                BrandLogo(brand, 24.dp, Modifier.padding(start = 12.dp))
                                Text(stringResource(R.string.brands_count, brand, count), modifier = Modifier.padding(start = 12.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
