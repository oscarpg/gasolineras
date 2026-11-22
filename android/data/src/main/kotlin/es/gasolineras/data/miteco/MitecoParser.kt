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
import java.time.LocalDate

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

private val XML_STATION = Regex("""<EESSPrecio>(.*?)</EESSPrecio>""", RegexOption.DOT_MATCHES_ALL)
private val XML_FIELD = Regex("""<([^\s/>]+)\s*/>|<([^\s/>]+)>([^<]*)</\2\s*>""")
private val XML_FECHA = Regex("""<Fecha>([^<]*)</Fecha>""")
private val XML_ENTITY = Regex("""&(#x[0-9A-Fa-f]+|#\d+|amp|lt|gt|quot|apos);""")

private fun decodeXmlText(text: String): String = XML_ENTITY.replace(text) { m ->
    when (val e = m.groupValues[1]) {
        "amp" -> "&"
        "lt" -> "<"
        "gt" -> ">"
        "quot" -> "\""
        "apos" -> "'"
        else -> if (e.startsWith("#x")) String(Character.toChars(e.drop(2).toInt(16))) else String(Character.toChars(e.drop(1).toInt()))
    }
}

/**
 * MITECO's XML format, converted to the same shape as the JSON one.
 *
 * MITECO's XML is flat and fixed (stations of leaf elements), so it is read with a small
 * dedicated scanner instead of the platform DOM parser: identical behaviour on the JVM and
 * Android (whose built-in parser rejects this file), and no DTD/entity expansion at all.
 */
fun parseMitecoXml(text: String): MitecoPayload {
    require(text.trimStart().startsWith("<")) { "Malformed XML" }
    val stations = XML_STATION.findAll(text).map { station ->
        XML_FIELD.findAll(station.groupValues[1]).associate { m ->
            val selfClosing = m.groupValues[1]
            if (selfClosing.isNotEmpty()) {
                decodeXmlTagName(selfClosing) to ""
            } else {
                decodeXmlTagName(m.groupValues[2]) to decodeXmlText(m.groupValues[3])
            }
        }
    }.toList()
    require(stations.isNotEmpty()) { "XML contains no stations" }
    return MitecoPayload(fecha = XML_FECHA.find(text)?.groupValues?.get(1)?.let(::decodeXmlText).orEmpty(), stations = stations)
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
