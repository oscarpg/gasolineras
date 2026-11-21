package es.gasolineras

import android.app.Application

class GasolinerasApp : Application() {
    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        // Drop expired price files left from previous days.
        Thread { runCatching { container.cache.purgeExpired() } }.start()
    }
}
