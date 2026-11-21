package es.gasolineras.data.prefs

import es.gasolineras.core.domain.AgeFilterOption
import es.gasolineras.core.domain.AppLocale
import es.gasolineras.core.domain.Car
import es.gasolineras.core.domain.Discount
import es.gasolineras.core.domain.DiscountType
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.MAX_CUSTOM_AGE_DAYS
import es.gasolineras.core.domain.MAX_ROUTE_DETOUR_KM
import es.gasolineras.core.domain.MAX_SEARCH_RADIUS_KM
import es.gasolineras.core.domain.MIN_CUSTOM_AGE_DAYS
import es.gasolineras.core.domain.MIN_ROUTE_DETOUR_KM
import es.gasolineras.core.domain.MIN_SEARCH_RADIUS_KM
import es.gasolineras.core.domain.Preferences
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Preferences ⇄ JSON in the web app's format (schema v3), with the same validation and
 * migrations as storage/preferences.ts. Invalid fields fall back to their defaults; never throws.
 */
object PreferencesCodec {

    /* ---------- JS-like value helpers ---------- */

    private val JsonElement?.str: String? get() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** `String(v)` for the values preferences can hold. */
    private fun JsonElement?.jsString(): String = when (this) {
        null -> "undefined"
        is JsonPrimitive -> content
        else -> toString()
    }

    /** A positive finite number, accepting numeric strings (like the web `positive()`). */
    private fun positive(v: JsonElement?): Double? {
        val p = v as? JsonPrimitive ?: return null
        val n = if (p.isString) p.content.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull() else p.doubleOrNull
        return n?.takeIf { it.isFinite() && it > 0 }
    }

    private fun nonEmptyString(v: JsonElement?): String? = v.str?.takeIf { it.isNotBlank() }

