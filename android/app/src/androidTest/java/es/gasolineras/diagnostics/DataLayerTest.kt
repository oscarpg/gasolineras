package es.gasolineras.diagnostics

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import es.gasolineras.data.Endpoints
import es.gasolineras.data.http.OkHttpHttpClient
import es.gasolineras.data.miteco.parseMitecoJson
import es.gasolineras.data.miteco.parseMitecoText
import es.gasolineras.data.miteco.parseMitecoXml
import es.gasolineras.data.miteco.toStations
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** The :data module on Android's own runtime (its XML parser and TLS stack differ from the JVM's). */
@RunWith(AndroidJUnit4::class)
class DataLayerTest {
    private fun asset(name: String) =
        InstrumentationRegistry.getInstrumentation().context.assets.open(name).bufferedReader().use { it.readText() }

    @Test
    fun xmlAndJsonFixturesGiveTheSameStationsOnAndroid() {
        val fromJson = toStations(parseMitecoJson(asset("miteco-province-28.json")), "28")
        val fromXml = toStations(parseMitecoXml(asset("miteco-province-28.xml")), "28")
        assertTrue(fromJson.isNotEmpty())
        assertEquals(fromJson, fromXml)
    }

    @Test
    fun liveMitecoParsesInBothFormats() = runBlocking {
        val http = OkHttpHttpClient(OkHttpClient(), "Gasolineras-Android-test")
        val url = Endpoints.MITECO_PROVINCE + "28"
        val json = runCatching { http.get(url, mapOf("Accept" to "application/json")).body }.getOrNull()
        val default = runCatching { http.get(url).body }.getOrNull()
        assumeTrue("MITECO not reachable from CI", json != null && default != null)
        val a = toStations(parseMitecoText(json!!.trim()), "28")
        val b = toStations(parseMitecoText(default!!.trim()), "28")
        Log.i("GasolinerasDiag", "Live MITECO: JSON ${a.size} stations, default format (${default.trim().take(1)}…) ${b.size} stations")
        assertTrue(a.isNotEmpty())
        assertTrue(b.isNotEmpty())
    }
}
