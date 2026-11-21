package es.gasolineras.diagnostics

import java.util.Locale

/** Device facts included in the report. */
data class DeviceInfo(
    val manufacturer: String,
    val model: String,
    val androidRelease: String,
    val sdkInt: Int,
    val locale: String,
    val appVersion: String,
)

/**
 * Plain-text report the tester copies and sends back. Always English and technical:
 * it's read by developers, not shown as UI copy.
 */
object DiagnosticsReport {

    fun device(d: DeviceInfo): String =
        "Device: ${d.manufacturer} ${d.model} · Android ${d.androidRelease} (API ${d.sdkInt}) · ${d.locale}"

    fun miteco(r: MitecoProbeResult): String = buildString {
        append("MITECO: ")
        append(if (r.ok) "OK" else "FAIL")
        if (r.ok) {
            append(" · ${r.stations.size} stations")
            r.bulletinDate?.let { append(" · bulletin $it") }
        }
        r.parseError?.let { append(" · parse error: $it") }
        append(" · ").append(http(r.http))
    }

    fun mapTiles(r: HttpProbeResult): String = "OpenFreeMap: ${if (r.ok) "OK" else "FAIL"} · ${http(r)}"

    fun location(r: LocationProbeResult): String = buildString {
        append("Location: ${if (r.ok) "OK" else "FAIL"} · permission ${r.permission} · Play services ${r.playServices}")
        if (r.ok) {
            append(" · fix ${seconds(r.elapsedMs)}")
            r.accuracyM?.let { append(" · ±${it.toInt()} m") }
        }
        r.error?.let { append(" · $it") }
    }

    fun map(markers: Int, s: FrameStats): String = String.format(
        Locale.ROOT,
        "Map: %d markers · %.1f s · %.1f fps · %.1f%% janky frames (>%.0f ms) · worst %.0f ms",
        markers, s.durationMs / 1000.0, s.avgFps, s.jankyPercent, FrameStats.JANK_THRESHOLD_MS, s.worstFrameMs,
    )

    fun http(r: HttpProbeResult): String = buildList {
        r.httpCode?.let { add("HTTP $it") }
        r.bytes?.let { add(size(it)) }
        add("${r.elapsedMs} ms")
        listOfNotNull(r.tlsVersion, r.cipherSuite).takeIf { it.isNotEmpty() }?.let { add(it.joinToString(" ")) }
        if (r.tlsError) add("TLS ERROR")
        if (r.errorType != null && r.errorType != "HTTP") add("${r.errorType}: ${r.errorMessage}")
    }.joinToString(" · ") + r.certificates.joinToString("") { "\n  cert: $it" }

    fun full(
        device: DeviceInfo,
        miteco: MitecoProbeResult?,
        tiles: HttpProbeResult?,
        location: LocationProbeResult?,
        map: Pair<Int, FrameStats>?,
    ): String = listOf(
        "Gasolineras diagnostics ${device.appVersion}",
        device(device),
        miteco?.let(::miteco) ?: "MITECO: not run",
        tiles?.let(::mapTiles) ?: "OpenFreeMap: not run",
        location?.let(::location) ?: "Location: not run",
        map?.let { (markers, stats) -> map(markers, stats) } ?: "Map: not run",
    ).joinToString("\n")

    private fun size(bytes: Long): String = when {
        bytes >= 1_000_000 -> String.format(Locale.ROOT, "%.1f MB", bytes / 1_000_000.0)
        bytes >= 1_000 -> String.format(Locale.ROOT, "%.0f kB", bytes / 1_000.0)
        else -> "$bytes B"
    }

    private fun seconds(ms: Long) = String.format(Locale.ROOT, "%.1f s", ms / 1000.0)
}