    private fun isTrue(v: JsonElement?) = (v as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull == true

    /** `!!v` in JavaScript. */
    private fun truthy(v: JsonElement?): Boolean = when (v) {
        null, JsonNull -> false
        is JsonPrimitive -> when {
            v.isString -> v.content.isNotEmpty()
            v.booleanOrNull != null -> v.booleanOrNull!!
            else -> v.doubleOrNull.let { it != null && it != 0.0 && !it.isNaN() }
        }
        else -> true
    }

    /** `parseInt(String(v), 10)`, or null for NaN. */
    private fun parseIntJs(v: JsonElement?): Int? =
        Regex("""^\s*[+-]?\d+""").find(v.jsString())?.value?.trim()?.toIntOrNull()

    private fun fuel(v: JsonElement?): FuelType? = FuelType.fromId(v.str)

    /* ---------- sanitizing ---------- */

    private fun sanitizeDiscounts(raw: JsonElement?): Map<String, Discount> {
        val obj = raw as? JsonObject ?: return emptyMap()
        val result = LinkedHashMap<String, Discount>()
        for ((brand, d) in obj) {
            if (d !is JsonObject) continue
            val type = when (d["type"].str) {
                "CTS" -> DiscountType.CTS
                "PCT" -> DiscountType.PCT
                else -> null
            }
            val value = positive(d["value"])
            if (type != null && value != null) result[brand] = Discount(type, value)
        }
        return result
    }

    private fun sanitizeCars(raw: JsonElement?): List<Car> {
        val array = raw as? JsonArray ?: return emptyList()
        return array.mapNotNull { item ->
            val c = item as? JsonObject ?: return@mapNotNull null
            val id = nonEmptyString(c["id"])
            val name = nonEmptyString(c["name"])
            val fuel = fuel(c["fuel"])
            val tank = positive(c["tankLitres"])
            val consumption = positive(c["consumptionL100km"])
            if (id != null && name != null && fuel != null && tank != null && consumption != null) {
                Car(id, name, fuel, tank, consumption)
            } else {
                null
            }
        }
    }

    /**
     * Turns anything (parsed JSON, possibly corrupted or from an older version) into valid
     * Preferences. Also upgrades v2, whose `ageFilterPreset` held the original Spanish codes.
     */
    fun sanitize(raw: JsonElement?): Preferences {
        val p = raw as? JsonObject ?: JsonObject(emptyMap())
        val d = Preferences.DEFAULT
        val customDays = parseIntJs(p["ageFilterCustomDays"])?.takeIf { it != 0 } ?: d.ageFilterCustomDays
        return Preferences(
            fuel = fuel(p["fuel"]) ?: d.fuel,
            ageFilterOption = AgeFilterOption.fromId(p["ageFilterOption"].str)
                ?: AgeFilterOption.LEGACY_VALUES[p["ageFilterPreset"].jsString()]
                ?: d.ageFilterOption,
            ageFilterCustomDays = customDays.coerceIn(MIN_CUSTOM_AGE_DAYS, MAX_CUSTOM_AGE_DAYS),
            searchRadiusKm = (positive(p["searchRadiusKm"]) ?: d.searchRadiusKm).coerceIn(MIN_SEARCH_RADIUS_KM, MAX_SEARCH_RADIUS_KM),
            routeDetourKm = (positive(p["routeDetourKm"]) ?: d.routeDetourKm).coerceIn(MIN_ROUTE_DETOUR_KM, MAX_ROUTE_DETOUR_KM),
            routeOnly = isTrue(p["routeOnly"]),
            sortByTotalCost = isTrue(p["sortByTotalCost"]),
            brands = (p["brands"] as? JsonArray)?.mapNotNull { it.str }?.toCollection(LinkedHashSet()) ?: emptySet(),
            discounts = sanitizeDiscounts(p["discounts"]),
            cars = sanitizeCars(p["cars"]),
            activeCarId = nonEmptyString(p["activeCarId"]),
            locale = when (p["locale"].str) {
                "es" -> AppLocale.ES
                "en" -> AppLocale.EN
                else -> null
            },
        )
    }

    /**
     * Converts preferences saved by the original single-file web app (key `gasolineras_prefs`).
     * v1 shape: { fuel, antiguedad, antiguedadDias, searchRadius, radius, soloRuta, sortByRealCost,
     * brands, discounts: {brand: {tipo, valor}}, cars: [{id, nombre, fuel, deposito, consumo}], activeCarId }
     */
    fun migrateV1(raw: JsonElement?): Preferences {
        val v1 = raw as? JsonObject ?: JsonObject(emptyMap())
        fun field(name: String): JsonElement = v1[name] ?: JsonNull
        val converted = buildJsonObject {
            put("fuel", field("fuel"))
            put("ageFilterPreset", field("antiguedad"))
            put("ageFilterCustomDays", field("antiguedadDias"))
            put("searchRadiusKm", field("searchRadius"))
            put("routeDetourKm", field("radius"))
            put("routeOnly", truthy(v1["soloRuta"]))
            put("sortByTotalCost", truthy(v1["sortByRealCost"]))
            put("brands", field("brands"))
            putJsonObject("discounts") {
                (v1["discounts"] as? JsonObject)?.forEach { (brand, d) ->
                    if (d is JsonObject) {
                        putJsonObject(brand) {
                            put("type", d["tipo"] ?: JsonNull)
                            put("value", d["valor"] ?: JsonNull)
                        }
                    }
                }
            }
            putJsonArray("cars") {
                (v1["cars"] as? JsonArray)?.forEach { c ->
                    if (c is JsonObject) {
                        add(
                            buildJsonObject {
                                put("id", c["id"] ?: JsonNull)
                                put("name", c["nombre"] ?: JsonNull)
                                put("fuel", c["fuel"] ?: JsonNull)
                                put("tankLitres", c["deposito"] ?: JsonNull)
                                put("consumptionL100km", c["consumo"] ?: JsonNull)
                            },
                        )
                    }
                }
            }
            put("activeCarId", field("activeCarId"))
        }
        return sanitize(converted)
    }

    /** JSON in the web app's v3 format. */
    fun encode(p: Preferences): String = buildJsonObject {
        put("schemaVersion", Preferences.SCHEMA_VERSION)
        put("fuel", p.fuel.name)
        put("ageFilterOption", p.ageFilterOption.id)
        put("ageFilterCustomDays", p.ageFilterCustomDays)
        put("searchRadiusKm", p.searchRadiusKm)
        put("routeDetourKm", p.routeDetourKm)
        put("routeOnly", p.routeOnly)
        put("sortByTotalCost", p.sortByTotalCost)
        putJsonArray("brands") { p.brands.forEach { add(JsonPrimitive(it)) } }
        putJsonObject("discounts") {
            p.discounts.forEach { (brand, d) ->
                putJsonObject(brand) {
                    put("type", d.type.name)
                    put("value", d.value)
                }
            }
        }
        putJsonArray("cars") {
            p.cars.forEach { c ->
                add(
                    buildJsonObject {
                        put("id", c.id)
                        put("name", c.name)
                        put("fuel", c.fuel.name)
                        put("tankLitres", c.tankLitres)
                        put("consumptionL100km", c.consumptionL100km)
                    },
                )
            }
        }
        put("activeCarId", p.activeCarId)
        put("locale", p.locale?.tag)
    }.toString()

    /** Parses saved JSON; null for missing or corrupted text. */
    fun parse(json: String?): JsonElement? =
        json?.let { runCatching { Json.parseToJsonElement(it) }.getOrNull() }
}
