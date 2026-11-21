package es.gasolineras.diagnostics

import es.gasolineras.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException

/** A station as far as the diagnostics need it. */
data class ProbeStation(
    val id: String,
    val name: String,
    val lat: Double,
    val lon: Double,
    /** Gasóleo A €/l, used to colour the map test. */
    val price: Double?,
)

/** Outcome of one HTTPS request made by a probe. */
data class HttpProbeResult(
    val ok: Boolean,
    val httpCode: Int? = null,
    val bytes: Long? = null,
    val elapsedMs: Long = 0,
    val tlsVersion: String? = null,
    val cipherSuite: String? = null,
    /** Subject ← issuer of each certificate the server sent. */
    val certificates: List<String> = emptyList(),
    val errorType: String? = null,
    val errorMessage: String? = null,
    /** True when the failure is a TLS/certificate problem (the Phase 0 question). */
    val tlsError: Boolean = false,
)

data class MitecoProbeResult(
    val http: HttpProbeResult,
    val stations: List<ProbeStation> = emptyList(),
    val bulletinDate: String? = null,
    val parseError: String? = null,
) {
    val ok: Boolean get() = http.ok && parseError == null && stations.isNotEmpty()
}

/** MITECO JSON: Spanish field names, decimal commas, everything a string. */
fun parseMitecoStations(body: String): Pair<String?, List<ProbeStation>> {
    val root = JSONObject(body)
    val list = root.optJSONArray("ListaEESSPrecio") ?: return root.optString("Fecha") to emptyList()
    val stations = (0 until list.length()).mapNotNull { i ->
        val raw = list.getJSONObject(i)
        val lat = parseSpanishNumber(raw.optString("Latitud")) ?: return@mapNotNull null
        val lon = parseSpanishNumber(raw.optString("Longitud (WGS84)")) ?: return@mapNotNull null
        ProbeStation(
            id = raw.optString("IDEESS").ifEmpty { "$lat,$lon" },
            name = raw.optString("Rótulo"),
            lat = lat,
            lon = lon,
            price = parseSpanishNumber(raw.optString("Precio Gasoleo A")),
        )
    }
    return root.optString("Fecha").takeIf { it.isNotEmpty() } to stations
}

fun parseSpanishNumber(text: String?): Double? =
    text?.trim()?.takeIf { it.isNotEmpty() }?.replace(',', '.')?.toDoubleOrNull()

class NetworkProbes(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build(),
) {
    suspend fun miteco(provinceCode: String = "28"): MitecoProbeResult {
        var body: String? = null
        val http = get(MITECO_PROVINCE_URL + provinceCode) { body = it }
        val text = body ?: return MitecoProbeResult(http)
        return try {
            val (date, stations) = withContext(Dispatchers.Default) { parseMitecoStations(text) }
            MitecoProbeResult(http, stations, date, if (stations.isEmpty()) "no stations in response" else null)
        } catch (e: Exception) {
            MitecoProbeResult(http, parseError = "${e.javaClass.simpleName}: ${e.message}")
        }
    }

    suspend fun mapTiles(): HttpProbeResult = get(OPENFREEMAP_STYLE_URL) {}

    private suspend fun get(url: String, onBody: (String) -> Unit): HttpProbeResult =
        withContext(Dispatchers.IO) {
            val start = System.nanoTime()
            fun elapsed() = (System.nanoTime() - start) / 1_000_000
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .header("User-Agent", "Gasolineras-Android/${BuildConfig.VERSION_NAME}")
                .build()
            try {
                client.newCall(request).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    if (response.isSuccessful) onBody(text)
                    val handshake = response.handshake
                    HttpProbeResult(
                        ok = response.isSuccessful,
                        httpCode = response.code,
                        bytes = text.toByteArray().size.toLong(),
                        elapsedMs = elapsed(),
                        tlsVersion = handshake?.tlsVersion?.javaName,
                        cipherSuite = handshake?.cipherSuite?.javaName,
                        certificates = handshake?.peerCertificates.orEmpty()
                            .filterIsInstance<X509Certificate>()
                            .map { "${it.subjectX500Principal.name} ← ${it.issuerX500Principal.name}" },
                        errorType = if (response.isSuccessful) null else "HTTP",
                        errorMessage = if (response.isSuccessful) null else "HTTP ${response.code}",
                    )
                }
            } catch (e: Exception) {
                HttpProbeResult(
                    ok = false,
                    elapsedMs = elapsed(),
                    errorType = e.javaClass.simpleName,
                    errorMessage = e.message,
                    tlsError = e.causes().any { it is SSLException || it is CertificateException },
                )
            }
        }

    companion object {
        const val MITECO_PROVINCE_URL =
            "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/"
        const val OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"
    }
}

private fun Throwable.causes(): Sequence<Throwable> = generateSequence(this) { it.cause }
