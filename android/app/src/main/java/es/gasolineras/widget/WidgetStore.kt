package es.gasolineras.widget

import android.content.Context
import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.LatLng
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** One station as the widget shows it. */
data class WidgetItem(
    val id: String,
    val brand: String,
    val price: Double,
    val distanceKm: Double?,
    /** Hue of the green→red price scale. */
    val hue: Int,
)

/** What the widget shows, saved so it can be drawn without network or location. */
data class WidgetSnapshot(
    val state: State,
    val fuel: FuelType,
    val items: List<WidgetItem> = emptyList(),
    /** When the prices were computed (epoch ms). */
    val updatedAt: Long = 0,
) {
    enum class State { READY, NO_ORIGIN, NO_DATA }
}

/**
 * Small JSON files in filesDir: the last origin the app used (widgets can't get a fresh fix in
 * the background without the "all the time" location permission) and the last snapshot.
 */
class WidgetStore(context: Context) {
    private val dir = File(context.filesDir, "widget").apply { mkdirs() }
    private val originFile = File(dir, "origin.json")
    private val snapshotFile = File(dir, "snapshot.json")

    fun saveOrigin(p: LatLng) = write(originFile, JSONObject().put("lat", p.lat).put("lon", p.lon).toString())

    fun readOrigin(): LatLng? = read(originFile)?.let { runCatching { JSONObject(it).let { o -> LatLng(o.getDouble("lat"), o.getDouble("lon")) } }.getOrNull() }

    fun saveSnapshot(s: WidgetSnapshot) {
        val items = JSONArray()
        s.items.forEach { i ->
            items.put(
                JSONObject().put("id", i.id).put("brand", i.brand).put("price", i.price).put("hue", i.hue)
                    .put("km", i.distanceKm ?: JSONObject.NULL),
            )
        }
        write(snapshotFile, JSONObject().put("state", s.state.name).put("fuel", s.fuel.name).put("updatedAt", s.updatedAt).put("items", items).toString())
    }

    fun readSnapshot(): WidgetSnapshot? = read(snapshotFile)?.let { text ->
        runCatching {
            val o = JSONObject(text)
            val items = o.getJSONArray("items")
            WidgetSnapshot(
                state = WidgetSnapshot.State.valueOf(o.getString("state")),
                fuel = FuelType.fromId(o.getString("fuel")) ?: FuelType.DEFAULT,
                updatedAt = o.getLong("updatedAt"),
                items = (0 until items.length()).map { k ->
                    val i = items.getJSONObject(k)
                    WidgetItem(i.getString("id"), i.getString("brand"), i.getDouble("price"), if (i.isNull("km")) null else i.getDouble("km"), i.getInt("hue"))
                },
            )
        }.getOrNull()
    }

    private fun read(f: File): String? = runCatching { f.takeIf { it.isFile }?.readText() }.getOrNull()

    private fun write(f: File, text: String) {
        runCatching {
            val tmp = File(f.parentFile, f.name + ".tmp")
            tmp.writeText(text)
            if (!tmp.renameTo(f)) {
                f.delete()
                tmp.renameTo(f)
            }
        }
    }
}
