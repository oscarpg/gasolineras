package es.gasolineras.state

import es.gasolineras.core.domain.Preferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/**
 * Saves preferences whenever they change, debounced (sliders change many times a second).
 * Call [flush] when the app goes to the background so the last change isn't lost.
 * Port of state/persistence.ts.
 */
class PreferencesPersister(
    private val store: Store<AppState>,
    private val scope: CoroutineScope,
    private val save: (Preferences) -> Unit,
    private val delayMs: Long = 300,
) {
    private var pending: Preferences? = null
    private var timer: Job? = null
    private var watcher: Job? = null

    fun start(): PreferencesPersister {
        watcher = scope.launch {
            store.state.map { it.preferences }.distinctUntilChanged { a, b -> a === b }.drop(1).collect { prefs ->
                synchronized(this@PreferencesPersister) {
                    pending = prefs
                    timer?.cancel()
                    timer = scope.launch {
                        delay(delayMs)
                        flush()
                    }
                }
            }
        }
        return this
    }

    @Synchronized
    fun flush() {
        timer?.cancel()
        timer = null
        pending?.let {
            pending = null
            save(it)
        }
    }

    fun stop() {
        flush()
        watcher?.cancel()
    }
}
