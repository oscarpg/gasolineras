package es.gasolineras

import android.app.Application
import android.os.StrictMode

class GasolinerasApp : Application() {
    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            // Debug builds log (never crash on) disk or network work on the main thread and leaks.
            StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder().detectDiskReads().detectDiskWrites().detectNetwork().penaltyLog().build())
            StrictMode.setVmPolicy(StrictMode.VmPolicy.Builder().detectLeakedClosableObjects().detectActivityLeaks().penaltyLog().build())
        }
        // Drop expired price files left from previous days.
        Thread { runCatching { container.cache.purgeExpired() } }.start()
    }
}
