package es.gasolineras.data

import es.gasolineras.data.http.HttpClient
import es.gasolineras.data.http.HttpError
import es.gasolineras.data.http.HttpResponse
import java.io.IOException

fun fixture(name: String): String =
    requireNotNull(object {}.javaClass.classLoader.getResource(name)) { "missing fixture $name" }.readText()

/** A fake HttpClient that answers by URL substring and records every call (port of tests/helpers.ts fakeFetch). */
class FakeHttp(private val routes: Map<String, (String) -> HttpResponse>) : HttpClient {
    val calls = mutableListOf<String>()

    override suspend fun get(url: String, headers: Map<String, String>, allowHttpErrors: Boolean): HttpResponse {
        calls += url
        val handler = routes.entries.firstOrNull { url.contains(it.key) }?.value ?: throw IOException("Failed to fetch $url")
        val response = handler(url)
        if (!response.isSuccessful && !allowHttpErrors) throw HttpError(response.status, url)
        return response
    }

    companion object {
        fun ok(body: String): (String) -> HttpResponse = { HttpResponse(200, body) }
    }
}

/** A station in MITECO's raw format (Spanish fields, decimal commas). Port of rawStation(). */
fun rawStation(i: Int, overrides: Map<String, String> = emptyMap()): Map<String, String> = mapOf(
    "IDEESS" to (1000 + i).toString(),
    "Rótulo" to listOf("REPSOL", "CEPSA", "BALLENOIL")[i % 3],
    "Dirección" to "CALLE EJEMPLO $i",
    "Localidad" to "MADRID",
    "Provincia" to "MADRID",
    "Latitud" to "40,41$i",
    "Longitud (WGS84)" to "-3,70$i",
    "Horario" to "L-D: 24H",
    "Precio Gasolina 95 E5" to "1,5${i}9",
    "Precio Gasoleo A" to (if (i % 2 == 1) "" else "1,4${i}9"),
    "Precio Gasolina 98 E5" to "1,659",
    "Precio Gasoleo Premium" to "",
    "Precio Gases licuados del petróleo" to "",
    "Precio Gas natural comprimido" to "",
    "Precio Gas natural licuado" to "",
) + overrides

private fun jsonString(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

fun payloadJson(stations: List<Map<String, String>>, fecha: String? = "21/11/2026 9:05:12"): String =
    buildString {
        append("{")
        if (fecha != null) append("\"Fecha\":${jsonString(fecha)},")
        append("\"ListaEESSPrecio\":[")
        append(stations.joinToString(",") { s -> s.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${jsonString(it.value)}" } })
        append("],\"ResultadoConsulta\":\"OK\"}")
    }

fun samplePayload(count: Int = 3) = payloadJson((0 until count).map { rawStation(it) })
