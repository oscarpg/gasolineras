package es.gasolineras.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import es.gasolineras.R
import es.gasolineras.core.domain.Car
import es.gasolineras.core.domain.Discount
import es.gasolineras.core.domain.DiscountType
import es.gasolineras.core.domain.FuelType
import es.gasolineras.state.CarInput
import es.gasolineras.ui.text.label

/** Parses "6,2" or "6.2"; null unless positive. */
private fun positiveNumber(text: String): Double? = text.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 && it.isFinite() }

/** Add or edit a car. */
@Composable
fun CarDialog(car: Car?, onSave: (CarInput) -> Unit, onDismiss: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(car?.name.orEmpty()) }
    var fuel by rememberSaveable { mutableStateOf(car?.fuel ?: FuelType.GASOLINA_95) }
    var tank by rememberSaveable { mutableStateOf(car?.tankLitres?.let(::number).orEmpty()) }
    var consumption by rememberSaveable { mutableStateOf(car?.consumptionL100km?.let(::number).orEmpty()) }
    var showError by rememberSaveable { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(if (car == null) R.string.cars_add else R.string.cars_edit)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.cars_name)) },
                    placeholder = { Text(stringResource(R.string.cars_name_hint)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(stringResource(R.string.cars_fuel), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 12.dp))
                Dropdown(
                    selected = stringResource(fuel.label()),
                    options = FuelType.entries.map { it to stringResource(it.label()) },
                    onSelect = { fuel = it },
                )
                OutlinedTextField(
                    value = tank,
                    onValueChange = { tank = it },
                    label = { Text(stringResource(R.string.cars_tank)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                OutlinedTextField(
                    value = consumption,
                    onValueChange = { consumption = it },
                    label = { Text(stringResource(R.string.cars_consumption)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                if (showError) {
                    Text(stringResource(R.string.cars_incomplete), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val t = positiveNumber(tank)
                val c = positiveNumber(consumption)
                if (name.isBlank() || t == null || c == null) showError = true else onSave(CarInput(name.trim(), fuel, t, c))
            }) { Text(stringResource(R.string.action_save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}

/** Add or update a brand's discount. */
@Composable
fun DiscountDialog(brands: List<String>, onSave: (String, Discount) -> Unit, onDismiss: () -> Unit) {
    var brand by rememberSaveable { mutableStateOf<String?>(null) }
    var type by rememberSaveable { mutableStateOf(DiscountType.CTS) }
    var value by rememberSaveable { mutableStateOf("") }
    val parsed = positiveNumber(value)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.discounts_add)) },
        text = {
            Column {
                Text(stringResource(R.string.discounts_brand), style = MaterialTheme.typography.labelLarge)
                Dropdown(
                    selected = brand ?: stringResource(R.string.discounts_choose_brand),
                    options = brands.map { it to it },
                    onSelect = { brand = it },
                )
                listOf(DiscountType.CTS to R.string.discounts_type_cents, DiscountType.PCT to R.string.discounts_type_percent).forEach { (t, label) ->
                    Row(
                        Modifier.fillMaxWidth().selectable(selected = type == t, role = Role.RadioButton) { type = t }.padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = type == t, onClick = null)
                        Text(stringResource(label), modifier = Modifier.padding(start = 12.dp))
                    }
                }
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = { Text(stringResource(R.string.discounts_value)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
        },
        confirmButton = {
            TextButton(enabled = brand != null && parsed != null, onClick = { onSave(brand!!, Discount(type, parsed!!)) }) {
                Text(stringResource(R.string.action_save))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}

@Composable
private fun <T> Dropdown(selected: String, options: List<Pair<T, String>>, onSelect: (T) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text(selected) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.heightIn(max = 360.dp)) {
            options.forEach { (value, label) ->
                DropdownMenuItem(text = { Text(label) }, onClick = {
                    onSelect(value)
                    open = false
                })
            }
        }
    }
}
