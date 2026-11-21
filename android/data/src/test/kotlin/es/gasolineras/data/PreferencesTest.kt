package es.gasolineras.data

import es.gasolineras.core.domain.AgeFilterOption
import es.gasolineras.core.domain.AppLocale
import es.gasolineras.core.domain.Car
import es.gasolineras.core.domain.Discount
import es.gasolineras.core.domain.DiscountType
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.Preferences
import es.gasolineras.data.prefs.LEGACY_PREFERENCES_KEY
import es.gasolineras.data.prefs.PREFERENCES_KEY
import es.gasolineras.data.prefs.PreferencesCodec
import es.gasolineras.data.prefs.PreferencesStore
import es.gasolineras.data.prefs.loadPreferences
import es.gasolineras.data.prefs.savePreferences
import es.gasolineras.data.storage.MemoryStorage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PreferencesTest {
    /** Exactly what the original single-file web app saved. */
    private val v1 = """
        {"fuel":"GASOLEO_A","antiguedad":"MAS_X","antiguedadDias":5,"searchRadius":25,"radius":4.5,
         "soloRuta":true,"sortByRealCost":true,"brands":["REPSOL","CEPSA"],
         "discounts":{"REPSOL":{"tipo":"CTS","valor":5},"CEPSA":{"tipo":"PCT","valor":3}},
         "cars":[{"id":"car_1","nombre":"SEAT León","fuel":"GASOLINA_95","deposito":50,"consumo":6.2},
                 {"id":"car_2","nombre":"Furgoneta","fuel":"GASOLEO_A","deposito":70,"consumo":8.5}],
         "activeCarId":"car_2"}
    """.trimIndent()

    private fun json(s: String) = Json.parseToJsonElement(s)

    private val migrated = Preferences(
        fuel = FuelType.GASOLEO_A,
        ageFilterOption = AgeFilterOption.MORE_THAN_CUSTOM,
        ageFilterCustomDays = 5,
        searchRadiusKm = 25.0,
        routeDetourKm = 4.5,
        routeOnly = true,
        sortByTotalCost = true,
        brands = linkedSetOf("REPSOL", "CEPSA"),
        discounts = mapOf("REPSOL" to Discount(DiscountType.CTS, 5.0), "CEPSA" to Discount(DiscountType.PCT, 3.0)),
        cars = listOf(
            Car("car_1", "SEAT León", FuelType.GASOLINA_95, 50.0, 6.2),
            Car("car_2", "Furgoneta", FuelType.GASOLEO_A, 70.0, 8.5),
        ),
        activeCarId = "car_2",
        locale = null,
    )

    @Test fun `converts every field of the original format`() = assertEquals(migrated, PreferencesCodec.migrateV1(json(v1)))

    @Test fun `turns an empty v1 object into defaults`() = assertEquals(Preferences.DEFAULT, PreferencesCodec.migrateV1(json("{}")))

    @Test fun `replaces invalid values with defaults`() {
        val p = PreferencesCodec.sanitize(
            json("""{"fuel":"KEROSENO","ageFilterOption":"NOPE","ageFilterCustomDays":"abc","searchRadiusKm":-3,"routeDetourKm":"x","routeOnly":"yes","brands":["OK",7,null],"locale":"fr"}"""),
        )
        assertEquals(FuelType.GASOLINA_95, p.fuel)
        assertEquals(AgeFilterOption.ALL, p.ageFilterOption)
        assertEquals(3, p.ageFilterCustomDays)
        assertEquals(15.0, p.searchRadiusKm, 0.0)
        assertEquals(3.0, p.routeDetourKm, 0.0)
        assertFalse(p.routeOnly)
        assertEquals(setOf("OK"), p.brands)
        assertNull(p.locale)
    }

    @Test fun `clamps numbers to the ranges the controls allow`() {
        val p = PreferencesCodec.sanitize(json("""{"ageFilterCustomDays":40,"searchRadiusKm":500,"routeDetourKm":0.2}"""))
        assertEquals(10, p.ageFilterCustomDays)
        assertEquals(50.0, p.searchRadiusKm, 0.0)
        assertEquals(1.0, p.routeDetourKm, 0.0)
    }

    @Test fun `drops invalid cars and discounts but keeps the valid ones`() {
        val p = PreferencesCodec.sanitize(
            json(
                """{"cars":[{"id":"a","name":"Ok","fuel":"GLP","tankLitres":40,"consumptionL100km":7},
                {"id":"b","name":"","fuel":"GLP","tankLitres":40,"consumptionL100km":7},
                {"id":"c","name":"Bad fuel","fuel":"XX","tankLitres":40,"consumptionL100km":7},
                {"id":"d","name":"Zero tank","fuel":"GLP","tankLitres":0,"consumptionL100km":7},"garbage"],
                "discounts":{"A":{"type":"CTS","value":2},"B":{"type":"EUR","value":2},"C":{"type":"PCT","value":0}}}""",
            ),
        )
        assertEquals(listOf("a"), p.cars.map { it.id })
        assertEquals(listOf("A"), p.discounts.keys.toList())
    }

    @Test fun `upgrades v2 preferences (Spanish age-filter codes) to v3 options`() {
        val v3 = json(PreferencesCodec.encode(PreferencesCodec.migrateV1(json(v1)))) as JsonObject
        val v2 = JsonObject(v3 - "ageFilterOption" + mapOf("schemaVersion" to json("2"), "ageFilterPreset" to json("\"EXACTO_2\"")))
        val p = PreferencesCodec.sanitize(v2)
        assertEquals(AgeFilterOption.EXACTLY_2, p.ageFilterOption)
        assertEquals(2, p.cars.size)
    }

    @Test fun `is idempotent and encodes in the web format`() {
        val once = PreferencesCodec.migrateV1(json(v1))
        assertEquals(once, PreferencesCodec.sanitize(json(PreferencesCodec.encode(once))))
        val encoded = json(PreferencesCodec.encode(Preferences.DEFAULT.copy(locale = AppLocale.EN))) as JsonObject
        assertEquals(json("3"), encoded["schemaVersion"])
        assertEquals(json("\"all\""), encoded["ageFilterOption"])
        assertEquals(json("\"en\""), encoded["locale"])
        assertEquals(json("null"), encoded["activeCarId"])
    }

    @Test fun `returns defaults when nothing is stored`() = assertEquals(Preferences.DEFAULT, loadPreferences(MemoryStorage()))

    @Test fun `migrates the original app's preferences on first load, without deleting them`() {
        val storage = MemoryStorage()
        storage.setItem(LEGACY_PREFERENCES_KEY, v1)
        val prefs = loadPreferences(storage)
        assertEquals(2, prefs.cars.size)
        assertEquals(Discount(DiscountType.CTS, 5.0), prefs.discounts["REPSOL"])
        assertEquals(v1, storage.getItem(LEGACY_PREFERENCES_KEY))
    }

    @Test fun `prefers the current format once it has been saved`() {
        val storage = MemoryStorage()
        storage.setItem(LEGACY_PREFERENCES_KEY, v1)
        savePreferences(storage, migrated.copy(fuel = FuelType.GLP))
        assertEquals(FuelType.GLP, loadPreferences(storage).fuel)
    }

    @Test fun `survives corrupted JSON`() {
        val storage = MemoryStorage()
        storage.setItem(LEGACY_PREFERENCES_KEY, "{oops")
        assertEquals(Preferences.DEFAULT, loadPreferences(storage))
        storage.setItem(PREFERENCES_KEY, "null")
        assertEquals(Preferences.DEFAULT, loadPreferences(storage))
    }

    @Test fun `round-trips`() {
        val storage = MemoryStorage()
        assertTrue(savePreferences(storage, migrated))
        assertEquals(migrated, loadPreferences(storage))
    }

    @Test fun `reports failure instead of throwing when storage is full`() =
        assertFalse(savePreferences(MemoryStorage(10), migrated))

    @Test fun `the store saves every change and reloads it`() {
        val storage = MemoryStorage()
        val store = PreferencesStore(storage)
        assertTrue(store.update { it.copy(searchRadiusKm = 30.0, locale = AppLocale.ES) })
        assertEquals(30.0, store.preferences.value.searchRadiusKm, 0.0)
        assertEquals(30.0, PreferencesStore(storage).preferences.value.searchRadiusKm, 0.0)
        assertEquals(AppLocale.ES, PreferencesStore(storage).preferences.value.locale)
    }
}
