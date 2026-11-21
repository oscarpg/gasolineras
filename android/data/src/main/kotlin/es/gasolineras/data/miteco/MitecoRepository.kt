package es.gasolineras.data.miteco

import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.HistoryPrices
import es.gasolineras.core.domain.Station
import es.gasolineras.data.Endpoints
import es.gasolineras.data.http.DownloadAttempt
import es.gasolineras.data.http.HttpClient
import es.gasolineras.data.http.fetchWithFallback
import es.gasolineras.data.storage.Cache
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

private const val DAY_MS = 24L * 60 * 60 * 1000

/**
 * MITECO prices with a daily cache. Port of services/miteco.ts.
 * No CORS on Android, so the attempts are only: JSON, then whatever MITECO sends by default (XML).
 */
class MitecoRepository(
    private val cache: Cache,
    private val attempts: List<DownloadAttempt>,
    private val now: () -> LocalDateTime = LocalDateTime::now,
    /** Runs shared downloads, so one caller giving up doesn't cancel the others. */
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    private val onAttemptFailed: (String) -> Unit = {},
) {
    constructor(http: HttpClient, cache: Cache, now: () -> LocalDateTime = LocalDateTime::now) :
        this(cache, defaultAttempts(http), now)

    private val mutex = Mutex()
    private val inFlight = HashMap<String, Deferred<Any?>>()

    /** Runs [task] once per key at a time: concurrent callers share the same request. */
    @Suppress("UNCHECKED_CAST")
    private suspend fun <T> once(key: String, task: suspend () -> T): T {
        val deferred = mutex.withLock {
            inFlight.getOrPut(key) {
                scope.async {
                    try {
                        task()
                    } finally {
                        mutex.withLock { inFlight.remove(key) }
                    }
                }
            }
        }
        return deferred.await() as T
    }

    /** Local calendar day: MITECO publishes by Spanish date, not UTC. */
    private fun dayKey() = now().format(DateTimeFormatter.ISO_LOCAL_DATE)
    private fun stationsKey(code: String) = "stations:$code:${dayKey()}"
    private fun historyKey(code: String, date: String) = "history:$code:$date"

    private fun cachedStations(code: String): List<Station>? =
        cache.get(stationsKey(code), STATIONS)?.takeIf { it.isNotEmpty() }

    /** Whether today's prices for the province are already cached (no download needed). */
    fun hasCachedProvince(code: String): Boolean = cachedStations(code) != null

    /** Today's stations for a province; downloaded at most once a day unless [force] is set. */
    suspend fun getProvinceStations(code: String, force: Boolean = false): List<Station> {
        if (!force) cachedStations(code)?.let { return it }
        return once("stations:$code") {
            val payload = fetchWithFallback(Endpoints.MITECO_PROVINCE + code, ::parseMitecoText, attempts, onAttemptFailed)
            val stations = toStations(payload, code, now().toLocalDate())
            if (stations.isNotEmpty()) cache.set(stationsKey(code), stations, STATIONS, ttlMs = 2 * DAY_MS)
            stations
        }
    }

    /** Prices a province had on a past day (`dd-mm-yyyy`). Past days never change, so they're cached. */
    suspend fun getHistoryDay(code: String, date: String): HistoryPrices {
        val key = historyKey(code, date)
        cache.get(key, HISTORY)?.let { return it }
        return once(key) {
            val payload = fetchWithFallback("${Endpoints.MITECO_PROVINCE_HISTORY}$date/$code", ::parseMitecoText, attempts, onAttemptFailed)
            toHistoryPrices(payload).also { cache.set(key, it, HISTORY, ttlMs = 15 * DAY_MS) }
        }
    }

    companion object {
        private val STATIONS = ListSerializer(Station.serializer())
        private val HISTORY = MapSerializer(String.serializer(), MapSerializer(FuelType.serializer(), Double.serializer()))

        fun defaultAttempts(http: HttpClient): List<DownloadAttempt> = listOf(
            { url -> http.get(url, mapOf("Accept" to "application/json")).body },
            { url -> http.get(url).body },
        )
    }
}
