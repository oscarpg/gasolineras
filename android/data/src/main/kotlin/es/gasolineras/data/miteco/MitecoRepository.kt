package es.gasolineras.data.miteco

import es.gasolineras.core.domain.FuelType
import es.gasolineras.core.domain.HistoryPrices
import es.gasolineras.core.domain.Station
import es.gasolineras.data.Endpoints
import es.gasolineras.data.http.DownloadAttempt
import es.gasolineras.data.http.HttpClient
import es.gasolineras.data.http.fetchWithFallback
import es.gasolineras.data.storage.Cache
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

private const val DAY_MS = 24L * 60 * 60 * 1000

/** What the app state needs from MITECO (lets state tests use a fake). */
interface MitecoSource {
    fun hasCachedProvince(code: String): Boolean
    suspend fun getProvinceStations(code: String, force: Boolean = false): List<Station>
    suspend fun getHistoryDay(code: String, date: String): HistoryPrices
}

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
    /** Where cache files are read (never the main thread: a province is up to ~1 MB of JSON). */
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : MitecoSource {
    constructor(http: HttpClient, cache: Cache, now: () -> LocalDateTime = LocalDateTime::now) :
        this(cache, defaultAttempts(http), now)

    /** Decoded values recently used (today's provinces, history days), so reopening is instant. */
    private val memory = object : LinkedHashMap<String, Any>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Any>?) = size > MEMORY_ENTRIES
    }

    private fun remembered(key: String): Any? = synchronized(memory) { memory[key] }
    private fun remember(key: String, value: Any) = synchronized(memory) { memory[key] = value }

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

    @Suppress("UNCHECKED_CAST")
    private suspend fun cachedStations(code: String): List<Station>? {
        val key = stationsKey(code)
        (remembered(key) as List<Station>?)?.let { return it }
        val decoded = withContext(io) { cache.get(key, STATIONS) }?.takeIf { it.isNotEmpty() } ?: return null
        // A download may have finished meanwhile: keep a single shared instance.
        return synchronized(memory) { (memory[key] as List<Station>?) ?: decoded.also { memory[key] = it } }
    }

    /** Whether today's prices for the province are already cached (no download needed). Doesn't read the file. */
    override fun hasCachedProvince(code: String): Boolean {
        val key = stationsKey(code)
        return remembered(key) != null || cache.contains(key)
    }

    /** Today's stations for a province; downloaded at most once a day unless [force] is set. */
    override suspend fun getProvinceStations(code: String, force: Boolean): List<Station> {
        if (!force) cachedStations(code)?.let { return it }
        return once("stations:$code") {
            val payload = fetchWithFallback(Endpoints.MITECO_PROVINCE + code, ::parseMitecoText, attempts, onAttemptFailed)
            val stations = toStations(payload, code, now().toLocalDate())
            if (stations.isNotEmpty()) {
                val key = stationsKey(code)
                remember(key, stations)
                withContext(io) { cache.set(key, stations, STATIONS, ttlMs = 2 * DAY_MS) }
            }
            stations
        }
    }

    /** Prices a province had on a past day (`dd-mm-yyyy`). Past days never change, so they're cached. */
    @Suppress("UNCHECKED_CAST")
    override suspend fun getHistoryDay(code: String, date: String): HistoryPrices {
        val key = historyKey(code, date)
        (remembered(key) as HistoryPrices?)?.let { return it }
        withContext(io) { cache.get(key, HISTORY) }?.let { decoded ->
            return synchronized(memory) { (memory[key] as HistoryPrices?) ?: decoded.also { memory[key] = it } }
        }
        return once(key) {
            val payload = fetchWithFallback("${Endpoints.MITECO_PROVINCE_HISTORY}$date/$code", ::parseMitecoText, attempts, onAttemptFailed)
            toHistoryPrices(payload).also {
                remember(key, it)
                withContext(io) { cache.set(key, it, HISTORY, ttlMs = 15 * DAY_MS) }
            }
        }
    }

    companion object {
        private const val MEMORY_ENTRIES = 32
        private val STATIONS = ListSerializer(Station.serializer())
        private val HISTORY = MapSerializer(String.serializer(), MapSerializer(FuelType.serializer(), Double.serializer()))

        fun defaultAttempts(http: HttpClient): List<DownloadAttempt> = listOf(
            { url -> http.get(url, mapOf("Accept" to "application/json")).body },
            { url -> http.get(url).body },
        )
    }
}
