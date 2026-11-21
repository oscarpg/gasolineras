package es.gasolineras.data.miteco

import es.gasolineras.core.domain.FuelPrices
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.HistoryPrices
import es.gasolineras.core.domain.Station
import es.gasolineras.core.domain.parseSpanishNumber
import es.gasolineras.core.domain.toMitecoDate
import es.gasolineras.data.http.LenientJson
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.w3c.dom.Element
import org.w3c.dom.Node
import java.io.ByteArrayInputStream
import java.time.LocalDate
import javax.xml.parsers.DocumentBuilderFactory

/** One station as MITECO sends it: Spanish field names, decimal commas, everything a string. */
typealias RawMitecoStation = Map<String, String>

data class MitecoPayload(val fecha: String?, val stations: List<RawMitecoStation>)

/* ---------- parsing (pure) ---------- */

private val XML_ESCAPE = Regex("_x([0-9A-Fa-f]{4})_")

/** MITECO's XML escapes characters in tag names as `_xHHHH_` (e.g. `Rótulo` → `R_x00F3_tulo`). */
fun decodeXmlTagName(tag: String): String =
    XML_ESCAPE.replace(tag) { it.groupValues[1].toInt(16).toChar().toString() }

/** MITECO's JSON format. */
fun parseMitecoJson(text: String): MitecoPayload {
    val root = LenientJson.parseToJsonElement(text).jsonObject
    val list = root["ListaEESSPrecio"]?.takeIf { it !is JsonNull }?.jsonArray.orEmpty()
    return MitecoPayload(
        fecha = (root["Fecha"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
        stations = list.map { item ->
            (item as JsonObject).mapNotNull { (k, v) -> (v as? JsonPrimitive)?.takeIf { it.isString }?.let { k to it.content } }.toMap()
        },
    )
}

/** MITECO's XML format, converted to the same shape as the JSON one. */
fun parseMitecoXml(text: String): MitecoPayload {
    val factory = DocumentBuilderFactory.newInstance().apply {
        isNamespaceAware = false
        isExpandEntityReferences = false
        // Not every platform parser supports these; best effort against XXE.
        runCatching { setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
        runCatching { setFeature("http://xml.org/sax/features/external-general-entities", false) }
    }
    val doc = try {
        factory.newDocumentBuilder().parse(ByteArrayInputStream(text.toByteArray(Charsets.UTF_8)))
    } catch (e: Exception) {
        throw IllegalArgumentException("Malformed XML", e)
    }
    val items = doc.getElementsByTagName("EESSPrecio")
    require(items.length > 0) { "XML contains no stations" }
    return MitecoPayload(
        fecha = doc.getElementsByTagName("Fecha").item(0)?.textContent.orEmpty(),
        stations = (0 until items.length).map { i ->
            val el = items.item(i) as Element
            val children = el.childNodes
            (0 until children.length)
                .map { children.item(it) }
                .filter { it.nodeType == Node.ELEMENT_NODE }
                .associate { decodeXmlTagName((it as Element).tagName) to it.textContent.orEmpty() }
        },
    )
}

/** A MITECO response body, which can be JSON or XML depending on the Accept header honoured. */
fun parseMitecoText(text: String): MitecoPayload =
    if (text.startsWith("<")) parseMitecoXml(text) else parseMitecoJson(text)

private val FIELD_KEYS = FuelType.entries.map { it to it.mitecoField.lowercase() }

/** Prices by fuel, matching MITECO field names case-insensitively. Fuels without a price are absent. */
private fun readPrices(raw: RawMitecoStation): FuelPrices {
    val byLowerKey = raw.mapKeys { it.key.lowercase() }
    return FIELD_KEYS.mapNotNull { (fuel, key) -> parseSpanishNumber(byLowerKey[key])?.let { fuel to it } }.toMap()
}

/** Normalises a province's current-prices payload into Stations. Stations without valid coordinates are dropped. */
fun toStations(payload: MitecoPayload, provinceCode: String, today: LocalDate = LocalDate.now()): List<Station> {
    val bulletinDate = payload.fecha.orEmpty().split(" ").first().ifEmpty { toMitecoDate(today) }
    return payload.stations.mapNotNull { raw ->
        val lat = parseSpanishNumber(raw["Latitud"]) ?: return@mapNotNull null
        val lon = parseSpanishNumber(raw["Longitud (WGS84)"]) ?: return@mapNotNull null
        val idPrefix = raw["IDEESS"]?.takeIf { it.isNotEmpty() } ?: raw["Rótulo"] ?: "undefined"
        Station(
            id = "$idPrefix-${raw["Latitud"]}-${raw["Longitud (WGS84)"]}",
            code = raw["IDEESS"].orEmpty(),
            provinceCode = provinceCode,
            bulletinDate = bulletinDate,
            name = raw["Rótulo"].orEmpty(),
            address = listOfNotNull(raw["Dirección"], raw["Localidad"], raw["Provincia"]).filter { it.isNotEmpty() }.joinToString(", "),
            lat = lat,
            lon = lon,
            openingHours = raw["Horario"].orEmpty(),
            prices = readPrices(raw),
        )
    }
}

/** Normalises a historical-prices payload: station code → the prices it had (only fuels it sold). */
fun toHistoryPrices(payload: MitecoPayload): HistoryPrices {
    val result = LinkedHashMap<String, FuelPrices>()
    for (raw in payload.stations) {
        val code = raw["IDEESS"]?.takeIf { it.isNotEmpty() } ?: continue
        result[code] = readPrices(raw)
    }
    return result
}
