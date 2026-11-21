package es.gasolineras.data.geo

import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Runs tasks one at a time, at least [minIntervalMs] apart (measured between starts).
 * Used for Nominatim, whose usage policy allows at most 1 request per second.
 * A failed task doesn't block the ones queued after it.
 */
class RateLimiter(
    private val minIntervalMs: Long,
    private val now: () -> Long = System::currentTimeMillis,
    private val sleep: suspend (Long) -> Unit = { delay(it) },
) {
    private val mutex = Mutex() // fair: waiters run in arrival order
    private var lastStart: Long? = null

    suspend fun <T> schedule(task: suspend () -> T): T = mutex.withLock {
        lastStart?.let { last ->
            val wait = last + minIntervalMs - now()
            if (wait > 0) sleep(wait)
        }
        lastStart = now()
        task()
    }
}
