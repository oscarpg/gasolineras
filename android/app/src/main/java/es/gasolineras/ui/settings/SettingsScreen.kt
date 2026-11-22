package es.gasolineras.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import es.gasolineras.BuildConfig
import es.gasolineras.MainViewModel
import es.gasolineras.R
import es.gasolineras.core.domain.AgeFilterOption
import es.gasolineras.core.domain.AppLocale
import es.gasolineras.core.domain.Car
import es.gasolineras.core.domain.DiscountType
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.MAX_CUSTOM_AGE_DAYS
import es.gasolineras.core.domain.MAX_ROUTE_DETOUR_KM
import es.gasolineras.core.domain.MAX_SEARCH_RADIUS_KM
import es.gasolineras.core.domain.MIN_CUSTOM_AGE_DAYS
import es.gasolineras.core.domain.MIN_ROUTE_DETOUR_KM
import es.gasolineras.core.domain.MIN_SEARCH_RADIUS_KM
import es.gasolineras.state.countBrands
import es.gasolineras.ui.text.label
import kotlin.math.roundToInt

/** All preferences, grouped like the web app's drawer: fuel, distance, price age, cars, brands, discounts, language. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(viewModel: MainViewModel, onLocaleChosen: (AppLocale?) -> Unit, onBack: () -> Unit) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val prefs = ui.app.preferences
    val brands = remember(ui.app.stations) { countBrands(ui.app.stations) }
    var carDialog by remember { mutableStateOf<CarDialogTarget?>(null) }
    var discountDialog by remember { mutableStateOf(false) }
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.navigate_back)) }
                },
                scrollBehavior = scrollBehavior,
            )
        },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = WindowInsets.navigationBars.asPaddingValues()) {
            // Fuel
            item { SectionTitle(R.string.settings_fuel) }
            item {
                FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FuelType.entries.forEach { fuel ->
                        FilterChip(selected = prefs.fuel == fuel, onClick = { viewModel.setFuel(fuel) }, label = { Text(stringResource(fuel.label())) })
                    }
                }
                if (prefs.activeCar != null) Note(R.string.settings_fuel_car_note)
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

            // Cars
            item { SectionTitle(R.string.cars_title) }
            if (prefs.cars.isEmpty()) item { Note(R.string.cars_none) }
            prefs.cars.forEach { car ->
                item(key = "car-${car.id}") {
                    ListItem(
                        modifier = Modifier.selectable(selected = car.id == prefs.activeCarId, role = Role.RadioButton) { viewModel.selectCar(car.id) },
                        leadingContent = { RadioButton(selected = car.id == prefs.activeCarId, onClick = null) },
                        headlineContent = { Text(car.name) },
                        supportingContent = {
                            Text(stringResource(R.string.cars_details, stringResource(car.fuel.label()), number(car.tankLitres), number(car.consumptionL100km)))
                        },
                        trailingContent = {
                            Row {
                                IconButton(onClick = { carDialog = CarDialogTarget(car) }) { Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.cars_edit)) }
                                IconButton(onClick = { viewModel.deleteCar(car.id) }) { Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.cars_delete)) }
                            }
                        },
                    )
                }
            }
            item {
                OutlinedButton(onClick = { carDialog = CarDialogTarget(null) }, modifier = Modifier.padding(horizontal = 16.dp)) {
                    Text(stringResource(R.string.cars_add))
                }
            }

            // Brands
            item { SectionTitle(R.string.brands_title) }
            if (brands.isEmpty()) {
                item { Note(R.string.brands_waiting) }
            } else {
                item {
                    SwitchRow(stringResource(R.string.brands_all, brands.size), prefs.brands.isEmpty()) { all ->
                        viewModel.setAllBrands(all, brands.map { it.first })
                    }
                }
                if (prefs.brands.isNotEmpty()) {
                    brands.forEach { (brand, count) ->
                        item(key = "brand-$brand") {
                            Row(
                                Modifier.fillMaxWidth()
                                    .toggleable(value = brand in prefs.brands, role = Role.Checkbox) { viewModel.setBrandSelected(brand, it) }
                                    .padding(horizontal = 16.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(checked = brand in prefs.brands, onCheckedChange = null)
                                Text(stringResource(R.string.brands_count, brand, count), modifier = Modifier.padding(start = 12.dp))
                            }
                        }
                    }
                }
            }

            // Discounts
            item { SectionTitle(R.string.discounts_title) }
            if (prefs.discounts.isEmpty()) item { Note(R.string.discounts_none) }
            prefs.discounts.forEach { (brand, discount) ->
                item(key = "discount-$brand") {
                    ListItem(
                        headlineContent = { Text(brand) },
                        supportingContent = {
                            Text(
                                if (discount.type == DiscountType.CTS) stringResource(R.string.discounts_label_cents, number(discount.value))
                                else stringResource(R.string.discounts_label_percent, number(discount.value)),
                            )
                        },
                        trailingContent = {
                            IconButton(onClick = { viewModel.removeDiscount(brand) }) {
                                Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.discounts_delete))
                            }
                        },
                    )
                }
            }
            item {
                OutlinedButton(onClick = { discountDialog = true }, enabled = brands.isNotEmpty(), modifier = Modifier.padding(horizontal = 16.dp)) {
                    Text(stringResource(R.string.discounts_add))
                }
            }

            // Language
            item { SectionTitle(R.string.language_title) }
            listOf(null to R.string.language_auto, AppLocale.ES to R.string.language_es, AppLocale.EN to R.string.language_en).forEach { (locale, label) ->
                item(key = "lang-${locale?.tag ?: "auto"}") {
                    RadioRow(stringResource(label), prefs.locale == locale) {
                        if (prefs.locale != locale) {
                            viewModel.setLocale(locale)
                            onLocaleChosen(locale)
                        }
                    }
                }
            }

            // About
            item { SectionTitle(R.string.about_title) }
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Text(stringResource(R.string.about_data), style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.about_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }

    carDialog?.let { target ->
        CarDialog(
            car = target.car,
            onSave = { input ->
                if (target.car == null) viewModel.addCar(input) else viewModel.updateCar(target.car.id, input)
                carDialog = null
            },
            onDismiss = { carDialog = null },
        )
    }
    if (discountDialog) {
        DiscountDialog(
            brands = brands.map { it.first },
            onSave = { brand, discount ->
                viewModel.setDiscount(brand, discount)
                discountDialog = false
            },
            onDismiss = { discountDialog = false },
        )
    }
}

private class CarDialogTarget(val car: Car?)

@Composable
private fun SectionTitle(text: Int) {
    HorizontalDivider(Modifier.padding(top = 8.dp))
    Text(
        stringResource(text),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
    )
}

@Composable
private fun Note(text: Int) = Text(
    stringResource(text),
    style = MaterialTheme.typography.bodySmall,
    color = MaterialTheme.colorScheme.onSurfaceVariant,
    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
)

@Composable
private fun RadioRow(text: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().selectable(selected = selected, role = Role.RadioButton, onClick = onClick).padding(horizontal = 16.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = null)
        Text(text, modifier = Modifier.padding(start = 12.dp))
    }
}

@Composable
private fun SwitchRow(text: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().toggleable(value = checked, role = Role.Switch, onValueChange = onChange).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = null)
    }
}

/** Slider over whole numbers in [range]. */
@Composable
private fun LabeledSlider(label: String, value: Double, range: ClosedFloatingPointRange<Double>, onChange: (Double) -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Slider(
            value = value.toFloat(),
            onValueChange = { onChange(it.roundToInt().toDouble()) },
            valueRange = range.start.toFloat()..range.endInclusive.toFloat(),
            steps = (range.endInclusive - range.start).roundToInt() - 1,
        )
    }
}

/** 6.0 → "6", 6.2 → "6,2" (locale aware). */
internal fun number(v: Double): String =
    if (v == Math.floor(v)) v.toLong().toString() else String.format(java.util.Locale.getDefault(), "%.1f", v)

@androidx.annotation.StringRes
private fun AgeFilterOption.label(): Int = when (this) {
    AgeFilterOption.ALL -> R.string.age_all
    AgeFilterOption.UPDATED_TODAY -> R.string.age_updatedToday
    AgeFilterOption.AT_MOST_1 -> R.string.age_atMost1
    AgeFilterOption.AT_MOST_2 -> R.string.age_atMost2
    AgeFilterOption.AT_MOST_3 -> R.string.age_atMost3
    AgeFilterOption.AT_MOST_CUSTOM -> R.string.age_atMostCustom
    AgeFilterOption.EXACTLY_1 -> R.string.age_exactly1
    AgeFilterOption.EXACTLY_2 -> R.string.age_exactly2
    AgeFilterOption.MORE_THAN_3 -> R.string.age_moreThan3
    AgeFilterOption.MORE_THAN_CUSTOM -> R.string.age_moreThanCustom
}

