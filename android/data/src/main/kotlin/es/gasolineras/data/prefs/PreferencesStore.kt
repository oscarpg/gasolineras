package es.gasolineras.data.prefs

import es.gasolineras.core.domain.Preferences
import es.gasolineras.data.storage.KeyValueStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** Storage key for the current preferences format (same as the web app). */
const val PREFERENCES_KEY = "gasolineras.preferences"

/** Key used by the original single-file web app (format v1). Read once to migrate, never written. */
const val LEGACY_PREFERENCES_KEY = "gasolineras_prefs"

/**
 * Loads preferences: the current format if present, otherwise the original app's format
 * (migrated), otherwise defaults. Never throws.
 */
fun loadPreferences(storage: KeyValueStorage): Preferences {
    PreferencesCodec.parse(runCatching { storage.getItem(PREFERENCES_KEY) }.getOrNull())?.let {
        return PreferencesCodec.sanitize(it)
    }
    PreferencesCodec.parse(runCatching { storage.getItem(LEGACY_PREFERENCES_KEY) }.getOrNull())?.let {
        return PreferencesCodec.migrateV1(it)
    }
    return Preferences.DEFAULT
}

/** Saves preferences (validated). Returns false if storage is unavailable or full. */
fun savePreferences(storage: KeyValueStorage, preferences: Preferences): Boolean = try {
    val clean = PreferencesCodec.sanitize(PreferencesCodec.parse(PreferencesCodec.encode(preferences)))
    storage.setItem(PREFERENCES_KEY, PreferencesCodec.encode(clean))
    true
} catch (e: Exception) {
    false
}

/** The app's preferences as observable state, saved on every change. */
class PreferencesStore(private val storage: KeyValueStorage) {
    private val state = MutableStateFlow(loadPreferences(storage))
    val preferences: StateFlow<Preferences> = state.asStateFlow()

    /** Applies [change] and saves. Returns false if saving failed (the change still applies in memory). */
    @Synchronized
    fun update(change: (Preferences) -> Preferences): Boolean {
        state.update(change)
        return savePreferences(storage, state.value)
    }
}
