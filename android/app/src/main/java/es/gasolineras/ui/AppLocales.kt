package es.gasolineras.ui

import android.app.Activity
import android.app.LocaleManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import es.gasolineras.core.domain.AppLocale
import es.gasolineras.data.prefs.loadPreferences
import es.gasolineras.data.storage.FileStorage
import java.io.File
import java.util.Locale

/**
 * Per-app language. Android 13+ uses the system's per-app language (also editable in system
 * settings); older versions wrap the activity's context with the saved language.
 */
object AppLocales {
    fun savedLocale(context: Context): AppLocale? =
        runCatching { loadPreferences(FileStorage(File(context.filesDir, "preferences"))).locale }.getOrNull()

    /** For Activity.attachBaseContext on Android 12 and older. */
    fun wrap(base: Context): Context {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return base
        val locale = savedLocale(base)?.let { Locale.forLanguageTag(it.tag) } ?: return base
        Locale.setDefault(locale)
        val config = Configuration(base.resources.configuration).apply { setLocale(locale) }
        return base.createConfigurationContext(config)
    }

    /** Applies a newly chosen language (null = follow the system). */
    fun apply(activity: Activity, locale: AppLocale?) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.getSystemService(LocaleManager::class.java).applicationLocales =
                if (locale == null) LocaleList.getEmptyLocaleList() else LocaleList.forLanguageTags(locale.tag)
        } else {
            activity.recreate()
        }
    }

    /** The language set in system settings for this app (Android 13+), to keep preferences in sync. */
    fun systemChoice(context: Context): AppLocale? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
        val tag = context.getSystemService(LocaleManager::class.java).applicationLocales.get(0)?.language ?: return null
        return AppLocale.entries.firstOrNull { it.tag == tag }
    }
}
